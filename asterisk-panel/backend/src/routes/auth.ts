import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  authenticateToken,
  requireRole,
  generateToken,
  logAccess,
  AuthenticatedRequest,
  JwtPayload,
} from '../middleware/auth';
import { logger } from '../logger';
import Database from 'better-sqlite3';

interface AuthDeps {
  amiService?: any;
  ariService?: any;
  callLogService?: any;
  trunkService?: any;
  db: Database.Database;
}

export function createRouter(deps: AuthDeps): Router {
  const router = Router();
  const { db } = deps;

  // POST /login
  router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      const user = db
        .prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?')
        .get(username) as { id: string; username: string; password_hash: string; role: 'admin' | 'operator' } | undefined;

      if (!user) {
        logAccess(null, 'login_failed', req.ip || 'unknown');
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        logAccess(user.id, 'login_failed', req.ip || 'unknown');
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
      };

      const token = generateToken(payload);

      logAccess(user.id, 'login_success', req.ip || 'unknown');
      logger.info('User logged in', { userId: user.id, username: user.username });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (err) {
      logger.error('Login error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /logout
  router.post('/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    try {
      logAccess(req.user?.userId || null, 'logout', req.ip || 'unknown');
      logger.info('User logged out', {
        userId: req.user?.userId,
        username: req.user?.username,
      });
      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      logger.error('Logout error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /me
  router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = db
        .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
        .get(req.user!.userId) as { id: string; username: string; role: string; created_at: string } | undefined;

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (err) {
      logger.error('Get current user error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /change-password
  router.post('/change-password', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { old_password, new_password } = req.body;

      if (!old_password || !new_password) {
        res.status(400).json({ error: 'old_password and new_password are required' });
        return;
      }

      if (new_password.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters' });
        return;
      }

      const user = db
        .prepare('SELECT id, password_hash FROM users WHERE id = ?')
        .get(req.user!.userId) as { id: string; password_hash: string } | undefined;

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const validOldPassword = await bcrypt.compare(old_password, user.password_hash);
      if (!validOldPassword) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      const newHash = await bcrypt.hash(new_password, 12);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

      logAccess(req.user!.userId, 'password_changed', req.ip || 'unknown');
      logger.info('Password changed', { userId: req.user!.userId, username: req.user!.username });

      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      logger.error('Change password error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /users (admin only)
  router.post(
    '/users',
    authenticateToken,
    requireRole('admin'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { username, password, role } = req.body;

        if (!username || !password) {
          res.status(400).json({ error: 'Username and password are required' });
          return;
        }

        if (password.length < 6) {
          res.status(400).json({ error: 'Password must be at least 6 characters' });
          return;
        }

        const validRoles = ['admin', 'operator'];
        const userRole = role && validRoles.includes(role) ? role : 'operator';

        const existing = db
          .prepare('SELECT id FROM users WHERE username = ?')
          .get(username) as { id: string } | undefined;

        if (existing) {
          res.status(409).json({ error: 'Username already exists' });
          return;
        }

        const id = uuidv4();
        const passwordHash = await bcrypt.hash(password, 12);

        db.prepare(
          'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
        ).run(id, username, passwordHash, userRole);

        logAccess(req.user!.userId, `user_created:${username}`, req.ip || 'unknown');
        logger.info('User created', {
          createdBy: req.user!.username,
          newUser: username,
          role: userRole,
        });

        res.status(201).json({
          user: {
            id,
            username,
            role: userRole,
          },
        });
      } catch (err) {
        logger.error('Create user error', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

export default createRouter;

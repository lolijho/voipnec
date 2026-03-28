import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { logger } from '../logger';

const JWT_SECRET = process.env.JWT_SECRET || 'asterisk-panel-secret-change-me';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

export interface JwtPayload {
  userId: string;
  username: string;
  role: 'admin' | 'operator';
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Middleware that verifies a JWT Bearer token from the Authorization header.
 * On success, attaches the decoded user payload to req.user.
 */
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('Invalid JWT token presented', {
      ip: req.ip,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }
}

/**
 * Middleware factory that restricts access to specific roles.
 * Must be used after authenticateToken.
 */
export function requireRole(...roles: Array<'admin' | 'operator'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized role access attempt', {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Generate a JWT token for a user.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY } as jwt.SignOptions);
}

/**
 * Verify a JWT token (used for Socket.io handshake).
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Log an access event to the database.
 */
export function logAccess(userId: string | null, action: string, ip: string): void {
  try {
    const db = getDatabase();
    db.prepare(
      'INSERT INTO access_logs (id, user_id, action, ip) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), userId, action, ip);
  } catch (err) {
    logger.error('Failed to log access', {
      userId,
      action,
      ip,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

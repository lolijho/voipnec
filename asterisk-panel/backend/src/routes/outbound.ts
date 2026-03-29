import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import Database from 'better-sqlite3';

interface OutboundRouteDeps {
  amiService?: any;
  ariService?: any;
  db: Database.Database;
}

export function createRouter(deps: OutboundRouteDeps): Router {
  const router = Router();
  const { db, amiService } = deps;

  // Ensure outbound_routes table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      pattern TEXT NOT NULL,
      trunk_name TEXT NOT NULL,
      priority INTEGER DEFAULT 10,
      strip_digits INTEGER DEFAULT 0,
      prepend TEXT DEFAULT '',
      callerid TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // GET / - list all outbound routes
  router.get('/', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const routes = db.prepare('SELECT * FROM outbound_routes ORDER BY priority ASC, pattern ASC').all();
      res.json({ routes });
    } catch (err) {
      logger.error('Failed to list outbound routes', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to list outbound routes' });
    }
  });

  // POST / - create outbound route
  router.post('/', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, pattern, trunk_name, priority, strip_digits, prepend, callerid, enabled } = req.body;

      if (!pattern || !trunk_name) {
        res.status(400).json({ error: 'Pattern and trunk_name are required' });
        return;
      }

      const id = require('uuid').v4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO outbound_routes (id, name, pattern, trunk_name, priority, strip_digits, prepend, callerid, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        name || '',
        pattern,
        trunk_name,
        priority || 10,
        strip_digits || 0,
        prepend || '',
        callerid || '',
        enabled !== false ? 1 : 0,
        now,
        now
      );

      await applyOutboundRoutes(db, amiService);

      logger.info('Outbound route created', { id, pattern, trunk_name });
      res.status(201).json({
        route: {
          id, name, pattern, trunk_name,
          priority: priority || 10,
          strip_digits: strip_digits || 0,
          prepend: prepend || '',
          callerid: callerid || '',
          enabled: enabled !== false,
        },
      });
    } catch (err) {
      logger.error('Failed to create outbound route', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to create outbound route' });
    }
  });

  // PUT /:id - update outbound route
  router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, pattern, trunk_name, priority, strip_digits, prepend, callerid, enabled } = req.body;

      const existing = db.prepare('SELECT * FROM outbound_routes WHERE id = ?').get(id) as any;
      if (!existing) {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE outbound_routes
        SET name = ?, pattern = ?, trunk_name = ?, priority = ?, strip_digits = ?, prepend = ?, callerid = ?, enabled = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name !== undefined ? name : existing.name,
        pattern || existing.pattern,
        trunk_name || existing.trunk_name,
        priority !== undefined ? priority : existing.priority,
        strip_digits !== undefined ? strip_digits : existing.strip_digits,
        prepend !== undefined ? prepend : existing.prepend,
        callerid !== undefined ? callerid : existing.callerid,
        enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        now,
        id
      );

      await applyOutboundRoutes(db, amiService);

      logger.info('Outbound route updated', { id });
      res.json({ message: 'Route updated' });
    } catch (err) {
      logger.error('Failed to update outbound route', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to update outbound route' });
    }
  });

  // DELETE /:id - delete outbound route
  router.delete('/:id', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM outbound_routes WHERE id = ?').run(id);
      await applyOutboundRoutes(db, amiService);

      logger.info('Outbound route deleted', { id });
      res.json({ message: 'Route deleted' });
    } catch (err) {
      logger.error('Failed to delete outbound route', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to delete outbound route' });
    }
  });

  // POST /apply - apply all routes to Asterisk
  router.post('/apply', authenticateToken, requireRole('admin'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      await applyOutboundRoutes(db, amiService);
      res.json({ message: 'Outbound routes applied to Asterisk' });
    } catch (err) {
      logger.error('Failed to apply outbound routes', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to apply outbound routes' });
    }
  });

  return router;
}

// ── Apply outbound routes to Asterisk via AMI ──────────────────────────

async function applyOutboundRoutes(db: Database.Database, amiService: any): Promise<void> {
  if (!amiService || !amiService.isConnected) {
    logger.warn('AMI not connected, cannot apply outbound routes');
    return;
  }

  const routes = db.prepare('SELECT * FROM outbound_routes WHERE enabled = 1 ORDER BY priority ASC').all() as any[];

  // Clear existing outbound-via-trunk context
  try {
    await amiService.executeAction({
      action: 'Command',
      command: 'dialplan remove context outbound-via-trunk',
    });
  } catch {
    // Context might not exist yet, that's fine
  }

  // Add each route
  for (const route of routes) {
    const pattern = route.pattern || '_X.';
    const trunkName = route.trunk_name;
    const stripDigits = route.strip_digits || 0;
    const prepend = route.prepend || '';
    const callerid = route.callerid || '';

    try {
      let priority = 1;

      // NoOp
      await amiService.executeAction({
        action: 'Command',
        command: `dialplan add extension ${pattern},${priority},NoOp(Outbound via ${trunkName}) into outbound-via-trunk`,
      });
      priority++;

      // Set CallerID if configured
      if (callerid) {
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${pattern},${priority},Set(CALLERID(num)=${callerid}) into outbound-via-trunk`,
        });
        priority++;
      }

      // Build the dial expression with strip and prepend
      let dialTarget: string;
      if (stripDigits > 0 || prepend) {
        dialTarget = `${prepend}\${EXTEN:${stripDigits}}`;
      } else {
        dialTarget = '${EXTEN}';
      }

      // Dial
      await amiService.executeAction({
        action: 'Command',
        command: `dialplan add extension ${pattern},${priority},Dial(PJSIP/${dialTarget}@${trunkName},60,tT) into outbound-via-trunk`,
      });
      priority++;

      // Hangup
      await amiService.executeAction({
        action: 'Command',
        command: `dialplan add extension ${pattern},${priority},Hangup() into outbound-via-trunk`,
      });

      logger.info('Outbound route applied', { pattern, trunk_name: trunkName });
    } catch (err) {
      logger.error('Failed to apply outbound route', {
        pattern,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  logger.info('All outbound routes applied', { count: routes.length });
}

export default createRouter;

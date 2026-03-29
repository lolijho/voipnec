import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import Database from 'better-sqlite3';

interface InboundRouteDeps {
  amiService?: any;
  ariService?: any;
  db: Database.Database;
}

export function createRouter(deps: InboundRouteDeps): Router {
  const router = Router();
  const { db, amiService } = deps;

  // Ensure inbound_routes table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbound_routes (
      id TEXT PRIMARY KEY,
      did TEXT NOT NULL,
      trunk_name TEXT DEFAULT '',
      destination_type TEXT NOT NULL DEFAULT 'extension',
      destination TEXT NOT NULL,
      priority INTEGER DEFAULT 10,
      description TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // GET / - list all inbound routes
  router.get('/', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const routes = db.prepare('SELECT * FROM inbound_routes ORDER BY priority ASC, did ASC').all();
      res.json({ routes });
    } catch (err) {
      logger.error('Failed to list inbound routes', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to list inbound routes' });
    }
  });

  // POST / - create inbound route
  router.post('/', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { did, trunk_name, destination_type, destination, priority, description, enabled } = req.body;

      if (!did || !destination) {
        res.status(400).json({ error: 'DID and destination are required' });
        return;
      }

      const id = require('uuid').v4();
      const now = new Date().toISOString();
      const destType = destination_type || 'extension';
      const prio = priority || 10;

      db.prepare(`
        INSERT INTO inbound_routes (id, did, trunk_name, destination_type, destination, priority, description, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, did, trunk_name || '', destType, destination, prio, description || '', enabled !== false ? 1 : 0, now, now);

      // Apply to Asterisk dialplan via AMI
      await applyInboundRoutes(db, amiService);

      logger.info('Inbound route created', { id, did, destination_type: destType, destination });
      res.status(201).json({ route: { id, did, trunk_name, destination_type: destType, destination, priority: prio, description, enabled: enabled !== false } });
    } catch (err) {
      logger.error('Failed to create inbound route', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to create inbound route' });
    }
  });

  // PUT /:id - update inbound route
  router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { did, trunk_name, destination_type, destination, priority, description, enabled } = req.body;

      const existing = db.prepare('SELECT * FROM inbound_routes WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE inbound_routes SET did = ?, trunk_name = ?, destination_type = ?, destination = ?, priority = ?, description = ?, enabled = ?, updated_at = ?
        WHERE id = ?
      `).run(
        did || (existing as any).did,
        trunk_name !== undefined ? trunk_name : (existing as any).trunk_name,
        destination_type || (existing as any).destination_type,
        destination || (existing as any).destination,
        priority !== undefined ? priority : (existing as any).priority,
        description !== undefined ? description : (existing as any).description,
        enabled !== undefined ? (enabled ? 1 : 0) : (existing as any).enabled,
        now,
        id
      );

      await applyInboundRoutes(db, amiService);

      logger.info('Inbound route updated', { id });
      res.json({ message: 'Route updated' });
    } catch (err) {
      logger.error('Failed to update inbound route', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to update inbound route' });
    }
  });

  // DELETE /:id - delete inbound route
  router.delete('/:id', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM inbound_routes WHERE id = ?').run(id);
      await applyInboundRoutes(db, amiService);

      logger.info('Inbound route deleted', { id });
      res.json({ message: 'Route deleted' });
    } catch (err) {
      logger.error('Failed to delete inbound route', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to delete inbound route' });
    }
  });

  // POST /apply - apply all routes to Asterisk
  router.post('/apply', authenticateToken, requireRole('admin'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      await applyInboundRoutes(db, amiService);
      res.json({ message: 'Inbound routes applied to Asterisk' });
    } catch (err) {
      logger.error('Failed to apply inbound routes', { error: err instanceof Error ? err.message : 'Unknown' });
      res.status(500).json({ error: 'Failed to apply inbound routes' });
    }
  });

  return router;
}

// ── Apply inbound routes to Asterisk via AMI ──────────────────────────

async function applyInboundRoutes(db: Database.Database, amiService: any): Promise<void> {
  if (!amiService || !amiService.isConnected) {
    logger.warn('AMI not connected, cannot apply inbound routes');
    return;
  }

  const routes = db.prepare('SELECT * FROM inbound_routes WHERE enabled = 1 ORDER BY priority ASC').all() as any[];

  // Generate dialplan for from-trunk context
  // Use AMI Command to write dialplan via "dialplan add extension"
  // First clear existing from-trunk context entries
  try {
    await amiService.executeAction({
      action: 'Command',
      command: 'dialplan remove context from-trunk',
    });
  } catch {
    // Context might not exist yet, that's fine
  }

  // Add each route
  for (const route of routes) {
    const did = route.did || '_X.';
    let dialString = '';

    switch (route.destination_type) {
      case 'extension':
        dialString = `PJSIP/${route.destination}`;
        break;
      case 'ring_group':
        // Ring multiple extensions
        const exts = route.destination.split(',').map((e: string) => `PJSIP/${e.trim()}`).join('&');
        dialString = exts;
        break;
      case 'queue':
        dialString = `Queue(${route.destination})`;
        break;
      case 'voicemail':
        dialString = `VoiceMail(${route.destination}@default)`;
        break;
      case 'ivr':
        dialString = `Goto(${route.destination},s,1)`;
        break;
      default:
        dialString = `PJSIP/${route.destination}`;
    }

    try {
      if (route.destination_type === 'queue') {
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},1,NoOp(Inbound: ${route.description || route.did}) into from-trunk`,
        });
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},2,${dialString} into from-trunk`,
        });
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},3,Hangup() into from-trunk`,
        });
      } else if (route.destination_type === 'ivr') {
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},1,NoOp(Inbound: ${route.description || route.did}) into from-trunk`,
        });
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},2,${dialString} into from-trunk`,
        });
      } else {
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},1,NoOp(Inbound: ${route.description || route.did}) into from-trunk`,
        });
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},2,Dial(${dialString},30) into from-trunk`,
        });
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},3,VoiceMail(${route.destination}@default,u) into from-trunk`,
        });
        await amiService.executeAction({
          action: 'Command',
          command: `dialplan add extension ${did},4,Hangup() into from-trunk`,
        });
      }

      logger.info('Inbound route applied', { did, destination: route.destination, type: route.destination_type });
    } catch (err) {
      logger.error('Failed to apply inbound route', {
        did,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  // Also add a catch-all for 's' extension (calls without DID)
  try {
    const defaultRoute = routes[0];
    if (defaultRoute) {
      const dest = defaultRoute.destination_type === 'extension' ? `PJSIP/${defaultRoute.destination}` : `PJSIP/${defaultRoute.destination}`;
      await amiService.executeAction({
        action: 'Command',
        command: `dialplan add extension s,1,NoOp(Inbound catch-all from \${CALLERID(num)}) into from-trunk`,
      });
      await amiService.executeAction({
        action: 'Command',
        command: `dialplan add extension s,2,Dial(${dest},30) into from-trunk`,
      });
      await amiService.executeAction({
        action: 'Command',
        command: `dialplan add extension s,3,Hangup() into from-trunk`,
      });
    }
  } catch {
    // Non-critical
  }

  logger.info('All inbound routes applied', { count: routes.length });
}

export default createRouter;

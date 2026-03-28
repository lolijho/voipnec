import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  authenticateToken,
  requireRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { logger } from '../logger';
import Database from 'better-sqlite3';

interface TrunksDeps {
  amiService: any;
  ariService?: any;
  callLogService?: any;
  trunkService?: any;
  db: Database.Database;
}

interface TrunkRow {
  id: string;
  name: string;
  provider: string;
  config_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const VALID_PROVIDERS = ['messagenet', 'twilio', 'generic'];

export function createRouter(deps: TrunksDeps): Router {
  const router = Router();
  const { amiService, trunkService, db } = deps;

  // All routes are protected
  router.use(authenticateToken);

  // GET / - list trunks
  router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      if (trunkService) {
        const trunks = await trunkService.getTrunks();
        res.json({ trunks });
        return;
      }

      const trunks = db
        .prepare('SELECT * FROM trunks ORDER BY name')
        .all() as TrunkRow[];

      const parsed = trunks.map((t) => ({
        ...t,
        config: JSON.parse(t.config_json),
      }));

      res.json({ trunks: parsed });
    } catch (err) {
      logger.error('Failed to list trunks', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to list trunks' });
    }
  });

  // GET /:id - get trunk
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      if (trunkService) {
        const trunk = await trunkService.getTrunk(id);
        if (!trunk) {
          res.status(404).json({ error: 'Trunk not found' });
          return;
        }
        res.json({ trunk });
        return;
      }

      const trunk = db
        .prepare('SELECT * FROM trunks WHERE id = ?')
        .get(id) as TrunkRow | undefined;

      if (!trunk) {
        res.status(404).json({ error: 'Trunk not found' });
        return;
      }

      res.json({
        trunk: {
          ...trunk,
          config: JSON.parse(trunk.config_json),
        },
      });
    } catch (err) {
      logger.error('Failed to get trunk', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get trunk' });
    }
  });

  // POST / - create trunk (admin only)
  router.post('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, provider, config, enabled } = req.body;

      if (!name || !provider) {
        res.status(400).json({ error: '"name" and "provider" are required' });
        return;
      }

      if (!VALID_PROVIDERS.includes(provider)) {
        res.status(400).json({
          error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`,
        });
        return;
      }

      if (trunkService) {
        const trunkData = {
          name,
          provider,
          host: config?.server || config?.host || '',
          port: config?.port || 5060,
          username: config?.username || config?.accountSid || '',
          password: config?.password || config?.authToken || '',
          codecs: Array.isArray(config?.codecs) ? config.codecs.join(',') : (config?.codecs || 'ulaw,alaw'),
          context: config?.context || `from-trunk-${name}`,
          transport: config?.transport || 'udp',
          enabled: enabled !== undefined ? enabled : true,
          outbound_prefix: config?.prefixOut || '',
          register: config?.registration !== false,
          auth_type: 'userpass',
        };
        const trunk = await trunkService.createTrunk(trunkData);
        logger.info('Trunk created via service', { user: req.user?.username, name, provider });
        res.status(201).json({ trunk });
        return;
      }

      const id = uuidv4();
      const configJson = JSON.stringify(config || {});
      const trunkEnabled = enabled !== undefined ? (enabled ? 1 : 0) : 1;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO trunks (id, name, provider, config_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, name, provider, configJson, trunkEnabled, now, now);

      logger.info('Trunk created', {
        user: req.user?.username,
        id,
        name,
        provider,
      });

      res.status(201).json({
        trunk: {
          id,
          name,
          provider,
          config: config || {},
          enabled: trunkEnabled,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (err) {
      logger.error('Failed to create trunk', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to create trunk' });
    }
  });

  // PUT /:id - update trunk (admin only)
  router.put('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, provider, config, enabled } = req.body;

      if (trunkService) {
        const updateData: Record<string, unknown> = {};
        if (name) updateData.name = name;
        if (provider) updateData.provider = provider;
        if (enabled !== undefined) updateData.enabled = enabled;
        if (config) {
          updateData.host = config.server || config.host;
          updateData.port = config.port || 5060;
          updateData.username = config.username || config.accountSid;
          updateData.password = config.password || config.authToken;
          if (config.codecs) updateData.codecs = Array.isArray(config.codecs) ? config.codecs.join(',') : config.codecs;
          if (config.transport) updateData.transport = config.transport;
          if (config.prefixOut !== undefined) updateData.outbound_prefix = config.prefixOut;
          if (config.registration !== undefined) updateData.register = config.registration;
        }
        const trunk = await trunkService.updateTrunk(id, updateData as any);
        if (!trunk) {
          res.status(404).json({ error: 'Trunk not found' });
          return;
        }
        logger.info('Trunk updated via service', { user: req.user?.username, id });
        res.json({ trunk });
        return;
      }

      const existing = db
        .prepare('SELECT * FROM trunks WHERE id = ?')
        .get(id) as TrunkRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Trunk not found' });
        return;
      }

      if (provider && !VALID_PROVIDERS.includes(provider)) {
        res.status(400).json({
          error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`,
        });
        return;
      }

      const updatedName = name || existing.name;
      const updatedProvider = provider || existing.provider;
      const updatedConfigJson = config !== undefined ? JSON.stringify(config) : existing.config_json;
      const updatedEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE trunks SET name = ?, provider = ?, config_json = ?, enabled = ?, updated_at = ?
         WHERE id = ?`
      ).run(updatedName, updatedProvider, updatedConfigJson, updatedEnabled, now, id);

      logger.info('Trunk updated', {
        user: req.user?.username,
        id,
        name: updatedName,
      });

      res.json({
        trunk: {
          id,
          name: updatedName,
          provider: updatedProvider,
          config: JSON.parse(updatedConfigJson),
          enabled: updatedEnabled,
          created_at: existing.created_at,
          updated_at: now,
        },
      });
    } catch (err) {
      logger.error('Failed to update trunk', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to update trunk' });
    }
  });

  // DELETE /:id - delete trunk (admin only)
  router.delete('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      if (trunkService) {
        const deleted = await trunkService.deleteTrunk(id);
        if (!deleted) {
          res.status(404).json({ error: 'Trunk not found' });
          return;
        }
        logger.info('Trunk deleted via service', { user: req.user?.username, id });
        res.json({ message: 'Trunk deleted' });
        return;
      }

      const existing = db
        .prepare('SELECT id, name FROM trunks WHERE id = ?')
        .get(id) as { id: string; name: string } | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Trunk not found' });
        return;
      }

      db.prepare('DELETE FROM trunks WHERE id = ?').run(id);

      logger.info('Trunk deleted', {
        user: req.user?.username,
        id,
        name: existing.name,
      });

      res.json({ message: 'Trunk deleted' });
    } catch (err) {
      logger.error('Failed to delete trunk', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to delete trunk' });
    }
  });

  // POST /:id/test - test trunk connection (admin only)
  router.post('/:id/test', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const trunk = db
        .prepare('SELECT * FROM trunks WHERE id = ?')
        .get(id) as TrunkRow | undefined;

      if (!trunk) {
        res.status(404).json({ error: 'Trunk not found' });
        return;
      }

      if (trunkService && typeof trunkService.testTrunk === 'function') {
        const result = await trunkService.testTrunk(id);
        res.json({ message: 'Trunk test completed', result });
        return;
      }

      // Fallback: use AMI to check trunk status
      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available for trunk testing' });
        return;
      }

      const trunkStatuses = await amiService.getTrunkStatus();
      const trunkConfig = JSON.parse(trunk.config_json);
      const trunkHost = trunkConfig.host || trunkConfig.server || trunk.name;

      const matchedStatus = Array.isArray(trunkStatuses)
        ? trunkStatuses.find(
            (s: any) =>
              s.objectname === trunk.name ||
              s.peer === trunk.name ||
              s.host === trunkHost
          )
        : null;

      const isReachable = matchedStatus
        ? matchedStatus.status === 'Reachable' || matchedStatus.reachability === 'Reachable'
        : false;

      logger.info('Trunk test executed', {
        user: req.user?.username,
        trunkId: id,
        trunkName: trunk.name,
        reachable: isReachable,
      });

      res.json({
        message: 'Trunk test completed',
        result: {
          trunkId: id,
          trunkName: trunk.name,
          reachable: isReachable,
          status: matchedStatus || null,
        },
      });
    } catch (err) {
      logger.error('Failed to test trunk', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to test trunk' });
    }
  });

  // POST /reload - regenerate all configs and reload (admin only)
  router.post('/reload', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (trunkService && typeof trunkService.reloadAll === 'function') {
        await trunkService.reloadAll();
        logger.info('Trunk configs regenerated and reloaded via service', {
          user: req.user?.username,
        });
        res.json({ message: 'Trunk configurations regenerated and reloaded' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      // Reload PJSIP module to pick up any config changes
      await amiService.reloadModule('res_pjsip.so');

      logger.info('Trunk configs reloaded', {
        user: req.user?.username,
      });

      res.json({ message: 'Trunk configurations reloaded' });
    } catch (err) {
      logger.error('Failed to reload trunk configs', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to reload trunk configurations' });
    }
  });

  return router;
}

export default createRouter;

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import {
  authenticateToken,
  requireRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { logger } from '../logger';
import Database from 'better-sqlite3';

interface ExtensionsDeps {
  amiService: any;
  ariService?: any;
  callLogService?: any;
  trunkService?: any;
  db: Database.Database;
}

interface ExtensionRow {
  id: string;
  exten: string;
  name: string;
  secret: string;
  context: string;
  transport: string;
  codecs: string;
  enabled: number;
  mailbox: string | null;
}

const PJSIP_EXTENSIONS_DIR =
  process.env.PJSIP_EXTENSIONS_DIR || '/etc/asterisk/pjsip.d';

function generatePjsipConfig(ext: {
  exten: string;
  name: string;
  secret: string;
  context: string;
  transport: string;
  codecs: string;
  mailbox?: string | null;
}): string {
  const codecLines = ext.codecs
    .split(',')
    .map((c: string) => c.trim())
    .filter(Boolean)
    .map((c: string) => `allow=${c}`)
    .join('\n');

  const transportName = `transport-${ext.transport || 'udp'}`;
  const mailboxLine = ext.mailbox ? `\nmailboxes=${ext.mailbox}` : '';

  return `[${ext.exten}]
type=endpoint
transport=${transportName}
context=${ext.context || 'from-internal'}
disallow=all
${codecLines}
auth=${ext.exten}_auth
aors=${ext.exten}_aor
callerid="${ext.name}" <${ext.exten}>${mailboxLine}

[${ext.exten}_auth]
type=auth
auth_type=userpass
username=${ext.exten}
password=${ext.secret}

[${ext.exten}_aor]
type=aor
max_contacts=5
`;
}

function writePjsipConfig(exten: string, config: string): void {
  try {
    if (!fs.existsSync(PJSIP_EXTENSIONS_DIR)) {
      fs.mkdirSync(PJSIP_EXTENSIONS_DIR, { recursive: true });
    }
    const filePath = path.join(PJSIP_EXTENSIONS_DIR, `${exten}.conf`);
    fs.writeFileSync(filePath, config, 'utf-8');
    logger.info('PJSIP config written', { exten, filePath });
  } catch (err) {
    logger.error('Failed to write PJSIP config', {
      exten,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

function removePjsipConfig(exten: string): void {
  try {
    const filePath = path.join(PJSIP_EXTENSIONS_DIR, `${exten}.conf`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('PJSIP config removed', { exten, filePath });
    }
  } catch (err) {
    logger.error('Failed to remove PJSIP config', {
      exten,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export function createRouter(deps: ExtensionsDeps): Router {
  const router = Router();
  const { amiService, db } = deps;

  // All routes are protected
  router.use(authenticateToken);

  // GET / - list all extensions
  router.get('/', (_req: AuthenticatedRequest, res: Response) => {
    try {
      const extensions = db
        .prepare('SELECT id, exten, name, context, transport, codecs, enabled, mailbox FROM extensions ORDER BY exten')
        .all() as Omit<ExtensionRow, 'secret'>[];

      res.json({ extensions });
    } catch (err) {
      logger.error('Failed to list extensions', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to list extensions' });
    }
  });

  // GET /:id - get one extension
  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const extension = db
        .prepare('SELECT id, exten, name, context, transport, codecs, enabled, mailbox FROM extensions WHERE id = ?')
        .get(id) as Omit<ExtensionRow, 'secret'> | undefined;

      if (!extension) {
        res.status(404).json({ error: 'Extension not found' });
        return;
      }

      res.json({ extension });
    } catch (err) {
      logger.error('Failed to get extension', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get extension' });
    }
  });

  // POST / - create extension
  router.post('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exten, name, secret, context, transport, codecs, enabled, mailbox } = req.body;

      if (!exten || !name || !secret) {
        res.status(400).json({ error: '"exten", "name", and "secret" are required' });
        return;
      }

      if (!/^\d{2,10}$/.test(exten)) {
        res.status(400).json({ error: 'Extension number must be 2-10 digits' });
        return;
      }

      const existing = db
        .prepare('SELECT id FROM extensions WHERE exten = ?')
        .get(exten) as { id: string } | undefined;

      if (existing) {
        res.status(409).json({ error: 'Extension number already exists' });
        return;
      }

      const id = uuidv4();
      const extContext = context || 'from-internal';
      const extTransport = transport || 'udp';
      const extCodecs = codecs || 'ulaw,alaw';
      const extEnabled = enabled !== undefined ? (enabled ? 1 : 0) : 1;

      db.prepare(
        `INSERT INTO extensions (id, exten, name, secret, context, transport, codecs, enabled, mailbox)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, exten, name, secret, extContext, extTransport, extCodecs, extEnabled, mailbox || null);

      // Generate and write pjsip config
      try {
        const config = generatePjsipConfig({
          exten,
          name,
          secret,
          context: extContext,
          transport: extTransport,
          codecs: extCodecs,
          mailbox,
        });
        writePjsipConfig(exten, config);

        // Reload asterisk pjsip module
        if (amiService) {
          await amiService.reloadModule('res_pjsip.so');
        }
      } catch (configErr) {
        logger.warn('Extension created in DB but PJSIP config write/reload failed', {
          exten,
          error: configErr instanceof Error ? configErr.message : 'Unknown error',
        });
      }

      logger.info('Extension created', {
        user: req.user?.username,
        exten,
        name,
      });

      res.status(201).json({
        extension: {
          id,
          exten,
          name,
          context: extContext,
          transport: extTransport,
          codecs: extCodecs,
          enabled: extEnabled,
          mailbox: mailbox || null,
        },
      });
    } catch (err) {
      logger.error('Failed to create extension', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to create extension' });
    }
  });

  // PUT /:id - update extension
  router.put('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { exten, name, secret, context, transport, codecs, enabled, mailbox } = req.body;

      const existing = db
        .prepare('SELECT * FROM extensions WHERE id = ?')
        .get(id) as ExtensionRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Extension not found' });
        return;
      }

      const updatedExten = exten || existing.exten;
      const updatedName = name || existing.name;
      const updatedSecret = secret || existing.secret;
      const updatedContext = context || existing.context;
      const updatedTransport = transport || existing.transport;
      const updatedCodecs = codecs || existing.codecs;
      const updatedEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
      const updatedMailbox = mailbox !== undefined ? (mailbox || null) : existing.mailbox;

      // If exten is changing, check for conflicts
      if (updatedExten !== existing.exten) {
        const conflict = db
          .prepare('SELECT id FROM extensions WHERE exten = ? AND id != ?')
          .get(updatedExten, id) as { id: string } | undefined;

        if (conflict) {
          res.status(409).json({ error: 'Extension number already in use' });
          return;
        }
      }

      db.prepare(
        `UPDATE extensions SET exten = ?, name = ?, secret = ?, context = ?, transport = ?, codecs = ?, enabled = ?, mailbox = ?
         WHERE id = ?`
      ).run(updatedExten, updatedName, updatedSecret, updatedContext, updatedTransport, updatedCodecs, updatedEnabled, updatedMailbox, id);

      // Remove old config if exten changed, write new config
      try {
        if (updatedExten !== existing.exten) {
          removePjsipConfig(existing.exten);
        }

        const config = generatePjsipConfig({
          exten: updatedExten,
          name: updatedName,
          secret: updatedSecret,
          context: updatedContext,
          transport: updatedTransport,
          codecs: updatedCodecs,
          mailbox: updatedMailbox,
        });
        writePjsipConfig(updatedExten, config);

        if (amiService) {
          await amiService.reloadModule('res_pjsip.so');
        }
      } catch (configErr) {
        logger.warn('Extension updated in DB but PJSIP config write/reload failed', {
          exten: updatedExten,
          error: configErr instanceof Error ? configErr.message : 'Unknown error',
        });
      }

      logger.info('Extension updated', {
        user: req.user?.username,
        id,
        exten: updatedExten,
      });

      res.json({
        extension: {
          id,
          exten: updatedExten,
          name: updatedName,
          context: updatedContext,
          transport: updatedTransport,
          codecs: updatedCodecs,
          enabled: updatedEnabled,
          mailbox: updatedMailbox,
        },
      });
    } catch (err) {
      logger.error('Failed to update extension', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to update extension' });
    }
  });

  // DELETE /:id - delete extension
  router.delete('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const existing = db
        .prepare('SELECT * FROM extensions WHERE id = ?')
        .get(id) as ExtensionRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Extension not found' });
        return;
      }

      db.prepare('DELETE FROM extensions WHERE id = ?').run(id);

      // Remove pjsip config and reload
      try {
        removePjsipConfig(existing.exten);

        if (amiService) {
          await amiService.reloadModule('res_pjsip.so');
        }
      } catch (configErr) {
        logger.warn('Extension deleted from DB but PJSIP config removal/reload failed', {
          exten: existing.exten,
          error: configErr instanceof Error ? configErr.message : 'Unknown error',
        });
      }

      logger.info('Extension deleted', {
        user: req.user?.username,
        id,
        exten: existing.exten,
      });

      res.json({ message: 'Extension deleted' });
    } catch (err) {
      logger.error('Failed to delete extension', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to delete extension' });
    }
  });

  // GET /:exten/status - get extension status from AMI
  router.get('/:exten/status', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { exten } = req.params;

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const status = await amiService.getExtensionStatus(exten);
      res.json({ exten, status });
    } catch (err) {
      logger.error('Failed to get extension status', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get extension status' });
    }
  });

  return router;
}

export default createRouter;

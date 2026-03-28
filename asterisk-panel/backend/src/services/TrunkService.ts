import Database from 'better-sqlite3';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { logger } from '../logger';
import { AmiService } from './AmiService';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export interface TrunkData {
  name: string;
  provider: 'messagenet' | 'twilio' | 'generic';
  host: string;
  port?: number;
  username: string;
  password: string;
  codecs?: string;
  context?: string;
  transport?: string;
  enabled?: boolean;
  outbound_prefix?: string;
  register?: boolean;
  auth_type?: string;
}

export interface TrunkRecord {
  id: string;
  name: string;
  provider: 'messagenet' | 'twilio' | 'generic';
  config_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface TrunkDisplay {
  id: string;
  name: string;
  provider: 'messagenet' | 'twilio' | 'generic';
  host: string;
  port: number;
  username: string;
  password: string;
  codecs: string;
  context: string;
  transport: string;
  enabled: boolean;
  outbound_prefix: string;
  register: boolean;
  auth_type: string;
  created_at: string;
  updated_at: string;
}

export class TrunkService {
  private db: Database.Database;
  private amiService: AmiService;
  private encryptionKey: Buffer;

  constructor(amiService: AmiService) {
    this.db = getDatabase();
    this.amiService = amiService;

    // Derive a 32-byte key from JWT_SECRET using SHA-256
    const secret =
      process.env.JWT_SECRET || 'asterisk-panel-secret-change-me';
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(secret)
      .digest();
  }

  // ── Encryption ──────────────────────────────────────────────────────────────

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      this.encryptionKey,
      iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length < 2) {
      return encryptedText;
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts.slice(1).join(':');
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      this.encryptionKey,
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // ── CRUD Methods ────────────────────────────────────────────────────────────

  async createTrunk(data: TrunkData): Promise<TrunkDisplay> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      const configObj = {
        host: data.host,
        port: data.port || 5060,
        username: data.username,
        password: this.encrypt(data.password),
        codecs: data.codecs || 'ulaw,alaw,g729',
        context: data.context || 'from-trunk',
        transport: data.transport || 'udp',
        outbound_prefix: data.outbound_prefix || '',
        register: data.register !== false,
        auth_type: data.auth_type || 'userpass',
      };

      this.db
        .prepare(
          `INSERT INTO trunks (id, name, provider, config_json, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          data.name,
          data.provider,
          JSON.stringify(configObj),
          data.enabled !== false ? 1 : 0,
          now,
          now
        );

      logger.info('Trunk created', { id, name: data.name, provider: data.provider });

      // Generate config files and reload asterisk
      await this.generateAllConfigs();
      await this.reloadAsterisk();

      return this.formatTrunkDisplay(id, data.name, data.provider, configObj, data.enabled !== false ? 1 : 0, now, now);
    } catch (err) {
      logger.error('Failed to create trunk', {
        name: data.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async updateTrunk(
    id: string,
    data: Partial<TrunkData>
  ): Promise<TrunkDisplay> {
    try {
      const existing = this.db
        .prepare('SELECT * FROM trunks WHERE id = ?')
        .get(id) as TrunkRecord | undefined;

      if (!existing) {
        throw new Error(`Trunk not found: ${id}`);
      }

      const existingConfig = JSON.parse(existing.config_json);
      const now = new Date().toISOString();

      const updatedConfig = {
        host: data.host || existingConfig.host,
        port: data.port || existingConfig.port,
        username: data.username || existingConfig.username,
        password: data.password
          ? this.encrypt(data.password)
          : existingConfig.password,
        codecs: data.codecs || existingConfig.codecs,
        context: data.context || existingConfig.context,
        transport: data.transport || existingConfig.transport,
        outbound_prefix:
          data.outbound_prefix !== undefined
            ? data.outbound_prefix
            : existingConfig.outbound_prefix,
        register:
          data.register !== undefined
            ? data.register
            : existingConfig.register,
        auth_type: data.auth_type || existingConfig.auth_type,
      };

      const name = data.name || existing.name;
      const provider = data.provider || existing.provider;
      const enabled =
        data.enabled !== undefined
          ? data.enabled
            ? 1
            : 0
          : existing.enabled;

      this.db
        .prepare(
          `UPDATE trunks
           SET name = ?, provider = ?, config_json = ?, enabled = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(name, provider, JSON.stringify(updatedConfig), enabled, now, id);

      logger.info('Trunk updated', { id, name });

      // Regenerate config files and reload asterisk
      await this.generateAllConfigs();
      await this.reloadAsterisk();

      return this.formatTrunkDisplay(id, name, provider as TrunkData['provider'], updatedConfig, enabled, existing.created_at, now);
    } catch (err) {
      logger.error('Failed to update trunk', {
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async deleteTrunk(id: string): Promise<void> {
    try {
      const existing = this.db
        .prepare('SELECT * FROM trunks WHERE id = ?')
        .get(id) as TrunkRecord | undefined;

      if (!existing) {
        throw new Error(`Trunk not found: ${id}`);
      }

      this.db.prepare('DELETE FROM trunks WHERE id = ?').run(id);

      logger.info('Trunk deleted', { id, name: existing.name });

      // Regenerate config files and reload asterisk
      await this.generateAllConfigs();
      await this.reloadAsterisk();
    } catch (err) {
      logger.error('Failed to delete trunk', {
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  getTrunks(): TrunkDisplay[] {
    try {
      const rows = this.db
        .prepare(
          'SELECT id, name, provider, config_json, enabled, created_at, updated_at FROM trunks ORDER BY name'
        )
        .all() as TrunkRecord[];

      return rows.map((row) => {
        const config = JSON.parse(row.config_json);
        return this.formatTrunkDisplay(
          row.id,
          row.name,
          row.provider,
          config,
          row.enabled,
          row.created_at,
          row.updated_at
        );
      });
    } catch (err) {
      logger.error('Failed to get trunks', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  getTrunkById(id: string): TrunkDisplay | null {
    try {
      const row = this.db
        .prepare(
          'SELECT id, name, provider, config_json, enabled, created_at, updated_at FROM trunks WHERE id = ?'
        )
        .get(id) as TrunkRecord | undefined;

      if (!row) {
        return null;
      }

      const config = JSON.parse(row.config_json);
      return this.formatTrunkDisplay(
        row.id,
        row.name,
        row.provider,
        config,
        row.enabled,
        row.created_at,
        row.updated_at
      );
    } catch (err) {
      logger.error('Failed to get trunk by ID', {
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async testTrunkConnection(id: string): Promise<{
    registered: boolean;
    status: string;
    details: any;
  }> {
    try {
      const trunk = this.getTrunkById(id);
      if (!trunk) {
        throw new Error(`Trunk not found: ${id}`);
      }

      if (!this.amiService.isConnected) {
        throw new Error('AMI not connected');
      }

      // Get all outbound registrations
      let registrations: any[] = [];
      try {
        registrations = await this.amiService.getTrunkStatus();
      } catch (err) {
        logger.warn('Failed to get trunk registrations via AMI', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      logger.info('Trunk test - searching registrations', {
        trunkId: id,
        trunkName: trunk.name,
        trunkHost: trunk.host,
        trunkUsername: trunk.username,
        registrationCount: registrations.length,
        registrations: registrations.map((r: any) => ({
          objectname: r.objectname,
          serveruri: r.serveruri,
          clienturi: r.clienturi,
          status: r.status,
        })),
      });

      // Find any registration matching this trunk by host or username
      const hostLower = (trunk.host || '').toLowerCase();
      const userLower = (trunk.username || '').toLowerCase();
      const trunkName = this.sanitizeName(trunk.name);

      const registration = registrations.find((reg: any) => {
        const objName = (reg.objectname || '').toLowerCase();
        const serverUri = (reg.serveruri || '').toLowerCase();
        const clientUri = (reg.clienturi || '').toLowerCase();

        // Match by any of: object name, server host, or client username
        if (hostLower && serverUri.includes(hostLower)) return true;
        if (userLower && clientUri.includes(userLower)) return true;
        if (objName.includes(trunkName)) return true;
        if (trunkName.includes(objName.replace(/[-_]?reg[-_]?\d*$/g, ''))) return true;
        return false;
      });

      if (registration) {
        const isRegistered =
          registration.status === 'Registered' ||
          registration.status === 'registered';

        return {
          registered: isRegistered,
          status: registration.status || 'Unknown',
          details: registration,
        };
      }

      // If no registration found, check endpoint status
      try {
        const peers = await this.amiService.getPeerStatus();
        const endpoint = peers.find(
          (peer: any) =>
            (peer.objectname || '').toLowerCase().includes(trunkName) ||
            (peer.objectname || '').toLowerCase().includes(userLower)
        );

        if (endpoint) {
          return {
            registered: true,
            status: endpoint.devicestate || 'Available',
            details: endpoint,
          };
        }
      } catch (err) {
        logger.warn('Failed to get peer status', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      return {
        registered: false,
        status: 'Not Found',
        details: { registrationsChecked: registrations.length },
      };
    } catch (err) {
      logger.error('Failed to test trunk connection', {
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  // ── Config Generation via AMI (remote) ──────────────────────────────────────

  async generateAllConfigs(): Promise<void> {
    try {
      if (!this.amiService.isConnected) {
        logger.warn('AMI not connected, cannot push trunk configs to Asterisk');
        return;
      }

      const trunks = this.db
        .prepare(
          'SELECT id, name, provider, config_json, enabled FROM trunks'
        )
        .all() as TrunkRecord[];

      // First, clear the auto-generated config file via AMI UpdateConfig
      // We use pjsip_trunks.conf which should be #include'd from pjsip.conf
      const srcFilename = 'pjsip_trunks.conf';
      const dialplanFilename = 'extensions_trunks.conf';

      // Empty the files first by creating them fresh
      try {
        await this.amiUpdateConfig(srcFilename, [
          { action: 'EmptyCat', category: 'general', match: '' },
        ]);
      } catch {
        // File might not exist yet, that's fine - NewCat will create categories
      }

      // Build all config sections for each trunk
      for (const trunk of trunks) {
        if (!trunk.enabled) continue;

        const config = JSON.parse(trunk.config_json);
        const trunkName = this.sanitizeName(trunk.name);
        const decryptedPassword = this.decryptPassword(config.password);
        const host = config.host || '';
        const port = config.port || 5060;
        const username = config.username || '';
        const codecs = (config.codecs || 'ulaw,alaw').split(',').map((c: string) => c.trim());

        // Auth section
        const authName = `auth_${trunkName}`;
        await this.amiUpdateConfig(srcFilename, [
          { action: 'NewCat', category: authName, match: '' },
          { action: 'Append', category: authName, variable: 'type', value: 'auth' },
          { action: 'Append', category: authName, variable: 'auth_type', value: config.auth_type || 'userpass' },
          { action: 'Append', category: authName, variable: 'username', value: username },
          { action: 'Append', category: authName, variable: 'password', value: decryptedPassword },
        ]);

        // AOR section
        const aorName = `${trunkName}_aor`;
        await this.amiUpdateConfig(srcFilename, [
          { action: 'NewCat', category: aorName, match: '' },
          { action: 'Append', category: aorName, variable: 'type', value: 'aor' },
          { action: 'Append', category: aorName, variable: 'contact', value: `sip:${host}:${port}` },
          { action: 'Append', category: aorName, variable: 'qualify_frequency', value: '60' },
        ]);

        // Endpoint section
        await this.amiUpdateConfig(srcFilename, [
          { action: 'NewCat', category: trunkName, match: '' },
          { action: 'Append', category: trunkName, variable: 'type', value: 'endpoint' },
          { action: 'Append', category: trunkName, variable: 'context', value: config.context || `from-trunk-${trunkName}` },
          { action: 'Append', category: trunkName, variable: 'disallow', value: 'all' },
          ...codecs.map((codec: string) => ({
            action: 'Append' as const, category: trunkName, variable: 'allow', value: codec,
          })),
          { action: 'Append', category: trunkName, variable: 'outbound_auth', value: authName },
          { action: 'Append', category: trunkName, variable: 'aors', value: aorName },
          { action: 'Append', category: trunkName, variable: 'from_user', value: username },
          { action: 'Append', category: trunkName, variable: 'from_domain', value: host },
        ]);

        // Registration section
        if (config.register !== false) {
          const regName = `reg_${trunkName}`;
          await this.amiUpdateConfig(srcFilename, [
            { action: 'NewCat', category: regName, match: '' },
            { action: 'Append', category: regName, variable: 'type', value: 'registration' },
            { action: 'Append', category: regName, variable: 'outbound_auth', value: authName },
            { action: 'Append', category: regName, variable: 'server_uri', value: `sip:${host}` },
            { action: 'Append', category: regName, variable: 'client_uri', value: `sip:${username}@${host}` },
            { action: 'Append', category: regName, variable: 'retry_interval', value: '60' },
            { action: 'Append', category: regName, variable: 'expiration', value: '3600' },
          ]);
        }

        // Identify section
        const identifyName = `${trunkName}_identify`;
        await this.amiUpdateConfig(srcFilename, [
          { action: 'NewCat', category: identifyName, match: '' },
          { action: 'Append', category: identifyName, variable: 'type', value: 'identify' },
          { action: 'Append', category: identifyName, variable: 'endpoint', value: trunkName },
          { action: 'Append', category: identifyName, variable: 'match', value: host },
        ]);
      }

      logger.info('All trunk configs pushed to Asterisk via AMI', {
        trunkCount: trunks.length,
      });
    } catch (err) {
      logger.error('Failed to generate trunk configs via AMI', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  private async amiUpdateConfig(
    filename: string,
    actions: Array<{ action: string; category: string; variable?: string; value?: string; match?: string }>
  ): Promise<void> {
    const params: Record<string, string> = {
      action: 'UpdateConfig',
      srcfilename: filename,
      dstfilename: filename,
    };

    actions.forEach((act, i) => {
      const idx = String(i).padStart(6, '0');
      params[`Action-${idx}`] = act.action;
      params[`Cat-${idx}`] = act.category;
      if (act.variable !== undefined) params[`Var-${idx}`] = act.variable;
      if (act.value !== undefined) params[`Value-${idx}`] = act.value;
      if (act.match !== undefined) params[`Match-${idx}`] = act.match;
    });

    await (this.amiService as any).executeAction(params);
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private formatTrunkDisplay(
    id: string,
    name: string,
    provider: TrunkData['provider'],
    config: any,
    enabled: number,
    created_at: string,
    updated_at: string
  ): TrunkDisplay {
    return {
      id,
      name,
      provider,
      host: config.host || '',
      port: config.port || 5060,
      username: config.username || '',
      password: this.decryptPassword(config.password),
      codecs: config.codecs || 'ulaw,alaw',
      context: config.context || 'from-trunk',
      transport: config.transport || 'udp',
      enabled: enabled === 1,
      outbound_prefix: config.outbound_prefix || '',
      register: config.register !== false,
      auth_type: config.auth_type || 'userpass',
      created_at,
      updated_at,
    };
  }

  private decryptPassword(encryptedPassword: string): string {
    try {
      return this.decrypt(encryptedPassword);
    } catch {
      // If decryption fails, return the raw value (might be unencrypted)
      return encryptedPassword;
    }
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private async reloadAsterisk(): Promise<void> {
    try {
      if (!this.amiService.isConnected) {
        logger.warn(
          'AMI not connected, skipping Asterisk reload. Config files were written but not loaded.'
        );
        return;
      }

      await this.amiService.reloadModule('res_pjsip.so');
      logger.info('Asterisk PJSIP module reloaded');
    } catch (err) {
      logger.error('Failed to reload Asterisk', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      // Don't throw - config files were written successfully, reload can be retried
    }
  }
}

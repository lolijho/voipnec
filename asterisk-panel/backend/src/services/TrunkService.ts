import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { logger } from '../logger';
import { AmiService } from './AmiService';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

const ASTERISK_CONFIG_DIR =
  process.env.ASTERISK_CONFIG_DIR || '/etc/asterisk';
const TRUNK_CONF_FILE = 'pjsip_trunks.conf';
const TRUNK_DIALPLAN_FILE = 'extensions_trunks.conf';

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
      const registrations = await this.amiService.getTrunkStatus();

      // Find the registration matching this trunk
      const trunkName = this.sanitizeName(trunk.name);
      const registration = registrations.find(
        (reg: any) =>
          reg.objectname === trunkName ||
          reg.serveruri?.includes(trunk.host) ||
          reg.clienturi?.includes(trunk.username)
      );

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

      // If no registration found, try to check endpoint status
      const peers = await this.amiService.getPeerStatus();
      const endpoint = peers.find(
        (peer) =>
          peer.objectname === trunkName ||
          peer.objectname === trunk.username
      );

      if (endpoint) {
        const isReachable =
          endpoint.devicestate === 'Not in use' ||
          endpoint.devicestate === 'InUse' ||
          endpoint.devicestate === 'Ringing';

        return {
          registered: isReachable,
          status: endpoint.devicestate || 'Unknown',
          details: endpoint,
        };
      }

      return {
        registered: false,
        status: 'Not Found',
        details: null,
      };
    } catch (err) {
      logger.error('Failed to test trunk connection', {
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  // ── Config Generation ───────────────────────────────────────────────────────

  async generateAllConfigs(): Promise<void> {
    try {
      const trunks = this.db
        .prepare(
          'SELECT id, name, provider, config_json, enabled FROM trunks'
        )
        .all() as TrunkRecord[];

      let pjsipConf = '; Auto-generated by AsteriskPanel - DO NOT EDIT MANUALLY\n';
      pjsipConf += `; Generated at ${new Date().toISOString()}\n\n`;

      let dialplanConf = '; Auto-generated by AsteriskPanel - DO NOT EDIT MANUALLY\n';
      dialplanConf += `; Generated at ${new Date().toISOString()}\n\n`;
      dialplanConf += '[from-trunk]\n';

      for (const trunk of trunks) {
        const config = JSON.parse(trunk.config_json);
        const trunkName = this.sanitizeName(trunk.name);
        const decryptedPassword = this.decryptPassword(config.password);

        if (!trunk.enabled) {
          pjsipConf += `; Trunk "${trunk.name}" is DISABLED\n\n`;
          continue;
        }

        // Generate PJSIP transport (if needed)
        pjsipConf += `; ── Trunk: ${trunk.name} (${trunk.provider}) ──\n\n`;

        // Auth section
        pjsipConf += `[auth_${trunkName}]\n`;
        pjsipConf += `type=auth\n`;
        pjsipConf += `auth_type=${config.auth_type || 'userpass'}\n`;
        pjsipConf += `username=${config.username}\n`;
        pjsipConf += `password=${decryptedPassword}\n`;
        pjsipConf += `\n`;

        // AOR section
        pjsipConf += `[${trunkName}]\n`;
        pjsipConf += `type=aor\n`;
        pjsipConf += `contact=sip:${config.host}:${config.port || 5060}\n`;
        pjsipConf += `qualify_frequency=60\n`;
        pjsipConf += `\n`;

        // Endpoint section
        pjsipConf += `[${trunkName}]\n`;
        pjsipConf += `type=endpoint\n`;
        pjsipConf += `context=${config.context || 'from-trunk'}\n`;
        pjsipConf += `disallow=all\n`;
        pjsipConf += `allow=${config.codecs || 'ulaw,alaw'}\n`;
        pjsipConf += `outbound_auth=auth_${trunkName}\n`;
        pjsipConf += `aors=${trunkName}\n`;
        pjsipConf += `from_user=${config.username}\n`;
        pjsipConf += `from_domain=${config.host}\n`;

        if (config.transport && config.transport !== 'udp') {
          pjsipConf += `transport=transport-${config.transport}\n`;
        }

        pjsipConf += `\n`;

        // Registration section (if needed)
        if (config.register) {
          pjsipConf += `[reg_${trunkName}]\n`;
          pjsipConf += `type=registration\n`;
          pjsipConf += `outbound_auth=auth_${trunkName}\n`;
          pjsipConf += `server_uri=sip:${config.host}:${config.port || 5060}\n`;
          pjsipConf += `client_uri=sip:${config.username}@${config.host}:${config.port || 5060}\n`;
          pjsipConf += `retry_interval=60\n`;
          pjsipConf += `expiration=3600\n`;
          pjsipConf += `\n`;
        }

        // Identify section
        pjsipConf += `[${trunkName}_identify]\n`;
        pjsipConf += `type=identify\n`;
        pjsipConf += `endpoint=${trunkName}\n`;
        pjsipConf += `match=${config.host}\n`;
        pjsipConf += `\n`;

        // Dialplan - inbound from this trunk
        dialplanConf += `; Inbound from ${trunk.name}\n`;
        dialplanConf += `exten => _X.,1,NoOp(Inbound call from trunk ${trunkName})\n`;
        dialplanConf += ` same => n,Set(TRUNK_NAME=${trunkName})\n`;
        dialplanConf += ` same => n,Goto(from-internal,\${EXTEN},1)\n`;
        dialplanConf += `\n`;
      }

      // Generate outbound context with trunk routing
      dialplanConf += `\n[outbound-trunks]\n`;
      for (const trunk of trunks) {
        if (!trunk.enabled) continue;

        const config = JSON.parse(trunk.config_json);
        const trunkName = this.sanitizeName(trunk.name);
        const prefix = config.outbound_prefix || '';

        if (prefix) {
          dialplanConf += `; Outbound via ${trunk.name} (prefix: ${prefix})\n`;
          dialplanConf += `exten => _${prefix}X.,1,NoOp(Outbound via ${trunkName})\n`;
          dialplanConf += ` same => n,Set(CALLERID(num)=\${CALLERID(num)})\n`;
          dialplanConf += ` same => n,Dial(PJSIP/\${EXTEN:${prefix.length}}@${trunkName},60,tT)\n`;
          dialplanConf += ` same => n,Hangup()\n`;
          dialplanConf += `\n`;
        } else {
          dialplanConf += `; Outbound via ${trunk.name} (no prefix)\n`;
          dialplanConf += `exten => _X.,1,NoOp(Outbound via ${trunkName})\n`;
          dialplanConf += ` same => n,Set(CALLERID(num)=\${CALLERID(num)})\n`;
          dialplanConf += ` same => n,Dial(PJSIP/\${EXTEN}@${trunkName},60,tT)\n`;
          dialplanConf += ` same => n,Hangup()\n`;
          dialplanConf += `\n`;
        }
      }

      // Write config files
      this.writeConfigFile(TRUNK_CONF_FILE, pjsipConf);
      this.writeConfigFile(TRUNK_DIALPLAN_FILE, dialplanConf);

      logger.info('All trunk configs generated', {
        trunkCount: trunks.length,
      });
    } catch (err) {
      logger.error('Failed to generate trunk configs', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
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

  private writeConfigFile(filename: string, content: string): void {
    try {
      const configPath = path.join(ASTERISK_CONFIG_DIR, filename);
      const configDir = path.dirname(configPath);

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(configPath, content, { encoding: 'utf8', mode: 0o644 });
      logger.info('Config file written', { path: configPath });
    } catch (err) {
      logger.error('Failed to write config file', {
        filename,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
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

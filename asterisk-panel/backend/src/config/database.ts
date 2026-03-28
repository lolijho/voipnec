import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { logger } from '../logger';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'asterisk-panel.db');

let db: Database.Database;

export function initializeDatabase(): Database.Database {
  const fs = require('fs');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  seedAdminUser();

  logger.info(`Database initialized at ${DB_PATH}`);
  return db;
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator' CHECK(role IN ('admin', 'operator')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id TEXT PRIMARY KEY,
      uniqueid TEXT NOT NULL,
      channel TEXT,
      callerid TEXT,
      exten TEXT,
      context TEXT,
      duration INTEGER DEFAULT 0,
      disposition TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      trunk TEXT,
      recording_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_call_logs_timestamp ON call_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_call_logs_callerid ON call_logs(callerid);
    CREATE INDEX IF NOT EXISTS idx_call_logs_exten ON call_logs(exten);
    CREATE INDEX IF NOT EXISTS idx_call_logs_uniqueid ON call_logs(uniqueid);

    CREATE TABLE IF NOT EXISTS extensions (
      id TEXT PRIMARY KEY,
      exten TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      secret TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT 'from-internal',
      transport TEXT NOT NULL DEFAULT 'udp' CHECK(transport IN ('udp', 'tcp', 'tls')),
      codecs TEXT NOT NULL DEFAULT 'ulaw,alaw,g729',
      enabled INTEGER NOT NULL DEFAULT 1,
      mailbox TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_extensions_exten ON extensions(exten);

    CREATE TABLE IF NOT EXISTS trunks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('messagenet', 'twilio', 'generic')),
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS phonebook (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      number TEXT NOT NULL,
      email TEXT,
      company TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_phonebook_name ON phonebook(name);
    CREATE INDEX IF NOT EXISTS idx_phonebook_number ON phonebook(number);

    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      ip TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
  `);

  logger.info('Database tables created/verified');
}

function seedAdminUser(): void {
  const adminUsername = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (existing) {
    logger.info(`Admin user "${adminUsername}" already exists, skipping seed`);
    return;
  }

  const { v4: uuidv4 } = require('uuid');
  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  const id = uuidv4();

  db.prepare(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(id, adminUsername, passwordHash, 'admin');

  logger.info(`Admin user "${adminUsername}" seeded successfully`);
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export { db };

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  authenticateToken,
  AuthenticatedRequest,
} from '../middleware/auth';
import { logger } from '../logger';
import Database from 'better-sqlite3';

interface PhonebookDeps {
  amiService?: any;
  ariService?: any;
  callLogService?: any;
  trunkService?: any;
  db: Database.Database;
}

interface PhonebookRow {
  id: string;
  name: string;
  number: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
}

export function createRouter(deps: PhonebookDeps): Router {
  const router = Router();
  const { db } = deps;

  // All routes are protected
  router.use(authenticateToken);

  // GET /export - export as CSV (must be before /:id to avoid route conflict)
  router.get('/export', (_req: AuthenticatedRequest, res: Response) => {
    try {
      const entries = db
        .prepare('SELECT * FROM phonebook ORDER BY name')
        .all() as PhonebookRow[];

      const csvHeader = 'Name,Number,Email,Company,Notes';
      const csvRows = entries.map((entry) =>
        [entry.name, entry.number, entry.email || '', entry.company || '', entry.notes || '']
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(',')
      );

      const csv = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="phonebook_${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(csv);
    } catch (err) {
      logger.error('Failed to export phonebook', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to export phonebook' });
    }
  });

  // GET / - list phonebook entries with search and pagination
  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = (req.query.search as string) || '';
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
      const offset = (page - 1) * limit;

      let entries: PhonebookRow[];
      let total: number;

      if (search) {
        const searchPattern = `%${search}%`;

        total = (
          db
            .prepare(
              `SELECT COUNT(*) as count FROM phonebook
               WHERE name LIKE ? OR number LIKE ? OR email LIKE ? OR company LIKE ?`
            )
            .get(searchPattern, searchPattern, searchPattern, searchPattern) as { count: number }
        ).count;

        entries = db
          .prepare(
            `SELECT * FROM phonebook
             WHERE name LIKE ? OR number LIKE ? OR email LIKE ? OR company LIKE ?
             ORDER BY name LIMIT ? OFFSET ?`
          )
          .all(searchPattern, searchPattern, searchPattern, searchPattern, limit, offset) as PhonebookRow[];
      } else {
        total = (
          db.prepare('SELECT COUNT(*) as count FROM phonebook').get() as { count: number }
        ).count;

        entries = db
          .prepare('SELECT * FROM phonebook ORDER BY name LIMIT ? OFFSET ?')
          .all(limit, offset) as PhonebookRow[];
      }

      const totalPages = Math.ceil(total / limit);

      res.json({
        entries,
        total,
        page,
        limit,
        totalPages,
      });
    } catch (err) {
      logger.error('Failed to list phonebook entries', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to list phonebook entries' });
    }
  });

  // GET /:id - get one entry
  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const entry = db
        .prepare('SELECT * FROM phonebook WHERE id = ?')
        .get(id) as PhonebookRow | undefined;

      if (!entry) {
        res.status(404).json({ error: 'Phonebook entry not found' });
        return;
      }

      res.json({ entry });
    } catch (err) {
      logger.error('Failed to get phonebook entry', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get phonebook entry' });
    }
  });

  // POST / - create entry
  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, number, email, company, notes } = req.body;

      if (!name || !number) {
        res.status(400).json({ error: '"name" and "number" are required' });
        return;
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO phonebook (id, name, number, email, company, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, name, number, email || null, company || null, notes || null, now);

      logger.info('Phonebook entry created', {
        user: req.user?.username,
        id,
        name,
        number,
      });

      res.status(201).json({
        entry: {
          id,
          name,
          number,
          email: email || null,
          company: company || null,
          notes: notes || null,
          created_at: now,
        },
      });
    } catch (err) {
      logger.error('Failed to create phonebook entry', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to create phonebook entry' });
    }
  });

  // PUT /:id - update entry
  router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, number, email, company, notes } = req.body;

      const existing = db
        .prepare('SELECT * FROM phonebook WHERE id = ?')
        .get(id) as PhonebookRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Phonebook entry not found' });
        return;
      }

      const updatedName = name || existing.name;
      const updatedNumber = number || existing.number;
      const updatedEmail = email !== undefined ? (email || null) : existing.email;
      const updatedCompany = company !== undefined ? (company || null) : existing.company;
      const updatedNotes = notes !== undefined ? (notes || null) : existing.notes;

      db.prepare(
        `UPDATE phonebook SET name = ?, number = ?, email = ?, company = ?, notes = ?
         WHERE id = ?`
      ).run(updatedName, updatedNumber, updatedEmail, updatedCompany, updatedNotes, id);

      logger.info('Phonebook entry updated', {
        user: req.user?.username,
        id,
      });

      res.json({
        entry: {
          id,
          name: updatedName,
          number: updatedNumber,
          email: updatedEmail,
          company: updatedCompany,
          notes: updatedNotes,
          created_at: existing.created_at,
        },
      });
    } catch (err) {
      logger.error('Failed to update phonebook entry', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to update phonebook entry' });
    }
  });

  // DELETE /:id - delete entry
  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const existing = db
        .prepare('SELECT id FROM phonebook WHERE id = ?')
        .get(id) as { id: string } | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Phonebook entry not found' });
        return;
      }

      db.prepare('DELETE FROM phonebook WHERE id = ?').run(id);

      logger.info('Phonebook entry deleted', {
        user: req.user?.username,
        id,
      });

      res.json({ message: 'Phonebook entry deleted' });
    } catch (err) {
      logger.error('Failed to delete phonebook entry', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to delete phonebook entry' });
    }
  });

  // POST /import - import from CSV
  router.post('/import', (req: AuthenticatedRequest, res: Response) => {
    try {
      const csvText = typeof req.body === 'string' ? req.body : req.body.csv;

      if (!csvText || typeof csvText !== 'string') {
        res.status(400).json({
          error: 'CSV data is required. Send as text body or { "csv": "..." }',
        });
        return;
      }

      const lines = csvText
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);

      if (lines.length < 2) {
        res.status(400).json({ error: 'CSV must contain a header row and at least one data row' });
        return;
      }

      // Parse header to determine column mapping
      const header = parseCsvLine(lines[0]).map((h: string) => h.toLowerCase().trim());
      const nameIdx = header.indexOf('name');
      const numberIdx = header.indexOf('number');

      if (nameIdx === -1 || numberIdx === -1) {
        res.status(400).json({
          error: 'CSV must have "Name" and "Number" columns in the header',
        });
        return;
      }

      const emailIdx = header.indexOf('email');
      const companyIdx = header.indexOf('company');
      const notesIdx = header.indexOf('notes');

      const insertStmt = db.prepare(
        `INSERT INTO phonebook (id, name, number, email, company, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      const insertMany = db.transaction(() => {
        for (let i = 1; i < lines.length; i++) {
          try {
            const fields = parseCsvLine(lines[i]);
            const name = fields[nameIdx]?.trim();
            const number = fields[numberIdx]?.trim();

            if (!name || !number) {
              skipped++;
              errors.push(`Row ${i + 1}: missing name or number`);
              continue;
            }

            const id = uuidv4();
            const now = new Date().toISOString();

            insertStmt.run(
              id,
              name,
              number,
              emailIdx >= 0 ? (fields[emailIdx]?.trim() || null) : null,
              companyIdx >= 0 ? (fields[companyIdx]?.trim() || null) : null,
              notesIdx >= 0 ? (fields[notesIdx]?.trim() || null) : null,
              now
            );
            imported++;
          } catch (rowErr) {
            skipped++;
            errors.push(
              `Row ${i + 1}: ${rowErr instanceof Error ? rowErr.message : 'Unknown error'}`
            );
          }
        }
      });

      insertMany();

      logger.info('Phonebook CSV imported', {
        user: req.user?.username,
        imported,
        skipped,
      });

      res.json({
        message: 'Import completed',
        imported,
        skipped,
        errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
      });
    } catch (err) {
      logger.error('Failed to import phonebook CSV', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to import phonebook' });
    }
  });

  return router;
}

/**
 * Simple CSV line parser that handles quoted fields with commas and escaped quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

export default createRouter;

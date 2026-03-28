import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { logger } from '../logger';

export interface CallLogEntry {
  uniqueid: string;
  channel?: string;
  callerid?: string;
  exten?: string;
  context?: string;
  duration?: number;
  disposition?: string;
  timestamp?: string;
  trunk?: string;
  recording_path?: string;
}

export interface CallLogRecord extends CallLogEntry {
  id: string;
}

export interface CallLogFilters {
  from?: string;
  to?: string;
  dateFrom?: string;
  dateTo?: string;
  trunk?: string;
  disposition?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedCallLogs {
  data: CallLogRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HourlyStat {
  hour: number;
  count: number;
}

export interface CallStats {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  failedCalls: number;
  busyCalls: number;
  totalDuration: number;
  avgDuration: number;
  byHour: HourlyStat[];
}

export class CallLogService {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  logCall(data: CallLogEntry): CallLogRecord {
    try {
      const id = uuidv4();
      const timestamp = data.timestamp || new Date().toISOString();

      this.db
        .prepare(
          `INSERT INTO call_logs (id, uniqueid, channel, callerid, exten, context, duration, disposition, timestamp, trunk, recording_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          data.uniqueid,
          data.channel || null,
          data.callerid || null,
          data.exten || null,
          data.context || null,
          data.duration || 0,
          data.disposition || null,
          timestamp,
          data.trunk || null,
          data.recording_path || null
        );

      logger.info('Call logged', { id, uniqueid: data.uniqueid });

      return {
        id,
        ...data,
        timestamp,
      };
    } catch (err) {
      logger.error('Failed to log call', {
        uniqueid: data.uniqueid,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  getCalls(filters: CallLogFilters): PaginatedCallLogs {
    try {
      const page = filters.page && filters.page > 0 ? filters.page : 1;
      const limit =
        filters.limit && filters.limit > 0 && filters.limit <= 500
          ? filters.limit
          : 50;
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];

      if (filters.from) {
        conditions.push('callerid LIKE ?');
        params.push(`%${filters.from}%`);
      }

      if (filters.to) {
        conditions.push('exten LIKE ?');
        params.push(`%${filters.to}%`);
      }

      if (filters.dateFrom) {
        conditions.push('timestamp >= ?');
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        conditions.push('timestamp <= ?');
        params.push(filters.dateTo);
      }

      if (filters.trunk) {
        conditions.push('trunk = ?');
        params.push(filters.trunk);
      }

      if (filters.disposition) {
        conditions.push('disposition = ?');
        params.push(filters.disposition);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRow = this.db
        .prepare(`SELECT COUNT(*) as total FROM call_logs ${whereClause}`)
        .get(...params) as { total: number };

      const total = countRow.total;
      const totalPages = Math.ceil(total / limit);

      const rows = this.db
        .prepare(
          `SELECT id, uniqueid, channel, callerid, exten, context, duration, disposition, timestamp, trunk, recording_path
           FROM call_logs
           ${whereClause}
           ORDER BY timestamp DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset) as CallLogRecord[];

      return {
        data: rows,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (err) {
      logger.error('Failed to get calls', {
        filters,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  getCallStats(period: '24h' | '7d' | '30d'): CallStats {
    try {
      let dateThreshold: string;
      const now = new Date();

      switch (period) {
        case '24h':
          dateThreshold = new Date(
            now.getTime() - 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case '7d':
          dateThreshold = new Date(
            now.getTime() - 7 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case '30d':
          dateThreshold = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
      }

      const totalsRow = this.db
        .prepare(
          `SELECT
             COUNT(*) as totalCalls,
             COALESCE(SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END), 0) as answeredCalls,
             COALESCE(SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END), 0) as missedCalls,
             COALESCE(SUM(CASE WHEN disposition = 'FAILED' THEN 1 ELSE 0 END), 0) as failedCalls,
             COALESCE(SUM(CASE WHEN disposition = 'BUSY' THEN 1 ELSE 0 END), 0) as busyCalls,
             COALESCE(SUM(duration), 0) as totalDuration,
             COALESCE(AVG(CASE WHEN disposition = 'ANSWERED' AND duration > 0 THEN duration END), 0) as avgDuration
           FROM call_logs
           WHERE timestamp >= ?`
        )
        .get(dateThreshold) as {
        totalCalls: number;
        answeredCalls: number;
        missedCalls: number;
        failedCalls: number;
        busyCalls: number;
        totalDuration: number;
        avgDuration: number;
      };

      const hourlyRows = this.db
        .prepare(
          `SELECT
             CAST(strftime('%H', timestamp) AS INTEGER) as hour,
             COUNT(*) as count
           FROM call_logs
           WHERE timestamp >= ?
           GROUP BY strftime('%H', timestamp)
           ORDER BY hour`
        )
        .all(dateThreshold) as HourlyStat[];

      // Fill in missing hours with zero counts
      const byHour: HourlyStat[] = [];
      const hourlyMap = new Map<number, number>();
      for (const row of hourlyRows) {
        hourlyMap.set(row.hour, row.count);
      }
      for (let h = 0; h < 24; h++) {
        byHour.push({
          hour: h,
          count: hourlyMap.get(h) || 0,
        });
      }

      return {
        totalCalls: totalsRow.totalCalls,
        answeredCalls: totalsRow.answeredCalls,
        missedCalls: totalsRow.missedCalls,
        failedCalls: totalsRow.failedCalls,
        busyCalls: totalsRow.busyCalls,
        totalDuration: totalsRow.totalDuration,
        avgDuration: Math.round(totalsRow.avgDuration),
        byHour,
      };
    } catch (err) {
      logger.error('Failed to get call stats', {
        period,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  exportCSV(filters: CallLogFilters): string {
    try {
      // Use getCalls without pagination to get all matching records
      const unlimitedFilters: CallLogFilters = {
        ...filters,
        page: 1,
        limit: 500,
      };

      // Collect all pages
      const allRecords: CallLogRecord[] = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        unlimitedFilters.page = currentPage;
        const result = this.getCalls(unlimitedFilters);
        allRecords.push(...result.data);
        totalPages = result.totalPages;
        currentPage++;
      } while (currentPage <= totalPages);

      const headers = [
        'ID',
        'Unique ID',
        'Channel',
        'Caller ID',
        'Extension',
        'Context',
        'Duration (s)',
        'Disposition',
        'Timestamp',
        'Trunk',
        'Recording',
      ];

      const csvRows: string[] = [headers.join(',')];

      for (const record of allRecords) {
        const row = [
          this.escapeCsvField(record.id),
          this.escapeCsvField(record.uniqueid),
          this.escapeCsvField(record.channel || ''),
          this.escapeCsvField(record.callerid || ''),
          this.escapeCsvField(record.exten || ''),
          this.escapeCsvField(record.context || ''),
          String(record.duration || 0),
          this.escapeCsvField(record.disposition || ''),
          this.escapeCsvField(record.timestamp || ''),
          this.escapeCsvField(record.trunk || ''),
          this.escapeCsvField(record.recording_path || ''),
        ];
        csvRows.push(row.join(','));
      }

      return csvRows.join('\n');
    } catch (err) {
      logger.error('Failed to export CSV', {
        filters,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  getCallById(id: number | string): CallLogRecord | null {
    try {
      const row = this.db
        .prepare(
          `SELECT id, uniqueid, channel, callerid, exten, context, duration, disposition, timestamp, trunk, recording_path
           FROM call_logs
           WHERE id = ?`
        )
        .get(String(id)) as CallLogRecord | undefined;

      return row || null;
    } catch (err) {
      logger.error('Failed to get call by ID', {
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  private escapeCsvField(value: string): string {
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

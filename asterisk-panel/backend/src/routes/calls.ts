import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';

interface CallsDeps {
  amiService: any;
  ariService: any;
  callLogService: any;
  trunkService?: any;
  db: any;
}

export function createRouter(deps: CallsDeps): Router {
  const router = Router();
  const { amiService, ariService, callLogService } = deps;

  // All routes are protected
  router.use(authenticateToken);

  // GET /active
  router.get('/active', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }
      const calls = await amiService.getActiveCalls();
      res.json({ calls });
    } catch (err) {
      logger.error('Failed to get active calls', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get active calls' });
    }
  });

  // POST /originate
  router.post('/originate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { from, to, context, trunk } = req.body;

      if (!from || !to) {
        res.status(400).json({ error: '"from" and "to" are required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.originateCall(
        from,
        to,
        context || 'from-internal',
        trunk
      );

      logger.info('Call originated via API', {
        user: req.user?.username,
        from,
        to,
        context: context || 'from-internal',
        trunk,
      });

      res.json({ message: 'Call originated', result });
    } catch (err) {
      logger.error('Failed to originate call', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to originate call' });
    }
  });

  // POST /hangup
  router.post('/hangup', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel } = req.body;

      if (!channel) {
        res.status(400).json({ error: '"channel" is required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.hangupChannel(channel);

      logger.info('Channel hung up via API', {
        user: req.user?.username,
        channel,
      });

      res.json({ message: 'Channel hung up', result });
    } catch (err) {
      logger.error('Failed to hangup channel', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to hangup channel' });
    }
  });

  // POST /transfer/blind
  router.post('/transfer/blind', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel, exten, context } = req.body;

      if (!channel || !exten) {
        res.status(400).json({ error: '"channel" and "exten" are required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.transferBlind(channel, exten, context || 'from-internal');

      logger.info('Blind transfer via API', {
        user: req.user?.username,
        channel,
        exten,
        context: context || 'from-internal',
      });

      res.json({ message: 'Blind transfer executed', result });
    } catch (err) {
      logger.error('Failed to execute blind transfer', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to execute blind transfer' });
    }
  });

  // POST /transfer/attended
  router.post('/transfer/attended', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel, exten, context } = req.body;

      if (!channel || !exten) {
        res.status(400).json({ error: '"channel" and "exten" are required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.transferAttended(channel, exten, context || 'from-internal');

      logger.info('Attended transfer via API', {
        user: req.user?.username,
        channel,
        exten,
        context: context || 'from-internal',
      });

      res.json({ message: 'Attended transfer executed', result });
    } catch (err) {
      logger.error('Failed to execute attended transfer', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to execute attended transfer' });
    }
  });

  // POST /hold
  router.post('/hold', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel } = req.body;

      if (!channel) {
        res.status(400).json({ error: '"channel" is required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.holdCall(channel);
      res.json({ message: 'Call put on hold', result });
    } catch (err) {
      logger.error('Failed to hold call', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to hold call' });
    }
  });

  // POST /unhold
  router.post('/unhold', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel } = req.body;

      if (!channel) {
        res.status(400).json({ error: '"channel" is required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.unholdCall(channel);
      res.json({ message: 'Call taken off hold', result });
    } catch (err) {
      logger.error('Failed to unhold call', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to unhold call' });
    }
  });

  // POST /park
  router.post('/park', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel } = req.body;

      if (!channel) {
        res.status(400).json({ error: '"channel" is required' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.parkCall(channel);
      res.json({ message: 'Call parked', result });
    } catch (err) {
      logger.error('Failed to park call', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to park call' });
    }
  });

  // POST /dtmf
  router.post('/dtmf', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel, digit } = req.body;

      if (!channel || !digit) {
        res.status(400).json({ error: '"channel" and "digit" are required' });
        return;
      }

      if (!/^[0-9*#A-Da-d]$/.test(digit)) {
        res.status(400).json({ error: 'Invalid DTMF digit' });
        return;
      }

      if (!amiService) {
        res.status(503).json({ error: 'AMI service not available' });
        return;
      }

      const result = await amiService.sendDTMF(channel, digit);
      res.json({ message: 'DTMF sent', result });
    } catch (err) {
      logger.error('Failed to send DTMF', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to send DTMF' });
    }
  });

  // GET /history
  router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!callLogService) {
        res.status(503).json({ error: 'Call log service not available' });
        return;
      }

      const filters = {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        disposition: req.query.disposition as string | undefined,
        trunk: req.query.trunk as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await callLogService.getCalls(filters);
      res.json(result);
    } catch (err) {
      logger.error('Failed to get call history', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get call history' });
    }
  });

  // GET /stats
  router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!callLogService) {
        res.status(503).json({ error: 'Call log service not available' });
        return;
      }

      const period = (req.query.period as string) || 'day';
      const validPeriods = ['hour', 'day', 'week', 'month'];

      if (!validPeriods.includes(period)) {
        res.status(400).json({
          error: `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
        });
        return;
      }

      const stats = await callLogService.getCallStats(period);
      res.json({ stats });
    } catch (err) {
      logger.error('Failed to get call stats', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to get call stats' });
    }
  });

  // GET /export
  router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!callLogService) {
        res.status(503).json({ error: 'Call log service not available' });
        return;
      }

      const filters = {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        disposition: req.query.disposition as string | undefined,
        trunk: req.query.trunk as string | undefined,
        limit: 10000,
        offset: 0,
      };

      const result = await callLogService.getCalls(filters);
      const calls = result.calls || result.data || result;

      const csvHeader = 'ID,UniqueID,Channel,CallerID,Extension,Context,Duration,Disposition,Timestamp,Trunk,Recording';
      const csvRows = Array.isArray(calls)
        ? calls.map((call: any) =>
            [
              call.id || '',
              call.uniqueid || '',
              call.channel || '',
              call.callerid || '',
              call.exten || '',
              call.context || '',
              call.duration || 0,
              call.disposition || '',
              call.timestamp || '',
              call.trunk || '',
              call.recording_path || '',
            ]
              .map((field) => `"${String(field).replace(/"/g, '""')}"`)
              .join(',')
          )
        : [];

      const csv = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="call_history_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (err) {
      logger.error('Failed to export call history', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to export call history' });
    }
  });

  // GET /recordings
  router.get('/recordings', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ariService) {
        res.status(503).json({ error: 'ARI service not available' });
        return;
      }

      const recordings = await ariService.listRecordings();
      res.json({ recordings });
    } catch (err) {
      logger.error('Failed to list recordings', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to list recordings' });
    }
  });

  // POST /record/start
  router.post('/record/start', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { channel, filename } = req.body;

      if (!channel || !filename) {
        res.status(400).json({ error: '"channel" and "filename" are required' });
        return;
      }

      if (!ariService) {
        res.status(503).json({ error: 'ARI service not available' });
        return;
      }

      const result = await ariService.startRecording(channel, filename);

      logger.info('Recording started via API', {
        user: req.user?.username,
        channel,
        filename,
      });

      res.json({ message: 'Recording started', result });
    } catch (err) {
      logger.error('Failed to start recording', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to start recording' });
    }
  });

  // POST /record/stop
  router.post('/record/stop', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { recordingName } = req.body;

      if (!recordingName) {
        res.status(400).json({ error: '"recordingName" is required' });
        return;
      }

      if (!ariService) {
        res.status(503).json({ error: 'ARI service not available' });
        return;
      }

      const result = await ariService.stopRecording(recordingName);

      logger.info('Recording stopped via API', {
        user: req.user?.username,
        recordingName,
      });

      res.json({ message: 'Recording stopped', result });
    } catch (err) {
      logger.error('Failed to stop recording', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Failed to stop recording' });
    }
  });

  return router;
}

export default createRouter;

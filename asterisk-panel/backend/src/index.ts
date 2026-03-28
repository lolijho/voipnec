import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './logger';
import { initializeDatabase } from './config/database';
import { verifyToken, JwtPayload } from './middleware/auth';

// ── Express App ────────────────────────────────────────────────────────────────

const app = express();

// Trust proxy (behind Coolify/nginx reverse proxy)
app.set('trust proxy', 1);

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ──────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// ── HTTP Server & Socket.io ────────────────────────────────────────────────────

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  },
});

// Socket.io authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    logger.warn('Socket.io connection rejected: no token', {
      address: socket.handshake.address,
    });
    return next(new Error('Authentication required'));
  }

  const user = verifyToken(token);
  if (!user) {
    logger.warn('Socket.io connection rejected: invalid token', {
      address: socket.handshake.address,
    });
    return next(new Error('Invalid or expired token'));
  }

  // Attach user data to the socket
  (socket as any).user = user;
  next();
});

io.on('connection', (socket) => {
  const user = (socket as any).user as JwtPayload;
  logger.info('Socket.io client connected', {
    userId: user.userId,
    username: user.username,
    role: user.role,
    socketId: socket.id,
  });

  // Join a room based on role for targeted broadcasts
  socket.join(`role:${user.role}`);
  socket.join(`user:${user.userId}`);

  socket.on('disconnect', (reason) => {
    logger.info('Socket.io client disconnected', {
      userId: user.userId,
      username: user.username,
      socketId: socket.id,
      reason,
    });
  });
});

// Make io accessible to routes
app.set('io', io);

// ── Database Initialization ────────────────────────────────────────────────────

let db: ReturnType<typeof initializeDatabase>;
try {
  db = initializeDatabase();
} catch (err) {
  logger.error('Failed to initialize database', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
  process.exit(1);
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Health check (unauthenticated)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Services Initialization ───────────────────────────────────────────────────

let amiService: any = null;
let ariService: any = null;
let callLogService: any = null;
let trunkService: any = null;

try {
  const { AmiService } = require('./services/AmiService');
  const amiConfig = {
    host: process.env.ASTERISK_HOST || '127.0.0.1',
    port: parseInt(process.env.ASTERISK_AMI_PORT || '5038', 10),
    user: process.env.ASTERISK_AMI_USER || 'admin',
    password: process.env.ASTERISK_AMI_PASSWORD || 'supersecret',
  };
  amiService = new AmiService(amiConfig, io);
  amiService.connect();
  app.set('amiService', amiService);
  logger.info('AMI service initialized', { host: amiConfig.host, port: amiConfig.port });
} catch (err) {
  logger.warn('AMI service not available', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
}

try {
  const { AriService } = require('./services/AriService');
  const ariConfig = {
    url: process.env.ASTERISK_ARI_URL || 'http://127.0.0.1:8088',
    user: process.env.ASTERISK_ARI_USER || 'ariuser',
    password: process.env.ASTERISK_ARI_PASSWORD || 'arisecret',
  };
  ariService = new AriService(ariConfig, io);
  ariService.connect();
  app.set('ariService', ariService);
  logger.info('ARI service initialized', { url: ariConfig.url });
} catch (err) {
  logger.warn('ARI service not available', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
}

try {
  const { CallLogService } = require('./services/CallLogService');
  callLogService = new CallLogService(db);
  app.set('callLogService', callLogService);
  logger.info('CallLog service initialized');
} catch (err) {
  logger.warn('CallLog service not available', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
}

try {
  const { TrunkService } = require('./services/TrunkService');
  trunkService = new TrunkService(amiService);
  app.set('trunkService', trunkService);
  logger.info('Trunk service initialized');
} catch (err) {
  logger.warn('Trunk service not available', {
    error: err instanceof Error ? err.message : 'Unknown error',
  });
}

// ── Route Mounting ────────────────────────────────────────────────────────────

const deps = { amiService, ariService, callLogService, trunkService, db };

function mountRoute(routePath: string, modulePath: string): void {
  try {
    const mod = require(modulePath);
    const factory = mod.createRouter || mod.default;
    if (typeof factory === 'function') {
      const router = factory(deps);
      app.use(routePath, router);
      logger.info(`Route mounted: ${routePath}`);
    }
  } catch (err) {
    logger.warn(`Route module not found or failed to load: ${modulePath}`, {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

mountRoute('/api/auth', './routes/auth');
mountRoute('/api/calls', './routes/calls');
mountRoute('/api/extensions', './routes/extensions');
mountRoute('/api/trunks', './routes/trunks');
mountRoute('/api/phonebook', './routes/phonebook');

// ── Serve Frontend Static Files ───────────────────────────────────────────────

const frontendPath = path.join(__dirname, '..', 'public');
app.use(express.static(frontendPath));

// SPA fallback: serve index.html for non-API routes
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api') || _req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      next();
    }
  });
});

// ── Error Handling ─────────────────────────────────────────────────────────────

// 404 handler (only API routes reach here)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`AsteriskPanel backend listening on ${HOST}:${PORT}`, {
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin,
  });
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────────

function gracefulShutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');

    io.close(() => {
      logger.info('Socket.io server closed');
    });

    if (db) {
      try {
        db.close();
        logger.info('Database connection closed');
      } catch {
        // Already closed or not open
      }
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server, io };

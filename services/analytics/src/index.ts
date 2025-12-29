/**
 * Nexus Law Analytics Service
 *
 * Real-time metrics, cost tracking, and insights dashboard
 *
 * Features:
 * - Real-time metrics collection (API calls, tasks, documents)
 * - Cost tracking and savings analysis
 * - User activity analytics
 * - Performance monitoring (latency, throughput, errors)
 * - WebSocket streaming for live dashboards
 * - Time-series data with TimescaleDB
 *
 * Port: 9203
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createClient } from 'redis';
import winston from 'winston';
import Queue from 'bull';

// Routes
import { createMetricsRoutes } from './routes/metrics';
import { createCostRoutes } from './routes/cost';
import { createUsageRoutes } from './routes/usage';
import { createPerformanceRoutes } from './routes/performance';

// Services
import { MetricsCollector } from './services/metrics-collector';
import { CostAnalyzer } from './services/cost-analyzer';
import { PerformanceMonitor } from './services/performance-monitor';

// WebSocket handlers
import { setupAnalyticsWebSocket } from './websocket/analytics-handlers';

// Middleware
import { usageTrackingMiddleware, flushPendingReports } from './middleware/usage-tracking';

dotenv.config();

// ========================================================================
// CONFIGURATION
// ========================================================================

const config = {
  port: parseInt(process.env.ANALYTICS_PORT || '9203', 10),
  env: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'nexus_law',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  metrics: {
    collectionInterval: parseInt(process.env.METRICS_INTERVAL || '60000', 10), // 1 minute
    retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '90', 10),
  },
};

// ========================================================================
// LOGGING
// ========================================================================

const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'logs/analytics-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/analytics.log' }),
  ],
});

export { logger };

// ========================================================================
// DATABASE & CACHE
// ========================================================================

const pgPool = new Pool(config.database);

pgPool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

const redisClient = createClient({ url: config.redis.url });

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

export const db = {
  pg: pgPool,
  redis: redisClient,
};

// ========================================================================
// BACKGROUND JOBS (Bull Queue)
// ========================================================================

const metricsQueue = new Queue('analytics-metrics', config.redis.url);

// Process metrics collection jobs
metricsQueue.process('collect-metrics', async (job) => {
  logger.debug('Processing metrics collection job', { jobId: job.id });

  try {
    const collector = new MetricsCollector(db);
    await collector.collectAllMetrics();
    return { success: true };
  } catch (error: any) {
    logger.error('Metrics collection failed:', error);
    throw error;
  }
});

// Schedule recurring metrics collection
metricsQueue.add(
  'collect-metrics',
  {},
  {
    repeat: {
      every: config.metrics.collectionInterval,
    },
  }
);

logger.info(`Metrics collection scheduled every ${config.metrics.collectionInterval}ms`);

export { metricsQueue };

// ========================================================================
// EXPRESS APP
// ========================================================================

const app = express();
const httpServer = createServer(app);

// ========================================================================
// SOCKET.IO
// ========================================================================

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Setup WebSocket handlers
setupAnalyticsWebSocket(io, db, logger);

export { io };

// ========================================================================
// MIDDLEWARE
// ========================================================================

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// Request ID
app.use((req: Request, res: Response, next) => {
  req.id = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Usage tracking middleware
app.use(usageTrackingMiddleware);

// ========================================================================
// SERVICES INITIALIZATION
// ========================================================================

const metricsCollector = new MetricsCollector(db);
const costAnalyzer = new CostAnalyzer(db);
const performanceMonitor = new PerformanceMonitor(db);

export const services = {
  metricsCollector,
  costAnalyzer,
  performanceMonitor,
};

// ========================================================================
// ROUTES
// ========================================================================

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'analytics',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// Analytics routes
app.use('/api/metrics', createMetricsRoutes(services, db));
app.use('/api/cost', createCostRoutes(services, db));
app.use('/api/usage', createUsageRoutes(services, db));
app.use('/api/performance', createPerformanceRoutes(services, db));

// Root
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Nexus Law Analytics API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      metrics: '/api/metrics',
      cost: '/api/cost',
      usage: '/api/usage',
      performance: '/api/performance',
      websocket: 'ws://localhost:9203',
    },
  });
});

// 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  logger.error('Request error:', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: config.env === 'production' ? 'Internal server error' : err.message,
    requestId: req.id,
  });
});

// ========================================================================
// GRACEFUL SHUTDOWN
// ========================================================================

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Flush pending usage reports
  try {
    await flushPendingReports();
    logger.info('Pending usage reports flushed');
  } catch (err) {
    logger.error('Error flushing usage reports:', err);
  }

  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  io.close(() => {
    logger.info('WebSocket server closed');
  });

  try {
    await pgPool.end();
    logger.info('PostgreSQL pool closed');
  } catch (err) {
    logger.error('Error closing PostgreSQL:', err);
  }

  try {
    await redisClient.quit();
    logger.info('Redis closed');
  } catch (err) {
    logger.error('Error closing Redis:', err);
  }

  try {
    await metricsQueue.close();
    logger.info('Metrics queue closed');
  } catch (err) {
    logger.error('Error closing queue:', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========================================================================
// START SERVER
// ========================================================================

async function startServer() {
  try {
    // Connect to Redis
    await redisClient.connect();
    logger.info('Connected to Redis');

    // Test PostgreSQL
    const client = await pgPool.connect();
    logger.info('Connected to PostgreSQL');

    // Check TimescaleDB extension
    const result = await client.query("SELECT extname FROM pg_extension WHERE extname = 'timescaledb'");
    if (result.rows.length > 0) {
      logger.info('✅ TimescaleDB extension available');
    } else {
      logger.warn('⚠️  TimescaleDB extension not installed - time-series features limited');
    }

    client.release();

    // Start server
    httpServer.listen(config.port, () => {
      logger.info(`🚀 Nexus Law Analytics Service started`);
      logger.info(`📊 Analytics API: http://localhost:${config.port}`);
      logger.info(`📡 WebSocket: ws://localhost:${config.port}`);
      logger.info(`🏥 Health: http://localhost:${config.port}/health`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`📈 Metrics interval: ${config.metrics.collectionInterval}ms`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// TypeScript declarations
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

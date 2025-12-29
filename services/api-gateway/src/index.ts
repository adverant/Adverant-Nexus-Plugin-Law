/**
 * Nexus Law API Gateway
 *
 * Unified REST + WebSocket API with full Nexus Stack integration
 *
 * Features:
 * - REST API for synchronous operations
 * - WebSocket for streaming and real-time updates
 * - Authentication & authorization
 * - Rate limiting & circuit breakers
 * - Request validation
 * - Error handling
 * - Logging & monitoring
 * - Health checks
 *
 * Integrations:
 * - MageAgent: Multi-agent legal intelligence
 * - GraphRAG: Document DNA, semantic search, citation networks
 * - FileProcess: High-volume document processing
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createClient } from 'redis';
import winston from 'winston';

// Nexus Stack Clients
import { MageAgentClient } from '@nexus-law/shared';
import { GraphRAGClient } from '@nexus-law/shared';
import { FileProcessClient } from '@nexus-law/shared';

// Routes
import { createResearchRoutes } from './routes/research';
import { createDocumentRoutes } from './routes/documents';
import { createQueryRoutes } from './routes/queries';
import { createCitationRoutes } from './routes/citations';
import { createAuthRoutes } from './routes/auth';
import { createHealthRoutes } from './routes/health';

// Middleware
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { validateRequest } from './middleware/validation';
import { circuitBreaker } from './middleware/circuit-breaker';
import { usageTrackingMiddleware, flushPendingReports } from './middleware/usage-tracking';

// WebSocket handlers
import { setupWebSocketHandlers } from './websocket/handlers';

// Load environment variables
dotenv.config();

// ========================================================================
// CONFIGURATION
// ========================================================================

const config = {
  port: parseInt(process.env.PORT || '9200', 10),
  env: process.env.NODE_ENV || 'development',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'nexus_law',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Nexus Stack Services
  nexus: {
    mageagent: {
      baseUrl: process.env.MAGEAGENT_URL || 'http://localhost:9080',
      graphragUrl: process.env.GRAPHRAG_WS_URL || 'http://localhost:9090',
    },
    graphrag: {
      baseUrl: process.env.GRAPHRAG_URL || 'http://localhost:9090',
      wsUrl: process.env.GRAPHRAG_WS_URL || 'http://localhost:9090',
    },
    fileprocess: {
      baseUrl: process.env.FILEPROCESS_URL || 'http://localhost:9096',
      wsUrl: process.env.FILEPROCESS_WS_URL || 'http://localhost:9096',
    },
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
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
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// ========================================================================
// DATABASE & CACHE CONNECTIONS
// ========================================================================

// PostgreSQL connection pool
const pgPool = new Pool(config.database);

pgPool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

// Redis client
const redisClient = createClient({ url: config.redis.url });

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

// ========================================================================
// NEXUS STACK CLIENT INITIALIZATION
// ========================================================================

const mageAgentClient = new MageAgentClient({
  baseUrl: config.nexus.mageagent.baseUrl,
  graphragUrl: config.nexus.mageagent.graphragUrl,
});

const graphRAGClient = new GraphRAGClient({
  baseUrl: config.nexus.graphrag.baseUrl,
  wsUrl: config.nexus.graphrag.wsUrl,
});

const fileProcessClient = new FileProcessClient({
  baseUrl: config.nexus.fileprocess.baseUrl,
  wsUrl: config.nexus.fileprocess.wsUrl,
});

// Export clients for use in routes
export const nexusClients = {
  mageAgent: mageAgentClient,
  graphRAG: graphRAGClient,
  fileProcess: fileProcessClient,
};

// Export database connections
export const db = {
  pg: pgPool,
  redis: redisClient,
};

// Export logger
export { logger };

// ========================================================================
// EXPRESS APP SETUP
// ========================================================================

const app = express();
const httpServer = createServer(app);

// ========================================================================
// SOCKET.IO SETUP
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
setupWebSocketHandlers(io, nexusClients, logger);

// Export io for use in routes
export { io };

// ========================================================================
// MIDDLEWARE
// ========================================================================

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  },
});

app.use('/api/', limiter);

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Usage tracking middleware
app.use(usageTrackingMiddleware);

// ========================================================================
// ROUTES
// ========================================================================

// Health checks (no auth required)
app.use('/health', createHealthRoutes(nexusClients, db));

// Authentication routes
app.use('/api/auth', createAuthRoutes(db, config.jwt));

// Protected routes (require authentication)
app.use('/api/research', authMiddleware(db), createResearchRoutes(nexusClients, db));
app.use('/api/documents', authMiddleware(db), createDocumentRoutes(nexusClients, db));
app.use('/api/queries', authMiddleware(db), createQueryRoutes(nexusClients, db));
app.use('/api/citations', authMiddleware(db), createCitationRoutes(nexusClients, db));

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Nexus Law API Gateway',
    version: '1.0.0',
    status: 'operational',
    documentation: '/api/docs',
    health: '/health',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// Error handler (must be last)
app.use(errorHandler(logger));

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

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Disconnect WebSocket clients
  io.close(() => {
    logger.info('WebSocket server closed');
  });

  // Close database connections
  try {
    await pgPool.end();
    logger.info('PostgreSQL pool closed');
  } catch (err) {
    logger.error('Error closing PostgreSQL pool:', err);
  }

  try {
    await redisClient.quit();
    logger.info('Redis connection closed');
  } catch (err) {
    logger.error('Error closing Redis connection:', err);
  }

  // Disconnect Nexus clients
  mageAgentClient.disconnectWebSocket();
  graphRAGClient.disconnectWebSocket();
  fileProcessClient.disconnectWebSocket();
  logger.info('Nexus Stack clients disconnected');

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

    // Test PostgreSQL connection
    const client = await pgPool.connect();
    logger.info('Connected to PostgreSQL');
    client.release();

    // Health check Nexus Stack services
    const [mageHealth, graphHealth, fileHealth] = await Promise.all([
      mageAgentClient.healthCheck(),
      graphRAGClient.healthCheck(),
      fileProcessClient.healthCheck(),
    ]);

    logger.info('Nexus Stack health:', {
      mageAgent: mageHealth.healthy,
      graphRAG: graphHealth.healthy,
      fileProcess: fileHealth.healthy,
    });

    if (!mageHealth.healthy || !graphHealth.healthy || !fileHealth.healthy) {
      logger.warn('Some Nexus Stack services are unhealthy - continuing with degraded functionality');
    }

    // Start HTTP server
    httpServer.listen(config.port, () => {
      logger.info(`🚀 Nexus Law API Gateway started`);
      logger.info(`📡 REST API: http://localhost:${config.port}`);
      logger.info(`🔌 WebSocket: ws://localhost:${config.port}`);
      logger.info(`🏥 Health: http://localhost:${config.port}/health`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`💾 Database: ${config.database.host}:${config.database.port}`);
      logger.info(`🔴 Redis: ${config.redis.url}`);
      logger.info(`🧠 Nexus Stack:`);
      logger.info(`   - MageAgent: ${config.nexus.mageagent.baseUrl} (${mageHealth.healthy ? '✅' : '❌'})`);
      logger.info(`   - GraphRAG: ${config.nexus.graphrag.baseUrl} (${graphHealth.healthy ? '✅' : '❌'})`);
      logger.info(`   - FileProcess: ${config.nexus.fileprocess.baseUrl} (${fileHealth.healthy ? '✅' : '❌'})`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// ========================================================================
// TYPESCRIPT DECLARATIONS
// ========================================================================

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        id: string;
        email: string;
        organizationId: string;
        role: string;
      };
    }
  }
}

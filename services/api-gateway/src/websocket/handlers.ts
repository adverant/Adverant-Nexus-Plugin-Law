/**
 * WebSocket Handlers
 *
 * Real-time streaming for long-running operations
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Logger } from 'winston';

export function setupWebSocketHandlers(
  io: SocketIOServer,
  nexusClients: { mageAgent: any; graphRAG: any; fileProcess: any },
  logger: Logger
) {
  // Authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
      const payload = jwt.verify(token, jwtSecret) as any;

      socket.data.user = {
        id: payload.id,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role,
      };

      next();
    } catch (err) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    logger.info(`WebSocket connected: ${socket.id} (user: ${user.id})`);

    // Join user-specific room
    socket.join(`user:${user.id}`);

    // ========================================================================
    // RESEARCH STREAMING
    // ========================================================================

    /**
     * Subscribe to research task progress
     */
    socket.on('research:subscribe', async (data: { taskId: string }) => {
      const { taskId } = data;

      logger.info(`User ${user.id} subscribed to research task: ${taskId}`);

      try {
        await nexusClients.mageAgent.subscribeToTask(
          taskId,
          // onProgress
          (progress: any) => {
            socket.emit('research:progress', {
              taskId,
              progress: progress.progress,
              status: progress.status,
              metadata: progress.metadata,
            });
          },
          // onComplete
          (result: any) => {
            socket.emit('research:complete', {
              taskId,
              result: result.result,
              metadata: result.metadata,
            });
          },
          // onError
          (error: any) => {
            socket.emit('research:error', {
              taskId,
              error: error.message,
            });
          }
        );
      } catch (error: any) {
        socket.emit('research:error', {
          taskId,
          error: error.message,
        });
      }
    });

    // ========================================================================
    // DOCUMENT PROCESSING STREAMING
    // ========================================================================

    /**
     * Subscribe to batch job progress
     */
    socket.on('documents:subscribe', async (data: { jobId: string }) => {
      const { jobId } = data;

      logger.info(`User ${user.id} subscribed to document job: ${jobId}`);

      try {
        await nexusClients.fileProcess.subscribeToBatchJob(
          jobId,
          // onProgress
          (progress: any) => {
            socket.emit('documents:progress', {
              jobId,
              processed: progress.processed,
              total: progress.total,
              currentFile: progress.currentFile,
              progress: progress.progress,
            });
          },
          // onComplete
          (result: any) => {
            socket.emit('documents:complete', {
              jobId,
              totalProcessed: result.totalProcessed,
              totalFailed: result.totalFailed,
              duration: result.duration,
            });
          },
          // onError
          (error: any) => {
            socket.emit('documents:error', {
              jobId,
              error: error.message,
            });
          }
        );
      } catch (error: any) {
        socket.emit('documents:error', {
          jobId,
          error: error.message,
        });
      }
    });

    // ========================================================================
    // GRAPHRAG INGESTION STREAMING
    // ========================================================================

    /**
     * Subscribe to ingestion progress
     */
    socket.on('graphrag:subscribe', async (data: { jobId: string }) => {
      const { jobId } = data;

      logger.info(`User ${user.id} subscribed to GraphRAG ingestion: ${jobId}`);

      try {
        await nexusClients.graphRAG.subscribeToIngestion(
          jobId,
          // onProgress
          (progress: any) => {
            socket.emit('graphrag:progress', {
              jobId,
              processed: progress.processed,
              total: progress.total,
              progress: progress.progress,
            });
          },
          // onComplete
          (result: any) => {
            socket.emit('graphrag:complete', {
              jobId,
              documentsIngested: result.documentsIngested,
              chunksCreated: result.chunksCreated,
              embeddingsGenerated: result.embeddingsGenerated,
            });
          },
          // onError
          (error: any) => {
            socket.emit('graphrag:error', {
              jobId,
              error: error.message,
            });
          }
        );
      } catch (error: any) {
        socket.emit('graphrag:error', {
          jobId,
          error: error.message,
        });
      }
    });

    // ========================================================================
    // REAL-TIME QUERY UPDATES
    // ========================================================================

    /**
     * Stream query results as they arrive
     */
    socket.on('query:stream', async (data: { query: string; options: any }) => {
      const { query, options } = data;

      logger.info(`User ${user.id} started streaming query: ${query.substring(0, 50)}...`);

      try {
        // This is a placeholder - in production, implement streaming search
        // that yields results as they're found across multiple adapters

        socket.emit('query:result', {
          source: 'courtlistener',
          results: [],
          partial: true,
        });

        socket.emit('query:result', {
          source: 'graphrag',
          results: [],
          partial: false,
        });

        socket.emit('query:complete', {
          totalResults: 0,
          sources: ['courtlistener', 'graphrag'],
        });
      } catch (error: any) {
        socket.emit('query:error', {
          error: error.message,
        });
      }
    });

    // ========================================================================
    // DISCONNECTION
    // ========================================================================

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.id} (user: ${user.id}) - ${reason}`);

      // Cleanup any subscriptions
      nexusClients.mageAgent.disconnectWebSocket();
      nexusClients.graphRAG.disconnectWebSocket();
      nexusClients.fileProcess.disconnectWebSocket();
    });

    // ========================================================================
    // ERROR HANDLING
    // ========================================================================

    socket.on('error', (error) => {
      logger.error(`WebSocket error for user ${user.id}:`, error);
      socket.emit('error', {
        message: 'WebSocket error occurred',
        details: error.message,
      });
    });
  });

  logger.info('WebSocket handlers initialized');
}

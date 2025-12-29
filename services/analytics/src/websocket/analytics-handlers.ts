/**
 * Analytics WebSocket Handlers
 *
 * Real-time streaming of analytics data to dashboards
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Logger } from 'winston';

export function setupAnalyticsWebSocket(
  io: SocketIOServer,
  db: { pg: any; redis: any },
  logger: Logger
) {
  io.on('connection', (socket: Socket) => {
    logger.info(`Analytics WebSocket connected: ${socket.id}`);

    // ========================================================================
    // REAL-TIME METRICS STREAMING
    // ========================================================================

    /**
     * Subscribe to real-time metrics
     */
    socket.on('subscribe:metrics', () => {
      logger.info(`Client ${socket.id} subscribed to metrics`);
      socket.join('metrics');

      // Send initial data immediately
      db.redis.get('analytics:metrics:latest')
        .then((data: string) => {
          if (data) {
            socket.emit('metrics:update', JSON.parse(data));
          }
        })
        .catch((error: any) => {
          logger.error('Failed to get latest metrics:', error);
        });
    });

    /**
     * Unsubscribe from metrics
     */
    socket.on('unsubscribe:metrics', () => {
      logger.info(`Client ${socket.id} unsubscribed from metrics`);
      socket.leave('metrics');
    });

    // ========================================================================
    // COST TRACKING STREAMING
    // ========================================================================

    /**
     * Subscribe to cost updates
     */
    socket.on('subscribe:cost', () => {
      logger.info(`Client ${socket.id} subscribed to cost tracking`);
      socket.join('cost');

      // Send latest cost data
      db.redis.get('analytics:cost:latest')
        .then((data: string) => {
          if (data) {
            socket.emit('cost:update', JSON.parse(data));
          }
        })
        .catch((error: any) => {
          logger.error('Failed to get latest cost data:', error);
        });
    });

    /**
     * Unsubscribe from cost tracking
     */
    socket.on('unsubscribe:cost', () => {
      logger.info(`Client ${socket.id} unsubscribed from cost tracking`);
      socket.leave('cost');
    });

    // ========================================================================
    // PERFORMANCE MONITORING STREAMING
    // ========================================================================

    /**
     * Subscribe to performance monitoring
     */
    socket.on('subscribe:performance', () => {
      logger.info(`Client ${socket.id} subscribed to performance monitoring`);
      socket.join('performance');

      // Send latest performance snapshot
      db.redis.get('analytics:performance:latest')
        .then((data: string) => {
          if (data) {
            socket.emit('performance:update', JSON.parse(data));
          }
        })
        .catch((error: any) => {
          logger.error('Failed to get latest performance data:', error);
        });
    });

    /**
     * Unsubscribe from performance monitoring
     */
    socket.on('unsubscribe:performance', () => {
      logger.info(`Client ${socket.id} unsubscribed from performance monitoring`);
      socket.leave('performance');
    });

    // ========================================================================
    // ALERTS STREAMING
    // ========================================================================

    /**
     * Subscribe to performance alerts
     */
    socket.on('subscribe:alerts', () => {
      logger.info(`Client ${socket.id} subscribed to alerts`);
      socket.join('alerts');

      // Send active alerts immediately
      db.pg.query(
        `SELECT * FROM analytics.performance_alerts
         WHERE timestamp > NOW() - INTERVAL '1 hour'
         ORDER BY timestamp DESC
         LIMIT 50`
      )
        .then((result: any) => {
          socket.emit('alerts:list', {
            alerts: result.rows,
            count: result.rows.length,
          });
        })
        .catch((error: any) => {
          logger.error('Failed to get alerts:', error);
        });
    });

    /**
     * Unsubscribe from alerts
     */
    socket.on('unsubscribe:alerts', () => {
      logger.info(`Client ${socket.id} unsubscribed from alerts`);
      socket.leave('alerts');
    });

    // ========================================================================
    // CUSTOM QUERIES
    // ========================================================================

    /**
     * Query historical metrics
     */
    socket.on('query:metrics', async (data: {
      startDate: string;
      endDate: string;
      period: string;
    }) => {
      try {
        const result = await db.pg.query(
          `SELECT data FROM analytics.metrics_timeseries
           WHERE timestamp >= $1 AND timestamp <= $2 AND period = $3
           ORDER BY timestamp ASC`,
          [data.startDate, data.endDate, data.period]
        );

        socket.emit('query:metrics:result', {
          period: { start: data.startDate, end: data.endDate, type: data.period },
          metrics: result.rows.map((row: any) => JSON.parse(row.data)),
        });
      } catch (error: any) {
        logger.error('Failed to query metrics:', error);
        socket.emit('query:metrics:error', {
          error: error.message,
        });
      }
    });

    /**
     * Query cost data
     */
    socket.on('query:cost', async (data: {
      startDate: string;
      endDate: string;
    }) => {
      try {
        const result = await db.pg.query(
          `SELECT
             SUM(actual_cost) as actual_cost,
             SUM(potential_cost) as potential_cost,
             SUM(potential_cost - actual_cost) as savings
           FROM analytics.query_costs
           WHERE timestamp >= $1 AND timestamp <= $2`,
          [data.startDate, data.endDate]
        );

        const row = result.rows[0];

        socket.emit('query:cost:result', {
          period: { start: data.startDate, end: data.endDate },
          cost: {
            actualCost: parseFloat(row?.actual_cost || '0'),
            potentialCost: parseFloat(row?.potential_cost || '0'),
            savings: parseFloat(row?.savings || '0'),
          },
        });
      } catch (error: any) {
        logger.error('Failed to query cost data:', error);
        socket.emit('query:cost:error', {
          error: error.message,
        });
      }
    });

    // ========================================================================
    // DISCONNECTION
    // ========================================================================

    socket.on('disconnect', (reason) => {
      logger.info(`Analytics WebSocket disconnected: ${socket.id} - ${reason}`);
    });

    socket.on('error', (error) => {
      logger.error(`Analytics WebSocket error for ${socket.id}:`, error);
    });
  });

  // ========================================================================
  // BROADCAST UPDATES (Called by background jobs)
  // ========================================================================

  /**
   * Broadcast metrics update to all subscribers
   */
  function broadcastMetricsUpdate(metrics: any) {
    io.to('metrics').emit('metrics:update', metrics);
  }

  /**
   * Broadcast cost update to all subscribers
   */
  function broadcastCostUpdate(cost: any) {
    io.to('cost').emit('cost:update', cost);
  }

  /**
   * Broadcast performance update to all subscribers
   */
  function broadcastPerformanceUpdate(performance: any) {
    io.to('performance').emit('performance:update', performance);
  }

  /**
   * Broadcast alert to all subscribers
   */
  function broadcastAlert(alert: any) {
    io.to('alerts').emit('alert:new', alert);
  }

  logger.info('Analytics WebSocket handlers initialized');

  // Return broadcast functions for use by background jobs
  return {
    broadcastMetricsUpdate,
    broadcastCostUpdate,
    broadcastPerformanceUpdate,
    broadcastAlert,
  };
}

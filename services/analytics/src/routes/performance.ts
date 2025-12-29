/**
 * Performance Monitoring API Routes
 *
 * Endpoints for performance metrics and alerts
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';

export function createPerformanceRoutes(services: any, db: any) {
  const router = Router();

  /**
   * GET /api/performance/snapshot
   * Get current performance snapshot
   */
  router.get('/snapshot', async (req: Request, res: Response) => {
    try {
      const snapshot = await services.performanceMonitor.captureSnapshot();

      res.json({
        success: true,
        data: snapshot,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/performance/trends
   * Get performance trends
   */
  router.get('/trends', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        metric: Joi.string().required(),
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
        granularity: Joi.string().valid('minute', 'hour', 'day').default('hour'),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { metric, startDate, endDate, granularity } = value;

      const trends = await services.performanceMonitor.getPerformanceTrends(
        metric,
        new Date(startDate),
        new Date(endDate),
        granularity
      );

      res.json({
        success: true,
        data: trends,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/performance/alerts
   * Get active performance alerts
   */
  router.get('/alerts', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        severity: Joi.string().valid('info', 'warning', 'error', 'critical').optional(),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { severity } = value;

      const alerts = await services.performanceMonitor.getActiveAlerts(severity);

      res.json({
        success: true,
        data: {
          alerts,
          count: alerts.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/performance/latency
   * Get API latency statistics
   */
  router.get('/latency', async (req: Request, res: Response) => {
    try {
      const result = await db.pg.query(
        `SELECT
           percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
           MAX(latency_ms) as max,
           AVG(latency_ms) as avg
         FROM nexus_law.api_logs
         WHERE created_at > NOW() - INTERVAL '1 hour'`
      );

      const row = result.rows[0];

      res.json({
        success: true,
        data: {
          period: 'last_hour',
          latency: {
            p50: parseFloat(row?.p50 || '0'),
            p95: parseFloat(row?.p95 || '0'),
            p99: parseFloat(row?.p99 || '0'),
            max: parseFloat(row?.max || '0'),
            avg: parseFloat(row?.avg || '0'),
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/performance/throughput
   * Get current throughput
   */
  router.get('/throughput', async (req: Request, res: Response) => {
    try {
      const result = await db.pg.query(
        `SELECT COUNT(*) as requests
         FROM nexus_law.api_logs
         WHERE created_at > NOW() - INTERVAL '1 minute'`
      );

      const requestsLastMinute = parseInt(result.rows[0]?.requests || '0', 10);
      const throughput = requestsLastMinute / 60; // requests per second

      res.json({
        success: true,
        data: {
          throughput,
          unit: 'requests_per_second',
          period: 'last_minute',
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

/**
 * Metrics API Routes
 *
 * Endpoints for accessing platform metrics
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';

export function createMetricsRoutes(services: any, db: any) {
  const router = Router();

  /**
   * GET /api/metrics/latest
   * Get latest real-time metrics
   */
  router.get('/latest', async (req: Request, res: Response) => {
    try {
      const metrics = await services.metricsCollector.getLatestMetrics();

      if (!metrics) {
        return res.status(404).json({
          success: false,
          error: 'No metrics available',
        });
      }

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/metrics/historical
   * Get historical metrics for time period
   */
  router.get('/historical', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
        period: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { startDate, endDate, period } = value;

      const metrics = await services.metricsCollector.getMetrics(
        new Date(startDate),
        new Date(endDate),
        period
      );

      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate, granularity: period },
          metrics,
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
   * POST /api/metrics/collect
   * Trigger manual metrics collection (admin only)
   */
  router.post('/collect', async (req: Request, res: Response) => {
    try {
      const metrics = await services.metricsCollector.collectAllMetrics();

      res.json({
        success: true,
        data: metrics,
        message: 'Metrics collected successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/metrics/summary
   * Get aggregated metrics summary
   */
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        period: Joi.string().valid('today', 'week', 'month', 'quarter', 'year').default('today'),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { period } = value;

      // Calculate date range based on period
      const endDate = new Date();
      let startDate = new Date();

      switch (period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      const metrics = await services.metricsCollector.getMetrics(startDate, endDate, 'day');

      // Calculate aggregates
      const summary = {
        period: { start: startDate, end: endDate, type: period },
        totals: {
          apiCalls: metrics.reduce((sum, m) => sum + m.api.totalCalls, 0),
          researchTasks: metrics.reduce((sum, m) => sum + m.research.tasksCompleted, 0),
          documentsProcessed: metrics.reduce((sum, m) => sum + m.documents.processed, 0),
          queries: metrics.reduce((sum, m) => sum + m.queries.semantic + m.queries.hybrid + m.queries.graph, 0),
        },
        averages: {
          apiLatency: metrics.reduce((sum, m) => sum + m.api.averageLatency, 0) / metrics.length || 0,
          errorRate: metrics.reduce((sum, m) => sum + m.api.errorRate, 0) / metrics.length || 0,
          cacheHitRate: metrics.reduce((sum, m) => sum + m.queries.cacheHitRate, 0) / metrics.length || 0,
        },
      };

      res.json({
        success: true,
        data: summary,
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

/**
 * Usage Analytics API Routes
 *
 * Endpoints for user activity and engagement metrics
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';

export function createUsageRoutes(services: any, db: any) {
  const router = Router();

  /**
   * GET /api/usage/overview
   * Get usage overview
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { startDate, endDate } = value;

      const metrics = await services.metricsCollector.getMetrics(
        new Date(startDate),
        new Date(endDate),
        'day'
      );

      const overview = {
        period: { start: startDate, end: endDate },
        totalUsers: metrics.reduce((sum, m) => Math.max(sum, m.users.activeUsers), 0),
        totalSessions: metrics.reduce((sum, m) => sum + m.users.totalSessions, 0),
        avgSessionDuration: metrics.reduce((sum, m) => sum + m.users.averageSessionDuration, 0) / metrics.length || 0,
        features: {
          research: metrics.reduce((sum, m) => sum + m.research.tasksCompleted, 0),
          documents: metrics.reduce((sum, m) => sum + m.documents.processed, 0),
          citations: metrics.reduce((sum, m) => sum + m.citations.networksBuilt, 0),
          queries: metrics.reduce((sum, m) => sum + m.queries.semantic + m.queries.hybrid + m.queries.graph, 0),
        },
      };

      res.json({
        success: true,
        data: overview,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/usage/active-users
   * Get active users count
   */
  router.get('/active-users', async (req: Request, res: Response) => {
    try {
      const result = await db.pg.query(
        `SELECT COUNT(DISTINCT user_id) as active_users
         FROM nexus_law.user_sessions
         WHERE last_activity > NOW() - INTERVAL '15 minutes'`
      );

      res.json({
        success: true,
        data: {
          activeUsers: parseInt(result.rows[0]?.active_users || '0', 10),
          timestamp: new Date(),
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
   * GET /api/usage/top-features
   * Get most used features
   */
  router.get('/top-features', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { startDate, endDate } = value;

      const result = await db.pg.query(
        `SELECT
           endpoint,
           COUNT(*) as usage_count
         FROM nexus_law.api_logs
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY endpoint
         ORDER BY usage_count DESC
         LIMIT 20`,
        [startDate, endDate]
      );

      const features = result.rows.map((row) => ({
        feature: row.endpoint,
        usageCount: parseInt(row.usage_count, 10),
      }));

      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate },
          features,
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
   * GET /api/usage/user-activity
   * Get user activity breakdown
   */
  router.get('/user-activity', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
        limit: Joi.number().integer().min(1).max(100).default(50),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { startDate, endDate, limit } = value;

      const result = await db.pg.query(
        `SELECT
           u.email,
           COUNT(DISTINCT s.id) as sessions,
           COUNT(DISTINCT a.id) as api_calls,
           MAX(s.last_activity) as last_active
         FROM nexus_law.users u
         LEFT JOIN nexus_law.user_sessions s ON u.id = s.user_id AND s.created_at >= $1 AND s.created_at <= $2
         LEFT JOIN nexus_law.api_logs a ON u.id = a.user_id AND a.created_at >= $1 AND a.created_at <= $2
         GROUP BY u.id, u.email
         HAVING COUNT(DISTINCT s.id) > 0
         ORDER BY sessions DESC
         LIMIT $3`,
        [startDate, endDate, limit]
      );

      const activity = result.rows.map((row) => ({
        email: row.email,
        sessions: parseInt(row.sessions, 10),
        apiCalls: parseInt(row.api_calls, 10),
        lastActive: row.last_active,
      }));

      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate },
          activity,
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

/**
 * Cost Analysis API Routes
 *
 * Endpoints for cost tracking and savings analysis
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';

export function createCostRoutes(services: any, db: any) {
  const router = Router();

  /**
   * GET /api/cost/summary
   * Get cost summary for time period
   */
  router.get('/summary', async (req: Request, res: Response) => {
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

      const summary = await services.costAnalyzer.analyzeCosts(
        new Date(startDate),
        new Date(endDate)
      );

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

  /**
   * GET /api/cost/trends
   * Get cost trends over time
   */
  router.get('/trends', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
        granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { startDate, endDate, granularity } = value;

      const trends = await services.costAnalyzer.getCostTrends(
        new Date(startDate),
        new Date(endDate),
        granularity
      );

      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate, granularity },
          trends,
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
   * GET /api/cost/drivers
   * Get top cost drivers
   */
  router.get('/drivers', async (req: Request, res: Response) => {
    try {
      const schema = Joi.object({
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
        limit: Joi.number().integer().min(1).max(100).default(10),
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      const { startDate, endDate, limit } = value;

      const drivers = await services.costAnalyzer.getTopCostDrivers(
        new Date(startDate),
        new Date(endDate),
        limit
      );

      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate },
          drivers,
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
   * GET /api/cost/roi
   * Calculate ROI for organization
   */
  router.get('/roi', async (req: Request, res: Response) => {
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

      const summary = await services.costAnalyzer.analyzeCosts(
        new Date(startDate),
        new Date(endDate)
      );

      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate },
          roi: summary.roi,
          savings: summary.total.savings,
          savingsPercentage: summary.total.savingsPercentage,
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

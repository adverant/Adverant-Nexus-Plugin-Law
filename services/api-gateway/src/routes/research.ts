/**
 * Legal Research Routes
 *
 * Multi-agent legal research powered by MageAgent
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';

export function createResearchRoutes(
  nexusClients: { mageAgent: any; graphRAG: any; fileProcess: any },
  db: { pg: any; redis: any }
) {
  const router = Router();

  /**
   * Conduct legal research using multi-agent orchestration
   */
  router.post(
    '/',
    validateRequest({
      body: Joi.object({
        task: Joi.string().min(10).max(1000).required(),
        maxAgents: Joi.number().integer().min(1).max(10).default(5),
        timeout: Joi.number().integer().min(10000).max(300000).default(120000),
        streamProgress: Joi.boolean().default(false),
        context: Joi.object({
          jurisdiction: Joi.string().optional(),
          caseType: Joi.string().optional(),
          focusAreas: Joi.array().items(Joi.string()).optional(),
          precedents: Joi.array().items(Joi.string()).optional(),
        }).optional(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { task, maxAgents, timeout, streamProgress, context } = req.body;

      // Conduct legal research using MageAgent
      const result = await nexusClients.mageAgent.conductLegalResearch({
        task,
        maxAgents,
        timeout,
        streamProgress,
        context,
      });

      // Store research in database
      await db.pg.query(
        `INSERT INTO nexus_law.research_tasks (user_id, task_id, task, status, result, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [req.user!.id, result.taskId, task, result.status, JSON.stringify(result.result)]
      );

      res.json({
        success: true,
        data: result,
      });
    })
  );

  /**
   * Get research task status
   */
  router.get(
    '/:taskId',
    validateRequest({
      params: Joi.object({
        taskId: Joi.string().required(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { taskId } = req.params;

      const status = await nexusClients.mageAgent.getTaskStatus(taskId);

      res.json({
        success: true,
        data: status,
      });
    })
  );

  /**
   * Generate legal memo
   */
  router.post(
    '/memo',
    validateRequest({
      body: Joi.object({
        issue: Joi.string().min(10).required(),
        facts: Joi.object().required(),
        jurisdiction: Joi.string().required(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { issue, facts, jurisdiction } = req.body;

      const result = await nexusClients.mageAgent.generateLegalMemo(issue, facts, jurisdiction);

      res.json({
        success: true,
        data: result,
      });
    })
  );

  /**
   * Predictive case outcome analysis
   */
  router.post(
    '/predict',
    validateRequest({
      body: Joi.object({
        facts: Joi.object().required(),
        caseType: Joi.string().required(),
        jurisdiction: Joi.string().required(),
        similarCases: Joi.array().items(Joi.string()).optional(),
        judge: Joi.object({
          name: Joi.string().required(),
          historicalData: Joi.any().optional(),
        }).optional(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const task = req.body;

      const result = await nexusClients.mageAgent.predictCaseOutcome(task);

      res.json({
        success: true,
        data: result,
      });
    })
  );

  return router;
}

/**
 * Citation Analysis Routes
 *
 * Citation network analysis powered by GraphRAG + Neo4j
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';

export function createCitationRoutes(
  nexusClients: { mageAgent: any; graphRAG: any; fileProcess: any },
  db: { pg: any; redis: any }
) {
  const router = Router();

  /**
   * Build citation network for a case
   */
  router.post(
    '/network',
    validateRequest({
      body: Joi.object({
        caseId: Joi.string().required(),
        depth: Joi.number().integer().min(1).max(5).default(2),
        minInfluence: Joi.number().min(0).max(1).default(0.0),
        includeStatutes: Joi.boolean().default(false),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { caseId, depth, minInfluence, includeStatutes } = req.body;

      const network = await nexusClients.graphRAG.buildCitationNetwork(caseId, {
        depth,
        minInfluence,
        includeStatutes,
      });

      res.json({
        success: true,
        data: network,
      });
    })
  );

  /**
   * Get citation analysis for a case
   */
  router.get(
    '/:caseId/analysis',
    validateRequest({
      params: Joi.object({
        caseId: Joi.string().required(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { caseId } = req.params;

      const analysis = await nexusClients.graphRAG.getCitationAnalysis(caseId);

      res.json({
        success: true,
        data: analysis,
      });
    })
  );

  /**
   * Find similar cases by citation pattern
   */
  router.post(
    '/similar',
    validateRequest({
      body: Joi.object({
        caseId: Joi.string().required(),
        limit: Joi.number().integer().min(1).max(50).default(10),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { caseId, limit } = req.body;

      const similarCases = await nexusClients.graphRAG.findSimilarByCitation(caseId, limit);

      res.json({
        success: true,
        data: similarCases,
      });
    })
  );

  /**
   * Temporal query - track legal evolution
   */
  router.post(
    '/temporal',
    validateRequest({
      body: Joi.object({
        concept: Joi.string().required(),
        startDate: Joi.string().isoDate().required(),
        endDate: Joi.string().isoDate().required(),
        jurisdiction: Joi.string().optional(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { concept, startDate, endDate, jurisdiction } = req.body;

      const timeline = await nexusClients.graphRAG.temporalQuery(
        concept,
        startDate,
        endDate,
        jurisdiction
      );

      res.json({
        success: true,
        data: timeline,
      });
    })
  );

  return router;
}

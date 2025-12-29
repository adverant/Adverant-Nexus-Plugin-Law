/**
 * Query Routes
 *
 * Unified query interface with cost optimization
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequest, commonSchemas } from '../middleware/validation';

export function createQueryRoutes(
  nexusClients: { mageAgent: any; graphRAG: any; fileProcess: any },
  db: { pg: any; redis: any }
) {
  const router = Router();

  /**
   * Semantic search across legal corpus
   */
  router.post(
    '/semantic',
    validateRequest({
      body: Joi.object({
        query: Joi.string().min(3).max(1000).required(),
        jurisdiction: Joi.string().optional(),
        docType: Joi.array()
          .items(Joi.string().valid('case', 'statute', 'regulation', 'brief', 'contract', 'memo'))
          .optional(),
        dateRange: Joi.object({
          start: Joi.string().isoDate().required(),
          end: Joi.string().isoDate().required(),
        }).optional(),
        threshold: Joi.number().min(0).max(1).default(0.6),
        limit: Joi.number().integer().min(1).max(100).default(20),
        rerank: Joi.boolean().default(false),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const searchQuery = req.body;

      // Check cache first
      const cacheKey = `semantic:${JSON.stringify(searchQuery)}`;
      const cached = await db.redis.get(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      // Perform semantic search via GraphRAG
      const results = await nexusClients.graphRAG.semanticSearch(searchQuery);

      // Cache results for 1 hour
      await db.redis.setEx(cacheKey, 3600, JSON.stringify(results));

      // Store query in database for analytics
      await db.pg.query(
        `INSERT INTO nexus_law.queries (user_id, query_type, query, results_count, created_at)
         VALUES ($1, 'semantic', $2, $3, NOW())`,
        [req.user!.id, searchQuery.query, results.length]
      );

      res.json({
        success: true,
        data: results,
        cached: false,
      });
    })
  );

  /**
   * Hybrid search (semantic + keyword)
   */
  router.post(
    '/hybrid',
    validateRequest({
      body: Joi.object({
        semanticQuery: Joi.string().required(),
        keywordQuery: Joi.string().required(),
        jurisdiction: Joi.string().optional(),
        limit: Joi.number().integer().min(1).max(100).default(20),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { semanticQuery, keywordQuery, jurisdiction, limit } = req.body;

      const results = await nexusClients.graphRAG.hybridSearch(
        semanticQuery,
        keywordQuery,
        { jurisdiction, limit }
      );

      res.json({
        success: true,
        data: results,
      });
    })
  );

  /**
   * Knowledge graph query
   */
  router.post(
    '/graph',
    validateRequest({
      body: Joi.object({
        query: Joi.string().required(),
        type: Joi.string().valid('cypher', 'natural').default('natural'),
        format: Joi.string().valid('graph', 'list', 'tree').default('list'),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { query, type, format } = req.body;

      const results = await nexusClients.graphRAG.queryKnowledgeGraph({
        query,
        type,
        format,
      });

      res.json({
        success: true,
        data: results,
      });
    })
  );

  return router;
}

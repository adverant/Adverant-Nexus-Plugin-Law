/**
 * Health Check Routes
 *
 * Monitor system health and dependencies
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { circuitBreakerInstance } from '../middleware/circuit-breaker';

export function createHealthRoutes(
  nexusClients: {
    mageAgent: any;
    graphRAG: any;
    fileProcess: any;
  },
  db: { pg: any; redis: any }
) {
  const router = Router();

  /**
   * Basic health check
   */
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
      });
    })
  );

  /**
   * Detailed health check
   */
  router.get(
    '/detailed',
    asyncHandler(async (req: Request, res: Response) => {
      const checks = await Promise.allSettled([
        // Database
        db.pg.query('SELECT 1'),
        // Redis
        db.redis.ping(),
        // Nexus Stack
        nexusClients.mageAgent.healthCheck(),
        nexusClients.graphRAG.healthCheck(),
        nexusClients.fileProcess.healthCheck(),
      ]);

      const [dbCheck, redisCheck, mageCheck, graphCheck, fileCheck] = checks;

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        services: {
          database: {
            healthy: dbCheck.status === 'fulfilled',
            latency: dbCheck.status === 'fulfilled' ? 'OK' : undefined,
            error: dbCheck.status === 'rejected' ? (dbCheck.reason as Error).message : undefined,
          },
          redis: {
            healthy: redisCheck.status === 'fulfilled',
            latency: redisCheck.status === 'fulfilled' ? 'OK' : undefined,
            error:
              redisCheck.status === 'rejected' ? (redisCheck.reason as Error).message : undefined,
          },
          nexusStack: {
            mageAgent: {
              healthy:
                mageCheck.status === 'fulfilled' ? (mageCheck.value as any).healthy : false,
              latency:
                mageCheck.status === 'fulfilled' ? (mageCheck.value as any).latency : undefined,
              error:
                mageCheck.status === 'rejected'
                  ? (mageCheck.reason as Error).message
                  : mageCheck.status === 'fulfilled' && !(mageCheck.value as any).healthy
                  ? (mageCheck.value as any).error
                  : undefined,
            },
            graphRAG: {
              healthy:
                graphCheck.status === 'fulfilled' ? (graphCheck.value as any).healthy : false,
              latency:
                graphCheck.status === 'fulfilled' ? (graphCheck.value as any).latency : undefined,
              collections:
                graphCheck.status === 'fulfilled'
                  ? (graphCheck.value as any).collections
                  : undefined,
              error:
                graphCheck.status === 'rejected'
                  ? (graphCheck.reason as Error).message
                  : graphCheck.status === 'fulfilled' && !(graphCheck.value as any).healthy
                  ? (graphCheck.value as any).error
                  : undefined,
            },
            fileProcess: {
              healthy:
                fileCheck.status === 'fulfilled' ? (fileCheck.value as any).healthy : false,
              latency:
                fileCheck.status === 'fulfilled' ? (fileCheck.value as any).latency : undefined,
              throughput:
                fileCheck.status === 'fulfilled' ? (fileCheck.value as any).throughput : undefined,
              queueSize:
                fileCheck.status === 'fulfilled' ? (fileCheck.value as any).queueSize : undefined,
              error:
                fileCheck.status === 'rejected'
                  ? (fileCheck.reason as Error).message
                  : fileCheck.status === 'fulfilled' && !(fileCheck.value as any).healthy
                  ? (fileCheck.value as any).error
                  : undefined,
            },
          },
        },
        circuitBreakers: circuitBreakerInstance.getAllStates(),
      };

      // Determine overall status
      const allHealthy = Object.values(health.services).every((service: any) => {
        if ('healthy' in service) {
          return service.healthy;
        }
        // Nested services (like nexusStack)
        return Object.values(service).every((s: any) => s.healthy);
      });

      if (!allHealthy) {
        health.status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    })
  );

  /**
   * Readiness check (for Kubernetes)
   */
  router.get(
    '/ready',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        await db.pg.query('SELECT 1');
        await db.redis.ping();
        res.status(200).json({ ready: true });
      } catch (error) {
        res.status(503).json({ ready: false, error: (error as Error).message });
      }
    })
  );

  /**
   * Liveness check (for Kubernetes)
   */
  router.get('/live', (req: Request, res: Response) => {
    res.status(200).json({ alive: true });
  });

  return router;
}

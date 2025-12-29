/**
 * Authentication Middleware
 *
 * Validates JWT tokens and attaches user information to requests
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

export interface AuthConfig {
  secret: string;
  expiresIn: string;
}

export interface UserPayload {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

/**
 * Authentication middleware factory
 */
export function authMiddleware(db: { pg: Pool; redis: any }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header missing or invalid',
          code: 'AUTH_MISSING',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify JWT token
      const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';

      let payload: UserPayload;
      try {
        payload = jwt.verify(token, jwtSecret) as UserPayload;
      } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
          });
        } else if (err.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'TOKEN_INVALID',
          });
        }
        throw err;
      }

      // Check if token is blacklisted (logout/revoke)
      const isBlacklisted = await db.redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked',
          code: 'TOKEN_REVOKED',
        });
      }

      // Verify user still exists and is active
      const userResult = await db.pg.query(
        'SELECT id, email, organization_id, role, active FROM nexus_law.users WHERE id = $1',
        [payload.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      const user = userResult.rows[0];

      if (!user.active) {
        return res.status(401).json({
          success: false,
          error: 'User account is inactive',
          code: 'USER_INACTIVE',
        });
      }

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        organizationId: user.organization_id,
        role: user.role,
      };

      next();
    } catch (error: any) {
      console.error('Authentication error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR',
        details: error.message,
      });
    }
  };
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        actual: req.user.role,
      });
    }

    next();
  };
}

/**
 * API key authentication (for service-to-service)
 */
export function apiKeyAuth(db: { pg: Pool }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: 'API key required',
          code: 'API_KEY_MISSING',
        });
      }

      // Lookup API key
      const result = await db.pg.query(
        `SELECT k.id, k.organization_id, o.name as org_name, k.permissions, k.active
         FROM nexus_law.api_keys k
         JOIN config.organizations o ON k.organization_id = o.id
         WHERE k.key_hash = $1`,
        [apiKey] // In production, hash the API key
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key',
          code: 'API_KEY_INVALID',
        });
      }

      const apiKeyData = result.rows[0];

      if (!apiKeyData.active) {
        return res.status(401).json({
          success: false,
          error: 'API key is inactive',
          code: 'API_KEY_INACTIVE',
        });
      }

      // Attach API key info to request
      req.user = {
        id: `apikey_${apiKeyData.id}`,
        email: 'service@api',
        organizationId: apiKeyData.organization_id,
        role: 'api',
      };

      next();
    } catch (error: any) {
      console.error('API key authentication error:', error);
      return res.status(500).json({
        success: false,
        error: 'API key authentication failed',
        code: 'API_KEY_ERROR',
        details: error.message,
      });
    }
  };
}

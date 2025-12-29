/**
 * Authentication Routes
 *
 * User authentication, registration, and token management
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import Joi from 'joi';
import { asyncHandler, ValidationError } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';

export function createAuthRoutes(db: { pg: any; redis: any }, jwtConfig: { secret: string; expiresIn: string }) {
  const router = Router();

  /**
   * Register new user
   */
  router.post(
    '/register',
    validateRequest({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        name: Joi.string().required(),
        organizationName: Joi.string().required(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password, name, organizationName } = req.body;

      // Check if user exists
      const existingUser = await db.pg.query(
        'SELECT id FROM nexus_law.users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new ValidationError('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create organization and user in transaction
      const client = await db.pg.connect();
      try {
        await client.query('BEGIN');

        // Create organization
        const orgResult = await client.query(
          `INSERT INTO config.organizations (name, active) VALUES ($1, true) RETURNING id`,
          [organizationName]
        );
        const organizationId = orgResult.rows[0].id;

        // Create user
        const userResult = await client.query(
          `INSERT INTO nexus_law.users (email, password_hash, name, organization_id, role, active)
           VALUES ($1, $2, $3, $4, 'admin', true)
           RETURNING id, email, name, organization_id, role`,
          [email, passwordHash, name, organizationId]
        );

        await client.query('COMMIT');

        const user = userResult.rows[0];

        // Generate JWT
        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            organizationId: user.organization_id,
            role: user.role,
          },
          jwtConfig.secret,
          { expiresIn: jwtConfig.expiresIn as any }
        );

        res.status(201).json({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              organizationId: user.organization_id,
              role: user.role,
            },
            token,
          },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    })
  );

  /**
   * Login
   */
  router.post(
    '/login',
    validateRequest({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password } = req.body;

      // Get user
      const result = await db.pg.query(
        `SELECT id, email, name, password_hash, organization_id, role, active
         FROM nexus_law.users WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        throw new ValidationError('Invalid credentials');
      }

      const user = result.rows[0];

      if (!user.active) {
        throw new ValidationError('Account is inactive');
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        throw new ValidationError('Invalid credentials');
      }

      // Generate JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          organizationId: user.organization_id,
          role: user.role,
        },
        jwtConfig.secret,
        { expiresIn: jwtConfig.expiresIn as any }
      );

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            organizationId: user.organization_id,
            role: user.role,
          },
          token,
        },
      });
    })
  );

  /**
   * Logout (blacklist token)
   */
  router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Blacklist token in Redis (expires after JWT expiry)
      await db.redis.setEx(`blacklist:${token}`, 7 * 24 * 60 * 60, 'true');
    }

    res.json({ success: true, message: 'Logged out successfully' });
  }));

  return router;
}

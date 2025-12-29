/**
 * Global Error Handler Middleware
 *
 * Catches all errors and formats them consistently
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from 'winston';

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends APIError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      404,
      'NOT_FOUND'
    );
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends APIError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends APIError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends APIError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends APIError {
  constructor(service: string, details?: any) {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ServiceUnavailableError';
  }
}

export function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    // Log error
    logger.error('Request error:', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      user: req.user?.id,
    });

    // Handle known API errors
    if (err instanceof APIError) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code,
        details: err.details,
        requestId: req.id,
      });
    }

    // Handle Joi validation errors
    if (err.name === 'ValidationError' && 'isJoi' in err) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: (err as any).details,
        requestId: req.id,
      });
    }

    // Handle database errors
    if ('code' in err && typeof (err as any).code === 'string') {
      const dbError = err as any;

      // PostgreSQL unique constraint violation
      if (dbError.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'Resource already exists',
          code: 'DUPLICATE_RESOURCE',
          details: dbError.detail,
          requestId: req.id,
        });
      }

      // PostgreSQL foreign key violation
      if (dbError.code === '23503') {
        return res.status(400).json({
          success: false,
          error: 'Referenced resource does not exist',
          code: 'INVALID_REFERENCE',
          details: dbError.detail,
          requestId: req.id,
        });
      }

      // PostgreSQL connection error
      if (dbError.code === 'ECONNREFUSED' || dbError.code === 'ENOTFOUND') {
        return res.status(503).json({
          success: false,
          error: 'Database connection failed',
          code: 'DB_CONNECTION_ERROR',
          requestId: req.id,
        });
      }
    }

    // Handle Axios errors (from Nexus Stack clients)
    if ('isAxiosError' in err && (err as any).isAxiosError) {
      const axiosError = err as any;

      const statusCode = axiosError.response?.status || 503;
      const message = axiosError.response?.data?.error || axiosError.message;
      const service = axiosError.config?.baseURL || 'External service';

      return res.status(statusCode).json({
        success: false,
        error: `${service}: ${message}`,
        code: 'NEXUS_SERVICE_ERROR',
        details: axiosError.response?.data,
        requestId: req.id,
      });
    }

    // Handle unexpected errors
    const isDevelopment = process.env.NODE_ENV !== 'production';

    return res.status(500).json({
      success: false,
      error: isDevelopment ? err.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(isDevelopment && {
        stack: err.stack,
        details: err,
      }),
      requestId: req.id,
    });
  };
}

/**
 * Async handler wrapper to catch async errors
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

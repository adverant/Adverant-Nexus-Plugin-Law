/**
 * Request Validation Middleware
 *
 * Validates request body, query params, and path params using Joi schemas
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './error-handler';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

/**
 * Validate request against Joi schema
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: any[] = [];

    // Validate body
    if (schema.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) {
        errors.push({
          location: 'body',
          details: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message,
          })),
        });
      }
    }

    // Validate query
    if (schema.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) {
        errors.push({
          location: 'query',
          details: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message,
          })),
        });
      }
    }

    // Validate params
    if (schema.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) {
        errors.push({
          location: 'params',
          details: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message,
          })),
        });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Request validation failed', errors);
    }

    next();
  };
}

// Common validation schemas
export const commonSchemas = {
  // UUID parameter
  uuid: Joi.string().uuid().required(),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  // Date range
  dateRange: Joi.object({
    start: Joi.string().isoDate().required(),
    end: Joi.string().isoDate().required(),
  }),

  // Jurisdiction
  jurisdiction: Joi.string()
    .pattern(/^[a-z]{2}(-[a-z]{2})?$/)
    .required()
    .messages({
      'string.pattern.base': 'Jurisdiction must be in format: "us" or "us-ca"',
    }),

  // Legal query
  legalQuery: Joi.object({
    query: Joi.string().min(3).max(1000).required(),
    queryType: Joi.string().valid('case_law', 'statute', 'regulation', 'mixed').default('mixed'),
    jurisdictions: Joi.array().items(Joi.string()).min(1).required(),
    courtLevel: Joi.array().items(Joi.number().integer().min(1).max(10)).optional(),
    dateRange: Joi.object({
      start: Joi.string().isoDate().required(),
      end: Joi.string().isoDate().required(),
    }).optional(),
    maxResults: Joi.number().integer().min(1).max(100).default(20),
    includeCitationAnalysis: Joi.boolean().default(false),
    semanticThreshold: Joi.number().min(0).max(1).default(0.6),
  }),

  // Document metadata
  documentMetadata: Joi.object({
    title: Joi.string().required(),
    caseId: Joi.string().optional(),
    court: Joi.string().optional(),
    jurisdiction: Joi.string().required(),
    decisionDate: Joi.string().isoDate().optional(),
    judges: Joi.array().items(Joi.string()).optional(),
    parties: Joi.array().items(Joi.string()).optional(),
    docType: Joi.string()
      .valid('case', 'statute', 'regulation', 'brief', 'contract', 'memo')
      .required(),
  }),
};

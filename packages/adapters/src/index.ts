/**
 * Nexus Law - Legal Database Adapters
 *
 * Export all adapters and registry
 */

export * from './registry';
export * from './courtlistener-adapter';

// Re-export types for convenience
export type {
  LegalDatabaseAdapter,
  AdapterCredentials,
  LegalQuery,
  QueryPreferences,
  CaseResult,
  StatuteResult,
  RegulationResult,
  HealthStatus,
  CostEstimate,
} from '@nexus-law/types';

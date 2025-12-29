/**
 * Nexus Law - Shared Package
 *
 * Export all Nexus Stack integration clients and shared utilities
 */

// Nexus Stack Integration Clients
export { MageAgentClient } from './clients/mageagent-client';
export { GraphRAGClient } from './clients/graphrag-client';
export { FileProcessClient } from './clients/fileprocess-client';

// Re-export client types and interfaces
export type {
  // MageAgent types
  MageAgentConfig,
  LegalResearchTask,
  DocumentAnalysisTask,
  PredictiveAnalysisTask,
  TaskResult,
  LegalMemoResult,
} from './clients/mageagent-client';

export type {
  // GraphRAG types
  GraphRAGConfig,
  DocumentDNA,
  SemanticSearchQuery,
  SemanticSearchResult,
  KnowledgeGraphQuery,
  CitationNetwork,
  EntityExtractionResult,
} from './clients/graphrag-client';

export type {
  // FileProcess types
  FileProcessConfig,
  ProcessingJob,
  DocumentProcessingRequest,
  ProcessedDocument,
  BatchProcessingRequest,
  ClassificationResult,
} from './clients/fileprocess-client';

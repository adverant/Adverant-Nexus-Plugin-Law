/**
 * Nexus Law - Core Type Definitions
 *
 * Complete type system for legal intelligence platform.
 * Zero hardcoded logic - all types support dynamic configuration.
 */

// ============================================================================
// LEGAL QUERY & SEARCH TYPES
// ============================================================================

/**
 * Legal query interface - supports all legal research types
 */
export interface LegalQuery {
  /** Natural language or structured query */
  query: string;

  /** Query type determines search strategy */
  queryType?: 'case_law' | 'statute' | 'regulation' | 'mixed';

  /** Jurisdictions to search (ISO country codes) */
  jurisdictions: string[];

  /** Court level filter (1=supreme, 2=appellate, 3=trial) */
  courtLevel?: number[];

  /** Date range for results */
  dateRange?: {
    start: string; // ISO date
    end: string;   // ISO date
  };

  /** Maximum results to return */
  maxResults?: number;

  /** Include citation analysis */
  includeCitationAnalysis?: boolean;

  /** Semantic search threshold (0-1) */
  semanticThreshold?: number;

  /** Additional filters (fully extensible) */
  filters?: Record<string, any>;
}

/**
 * Query preferences for cost optimization
 */
export interface QueryPreferences {
  /** Maximum cost willing to spend */
  maxCost?: number;

  /** Prefer free sources over commercial */
  preferFree?: boolean;

  /** Require current/up-to-date results */
  requireCurrent?: boolean;

  /** Minimum result quality (0-1) */
  minQuality?: number;

  /** Timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// LEGAL RESULT TYPES
// ============================================================================

/**
 * Generic legal result base interface
 */
export interface BaseLegalResult {
  /** Unique identifier */
  id: string;

  /** Result type */
  type: 'case' | 'statute' | 'regulation' | 'article' | 'other';

  /** Title or name */
  title: string;

  /** Citation in specified format */
  citation: string;

  /** Jurisdiction */
  jurisdiction: string;

  /** Relevance score (0-1) */
  relevanceScore: number;

  /** Source database */
  source: string;

  /** Cost to retrieve this result */
  cost: number;

  /** Full text (if available) */
  fullText?: string;

  /** Summary */
  summary?: string;

  /** URL to full document */
  url?: string;

  /** Metadata (fully extensible) */
  metadata: Record<string, any>;
}

/**
 * Case law result
 */
export interface CaseResult extends BaseLegalResult {
  type: 'case';

  /** Case name (e.g., "Riley v. California") */
  caseName: string;

  /** Court identifier */
  courtId: string;

  /** Court name */
  courtName: string;

  /** Decision date */
  decisionDate: string;

  /** Filing date */
  filingDate?: string;

  /** Judge(s) */
  judges?: string[];

  /** Parties */
  parties?: {
    plaintiffs: string[];
    defendants: string[];
  };

  /** Case type/category */
  caseType?: string;

  /** Disposition */
  disposition?: string;

  /** Citation network analysis */
  citationNetwork?: CitationNetwork;

  /** Key holdings */
  keyHoldings?: string[];

  /** Legal issues addressed */
  legalIssues?: string[];
}

/**
 * Statute result
 */
export interface StatuteResult extends BaseLegalResult {
  type: 'statute';

  /** Statute code/section */
  section: string;

  /** Title */
  statuteTitle: string;

  /** Effective date */
  effectiveDate?: string;

  /** Repeal date (if repealed) */
  repealDate?: string;

  /** Status */
  status: 'active' | 'repealed' | 'amended' | 'pending';

  /** Parent statute */
  parentSection?: string;

  /** Child sections */
  childSections?: string[];
}

/**
 * Regulation result
 */
export interface RegulationResult extends BaseLegalResult {
  type: 'regulation';

  /** Regulation number */
  regulationNumber: string;

  /** Issuing agency */
  agency: string;

  /** Effective date */
  effectiveDate?: string;

  /** Status */
  status: 'active' | 'superseded' | 'proposed';
}

/**
 * Citation network analysis
 */
export interface CitationNetwork {
  /** Number of times this case is cited */
  citedByCount: number;

  /** Number of cases this case cites */
  citesCount: number;

  /** Treatment (how other courts have treated this case) */
  treatment: 'followed' | 'distinguished' | 'overruled' | 'questioned' | 'cited';

  /** Most important citing cases */
  topCitingCases?: {
    caseId: string;
    caseName: string;
    citation: string;
    court: string;
    date: string;
    treatment: string;
  }[];

  /** Most important cited cases */
  topCitedCases?: {
    caseId: string;
    caseName: string;
    citation: string;
    court: string;
    date: string;
  }[];
}

/**
 * Query result wrapper
 */
export interface QueryResult {
  /** Results */
  results: BaseLegalResult[];

  /** Total results available */
  totalResults: number;

  /** Results returned */
  returnedResults: number;

  /** Total cost */
  totalCost: number;

  /** Processing time in milliseconds */
  processingTime: number;

  /** Sources used */
  sources: {
    adapterId: string;
    resultsCount: number;
    cost: number;
  }[];

  /** Citation graph (if requested) */
  citationGraph?: any; // Will be Neo4j graph structure

  /** Query ID for caching */
  queryId: string;
}

// ============================================================================
// DATABASE ADAPTER TYPES
// ============================================================================

/**
 * Adapter credentials (encrypted in database)
 */
export interface AdapterCredentials {
  /** API key or token */
  apiKey?: string;

  /** OAuth2 credentials */
  oauth?: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    accessToken?: string;
    refreshToken?: string;
  };

  /** Custom auth headers */
  headers?: Record<string, string>;

  /** Endpoint URL */
  endpoint?: string;
}

/**
 * Health status for adapters
 */
export interface HealthStatus {
  /** Healthy or not */
  healthy: boolean;

  /** Latency in milliseconds */
  latency?: number;

  /** Error message if unhealthy */
  error?: string;

  /** Last check timestamp */
  lastCheck: Date;
}

/**
 * Cost estimate for operations
 */
export interface CostEstimate {
  /** Base charge for operation */
  baseCharge: number;

  /** Per-result charge */
  perResult: number;

  /** Estimated total cost */
  estimatedTotal: number;

  /** Currency (default: USD) */
  currency?: string;
}

/**
 * Citation format specification
 */
export interface CitationFormat {
  /** Format name (e.g., "bluebook", "oscola") */
  name: string;

  /** Template with placeholders */
  template: string;

  /** Example */
  example: string;
}

/**
 * Core interface all database adapters must implement
 */
export interface LegalDatabaseAdapter {
  // ===== Metadata =====

  /** Unique adapter ID (e.g., "lexisnexis-us") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Adapter type */
  readonly type: 'commercial' | 'open_source' | 'government' | 'academic';

  /** Supported jurisdictions (ISO country codes) */
  readonly jurisdictions: string[];

  // ===== Connection Management =====

  /**
   * Connect to the database
   */
  connect(credentials: AdapterCredentials): Promise<void>;

  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>;

  /**
   * Check health status
   */
  healthCheck(): Promise<HealthStatus>;

  // ===== Search Operations =====

  /**
   * Search case law
   */
  searchCases(query: LegalQuery): Promise<CaseResult[]>;

  /**
   * Search statutes
   */
  searchStatutes(query: LegalQuery): Promise<StatuteResult[]>;

  /**
   * Search regulations
   */
  searchRegulations(query: LegalQuery): Promise<RegulationResult[]>;

  // ===== Citation Operations =====

  /**
   * Get formatted citation for a legal document
   */
  getCitation(id: string, format: CitationFormat): Promise<string>;

  /**
   * Validate a citation
   */
  validateCitation(citation: string): Promise<ValidationResult>;

  // ===== Update Operations =====

  /**
   * Get updates since a specific date
   */
  getUpdates(since: Date): Promise<LegalUpdate[]>;

  // ===== Metadata =====

  /**
   * Get supported features
   */
  getSupportedFeatures(): string[];

  /**
   * Get cost estimate for an operation
   */
  getCostEstimate(operation: string, params?: any): CostEstimate;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Valid or not */
  valid: boolean;

  /** Error message if invalid */
  error?: string;

  /** Parsed citation components */
  parsed?: {
    volume?: string;
    reporter?: string;
    page?: string;
    court?: string;
    year?: string;
  };
}

/**
 * Legal update notification
 */
export interface LegalUpdate {
  /** Update type */
  type: 'new_case' | 'amended_statute' | 'new_regulation' | 'overruled';

  /** Document ID */
  documentId: string;

  /** Title */
  title: string;

  /** Update date */
  date: Date;

  /** Jurisdiction */
  jurisdiction: string;

  /** Summary */
  summary: string;

  /** Impact assessment */
  impact?: 'high' | 'medium' | 'low';
}

// ============================================================================
// JURISDICTION & CONFIGURATION TYPES
// ============================================================================

/**
 * Jurisdiction configuration
 */
export interface JurisdictionConfig {
  /** Jurisdiction ID (ISO country code) */
  id: string;

  /** Full name */
  name: string;

  /** Legal system type */
  legalSystem: 'common_law' | 'civil_law' | 'mixed' | 'religious' | 'customary';

  /** Court hierarchy */
  courts: CourtConfig[];

  /** Citation formats */
  citationFormats: Record<string, CitationFormat>;

  /** Database adapters to use */
  databases: {
    primary: AdapterReference[];
    fallback: AdapterReference[];
  };

  /** Supported document types */
  documentTypes: string[];

  /** Procedural rules (fully extensible) */
  proceduralRules?: Record<string, any>;

  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Court configuration
 */
export interface CourtConfig {
  /** Court ID */
  id: string;

  /** Court name */
  name: string;

  /** Level (1=supreme, 2=appellate, 3=trial) */
  level: number;

  /** Binding authority (jurisdictions bound by this court) */
  bindingAuthority: string[];

  /** Parent court */
  parentCourt?: string;

  /** Configuration */
  configuration?: Record<string, any>;
}

/**
 * Adapter reference in jurisdiction config
 */
export interface AdapterReference {
  /** Adapter ID */
  adapter: string;

  /** Priority (1=highest) */
  priority: number;

  /** Cost per query */
  costPerQuery: number;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  /** Success flag */
  success: boolean;

  /** Data payload */
  data?: T;

  /** Error information */
  error?: {
    code: string;
    message: string;
    details?: any;
  };

  /** Metadata */
  metadata?: {
    timestamp: string;
    requestId: string;
    processingTime?: number;
  };
}

/**
 * Legal research request
 */
export interface LegalResearchRequest {
  /** Query */
  query: LegalQuery;

  /** Preferences */
  preferences?: QueryPreferences;

  /** User ID */
  userId?: string;

  /** Session ID */
  sessionId?: string;
}

/**
 * Legal research response
 */
export interface LegalResearchResponse {
  /** Query result */
  result: QueryResult;

  /** Query ID for reference */
  queryId: string;

  /** Cached or not */
  cached: boolean;
}

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Legal document metadata
 */
export interface LegalDocumentMetadata {
  /** Document ID */
  id: string;

  /** Document type */
  documentType: string;

  /** Title */
  title: string;

  /** Jurisdiction */
  jurisdiction: string;

  /** Filing date */
  filingDate?: string;

  /** Author/filer */
  author?: string;

  /** Case ID (if applicable) */
  caseId?: string;

  /** Document DNA ID (from FileProcess) */
  documentDnaId?: string;

  /** Privilege status */
  privilegeStatus?: 'privileged' | 'work_product' | 'none';

  /** Confidentiality */
  confidentiality?: 'public' | 'confidential' | 'highly_confidential';

  /** Tags */
  tags?: string[];

  /** Custom metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// TASK & JOB TYPES
// ============================================================================

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Task result
 */
export interface TaskResult<T = any> {
  /** Task ID */
  taskId: string;

  /** Status */
  status: TaskStatus;

  /** Progress (0-100) */
  progress: number;

  /** Result data */
  result?: T;

  /** Error if failed */
  error?: string;

  /** Created at */
  createdAt: Date;

  /** Started at */
  startedAt?: Date;

  /** Completed at */
  completedAt?: Date;
}

// ============================================================================
// EXPORTS
// ============================================================================

export * from './adapters';
export * from './api';

// Type guards
export function isCaseResult(result: BaseLegalResult): result is CaseResult {
  return result.type === 'case';
}

export function isStatuteResult(result: BaseLegalResult): result is StatuteResult {
  return result.type === 'statute';
}

export function isRegulationResult(result: BaseLegalResult): result is RegulationResult {
  return result.type === 'regulation';
}

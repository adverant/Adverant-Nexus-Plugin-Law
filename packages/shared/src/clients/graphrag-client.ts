/**
 * GraphRAG Integration Client for Nexus Law
 *
 * Deep integration with GraphRAG for:
 * - Document DNA storage (triple-layer: Raw + Chunks + Embeddings)
 * - Citation network analysis (Neo4j knowledge graph)
 * - Semantic search across legal corpus
 * - Knowledge graph queries for legal research
 * - Entity extraction and relationship mapping
 *
 * GraphRAG provides:
 * - 10,000+ chunks/sec processing
 * - Sub-100ms semantic search
 * - Multi-modal embeddings (text, images, tables)
 * - Temporal queries (see how law evolved)
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { io, Socket } from 'socket.io-client';

export interface GraphRAGConfig {
  baseUrl: string;
  timeout?: number;
  wsUrl?: string; // For WebSocket streaming
}

export interface DocumentDNA {
  /** Document ID */
  documentId: string;

  /** Original document metadata */
  metadata: {
    title: string;
    caseId?: string;
    court?: string;
    jurisdiction: string;
    decisionDate?: string;
    judges?: string[];
    parties?: string[];
    docType: 'case' | 'statute' | 'regulation' | 'brief' | 'contract' | 'memo';
  };

  /** Triple-layer storage */
  layers: {
    raw: {
      content: string;
      format: 'pdf' | 'docx' | 'html' | 'text';
      size: number;
    };
    chunks: {
      count: number;
      avgSize: number;
      strategy: 'semantic' | 'paragraph' | 'section';
    };
    embeddings: {
      model: string;
      dimensions: number;
      quality: number; // 0-1
    };
  };

  /** Knowledge graph IDs */
  graphIds: {
    neo4jNodeId: string;
    qdrantCollectionId: string;
  };

  /** Citation network */
  citations: {
    citedCases: string[];
    citedBy: string[];
    citationDepth: number;
  };

  /** Processing status */
  status: 'processing' | 'complete' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface SemanticSearchQuery {
  /** Search query */
  query: string;

  /** Jurisdiction filter */
  jurisdiction?: string;

  /** Document type filter */
  docType?: ('case' | 'statute' | 'regulation' | 'brief' | 'contract' | 'memo')[];

  /** Date range */
  dateRange?: {
    start: string;
    end: string;
  };

  /** Citation depth (find cases N levels deep) */
  citationDepth?: number;

  /** Similarity threshold (0-1) */
  threshold?: number;

  /** Max results */
  limit?: number;

  /** Include full text */
  includeFullText?: boolean;

  /** Re-rank results */
  rerank?: boolean;
}

export interface SemanticSearchResult {
  /** Document ID */
  documentId: string;

  /** Match score (0-1) */
  score: number;

  /** Document metadata */
  metadata: Record<string, any>;

  /** Matched chunks */
  chunks: {
    chunkId: string;
    content: string;
    score: number;
    context?: string; // Surrounding text
  }[];

  /** Citation context */
  citationContext?: {
    citedBy: number;
    cites: number;
    influence: number; // 0-1
  };

  /** Full text (if requested) */
  fullText?: string;
}

export interface KnowledgeGraphQuery {
  /** Cypher query or natural language */
  query: string;

  /** Query type */
  type: 'cypher' | 'natural';

  /** Start node (if relationship traversal) */
  startNode?: string;

  /** Relationship types to traverse */
  relationships?: string[];

  /** Max depth */
  maxDepth?: number;

  /** Return format */
  format?: 'graph' | 'list' | 'tree';
}

export interface CitationNetwork {
  /** Root case */
  rootCase: {
    id: string;
    name: string;
    citation: string;
  };

  /** Citation graph */
  graph: {
    nodes: {
      id: string;
      name: string;
      citation: string;
      jurisdiction: string;
      decisionDate: string;
      influence: number; // 0-1
    }[];
    edges: {
      source: string;
      target: string;
      type: 'cites' | 'cited_by' | 'distinguishes' | 'overrules';
      weight: number;
    }[];
  };

  /** Analysis */
  analysis: {
    totalCitations: number;
    depth: number;
    mostInfluential: string[];
    temporalTrend: 'increasing' | 'stable' | 'decreasing';
  };
}

export interface EntityExtractionResult {
  /** Document ID */
  documentId: string;

  /** Extracted entities */
  entities: {
    type: 'person' | 'organization' | 'location' | 'statute' | 'case' | 'legal_term';
    value: string;
    confidence: number;
    mentions: number;
    context?: string[];
  }[];

  /** Relationships */
  relationships: {
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }[];
}

/**
 * GraphRAG client with deep legal intelligence integration
 */
export class GraphRAGClient {
  private client: AxiosInstance;
  private config: GraphRAGConfig;
  private wsSocket: Socket | null = null;

  constructor(config: GraphRAGConfig) {
    this.config = {
      timeout: 60000, // 1 minute default
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Configure retries
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error);
      },
    });
  }

  // ========================================================================
  // DOCUMENT DNA STORAGE
  // ========================================================================

  /**
   * Store legal document with triple-layer processing
   *
   * Creates Document DNA:
   * 1. Raw layer: Original document
   * 2. Chunk layer: Semantic chunks
   * 3. Embedding layer: Vector embeddings
   *
   * Also creates knowledge graph nodes and citation relationships
   *
   * Example:
   * ```typescript
   * const dna = await client.storeDocument({
   *   content: pdfBuffer,
   *   metadata: {
   *     title: "Brown v. Board of Education",
   *     court: "U.S. Supreme Court",
   *     jurisdiction: "us",
   *     decisionDate: "1954-05-17"
   *   }
   * });
   * ```
   */
  async storeDocument(params: {
    content: Buffer | string;
    metadata: DocumentDNA['metadata'];
    chunkingStrategy?: 'semantic' | 'paragraph' | 'section';
    embeddingModel?: string;
  }): Promise<DocumentDNA> {
    try {
      const formData = new FormData();

      // Add content
      if (Buffer.isBuffer(params.content)) {
        formData.append('file', new Blob([params.content]));
      } else {
        formData.append('content', params.content);
      }

      // Add metadata
      formData.append('metadata', JSON.stringify(params.metadata));
      formData.append('chunkingStrategy', params.chunkingStrategy || 'semantic');
      formData.append('embeddingModel', params.embeddingModel || 'openai-text-embedding-3-large');

      const response = await this.client.post('/api/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data.data.documentDNA;
    } catch (error: any) {
      throw new Error(`Failed to store document: ${error.message}`);
    }
  }

  /**
   * Get Document DNA by ID
   */
  async getDocumentDNA(documentId: string): Promise<DocumentDNA> {
    try {
      const response = await this.client.get(`/api/documents/${documentId}`);
      return response.data.data.documentDNA;
    } catch (error: any) {
      throw new Error(`Failed to get document DNA: ${error.message}`);
    }
  }

  /**
   * Batch store multiple documents (optimized)
   */
  async storeDocumentBatch(documents: Array<{
    content: Buffer | string;
    metadata: DocumentDNA['metadata'];
  }>): Promise<DocumentDNA[]> {
    try {
      const response = await this.client.post('/api/documents/batch', {
        documents: documents.map(doc => ({
          content: Buffer.isBuffer(doc.content)
            ? doc.content.toString('base64')
            : doc.content,
          metadata: doc.metadata,
        })),
      });

      return response.data.data.documentDNAs;
    } catch (error: any) {
      throw new Error(`Failed to batch store documents: ${error.message}`);
    }
  }

  // ========================================================================
  // SEMANTIC SEARCH
  // ========================================================================

  /**
   * Semantic search across legal corpus
   *
   * Uses vector embeddings for similarity search:
   * - Sub-100ms response time
   * - Semantic understanding (not just keywords)
   * - Multi-modal (text, images, tables)
   * - Citation-aware ranking
   *
   * Example:
   * ```typescript
   * const results = await client.semanticSearch({
   *   query: "Is non-compete enforceable in California?",
   *   jurisdiction: "us-ca",
   *   docType: ["case", "statute"],
   *   threshold: 0.7,
   *   rerank: true
   * });
   * ```
   */
  async semanticSearch(query: SemanticSearchQuery): Promise<SemanticSearchResult[]> {
    try {
      const response = await this.client.post('/api/search/semantic', {
        query: query.query,
        filters: {
          jurisdiction: query.jurisdiction,
          docType: query.docType,
          dateRange: query.dateRange,
        },
        threshold: query.threshold || 0.6,
        limit: query.limit || 20,
        includeFullText: query.includeFullText || false,
        rerank: query.rerank || false,
      });

      return response.data.data.results;
    } catch (error: any) {
      throw new Error(`Semantic search failed: ${error.message}`);
    }
  }

  /**
   * Hybrid search (semantic + keyword)
   *
   * Combines vector search with traditional full-text search for best results
   */
  async hybridSearch(
    semanticQuery: string,
    keywordQuery: string,
    filters?: Partial<SemanticSearchQuery>
  ): Promise<SemanticSearchResult[]> {
    try {
      const response = await this.client.post('/api/search/hybrid', {
        semanticQuery,
        keywordQuery,
        filters,
        weights: { semantic: 0.7, keyword: 0.3 }, // Prefer semantic
      });

      return response.data.data.results;
    } catch (error: any) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  /**
   * Citation-aware search
   *
   * Searches and ranks by citation influence
   */
  async citationSearch(
    query: string,
    options?: {
      minCitations?: number;
      jurisdiction?: string;
      depth?: number;
    }
  ): Promise<SemanticSearchResult[]> {
    try {
      const response = await this.client.post('/api/search/citation-aware', {
        query,
        minCitations: options?.minCitations || 0,
        jurisdiction: options?.jurisdiction,
        depth: options?.depth || 1,
      });

      return response.data.data.results;
    } catch (error: any) {
      throw new Error(`Citation search failed: ${error.message}`);
    }
  }

  // ========================================================================
  // CITATION NETWORK ANALYSIS
  // ========================================================================

  /**
   * Build citation network for a case
   *
   * Creates graph showing:
   * - Cases this case cites
   * - Cases that cite this case
   * - Relationships (follows, distinguishes, overrules)
   * - Influence scores
   * - Temporal trends
   *
   * Example:
   * ```typescript
   * const network = await client.buildCitationNetwork("case_123", {
   *   depth: 3, // 3 levels deep
   *   minInfluence: 0.5
   * });
   * ```
   */
  async buildCitationNetwork(
    caseId: string,
    options?: {
      depth?: number;
      minInfluence?: number;
      includeStatutes?: boolean;
    }
  ): Promise<CitationNetwork> {
    try {
      const response = await this.client.post('/api/citations/network', {
        caseId,
        depth: options?.depth || 2,
        minInfluence: options?.minInfluence || 0.0,
        includeStatutes: options?.includeStatutes || false,
      });

      return response.data.data.network;
    } catch (error: any) {
      throw new Error(`Failed to build citation network: ${error.message}`);
    }
  }

  /**
   * Get citation analysis for a case
   */
  async getCitationAnalysis(caseId: string): Promise<{
    citedByCount: number;
    citesCount: number;
    influence: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    mostInfluentialCitations: string[];
    keyPrecedents: string[];
  }> {
    try {
      const response = await this.client.get(`/api/citations/${caseId}/analysis`);
      return response.data.data.analysis;
    } catch (error: any) {
      throw new Error(`Failed to get citation analysis: ${error.message}`);
    }
  }

  /**
   * Find similar cases by citation pattern
   */
  async findSimilarByCitation(
    caseId: string,
    limit: number = 10
  ): Promise<Array<{ caseId: string; similarity: number; sharedCitations: number }>> {
    try {
      const response = await this.client.post('/api/citations/similar', {
        caseId,
        limit,
      });

      return response.data.data.similarCases;
    } catch (error: any) {
      throw new Error(`Failed to find similar cases: ${error.message}`);
    }
  }

  // ========================================================================
  // KNOWLEDGE GRAPH QUERIES
  // ========================================================================

  /**
   * Query knowledge graph (Cypher or natural language)
   *
   * Examples:
   * ```typescript
   * // Cypher query
   * const results = await client.queryKnowledgeGraph({
   *   query: "MATCH (c:Case)-[:CITES]->(p:Case) WHERE c.id = 'case_123' RETURN p",
   *   type: "cypher"
   * });
   *
   * // Natural language query
   * const results = await client.queryKnowledgeGraph({
   *   query: "Show me all cases that cite Brown v. Board of Education",
   *   type: "natural"
   * });
   * ```
   */
  async queryKnowledgeGraph(query: KnowledgeGraphQuery): Promise<any> {
    try {
      if (query.type === 'natural') {
        // Convert natural language to Cypher
        const response = await this.client.post('/api/graph/nl-query', {
          query: query.query,
          format: query.format || 'list',
        });
        return response.data.data.results;
      } else {
        // Direct Cypher query
        const response = await this.client.post('/api/graph/cypher', {
          query: query.query,
          params: {},
        });
        return response.data.data.results;
      }
    } catch (error: any) {
      throw new Error(`Knowledge graph query failed: ${error.message}`);
    }
  }

  /**
   * Traverse relationships from a starting node
   */
  async traverseRelationships(
    startNodeId: string,
    relationships: string[],
    maxDepth: number = 3
  ): Promise<any> {
    try {
      const response = await this.client.post('/api/graph/traverse', {
        startNodeId,
        relationships,
        maxDepth,
      });

      return response.data.data.graph;
    } catch (error: any) {
      throw new Error(`Relationship traversal failed: ${error.message}`);
    }
  }

  // ========================================================================
  // ENTITY EXTRACTION & RELATIONSHIPS
  // ========================================================================

  /**
   * Extract legal entities from document
   *
   * Identifies:
   * - People (judges, lawyers, parties)
   * - Organizations (courts, firms, agencies)
   * - Legal terms and concepts
   * - Statutes and regulations cited
   * - Other cases referenced
   */
  async extractEntities(
    documentId: string,
    entityTypes?: string[]
  ): Promise<EntityExtractionResult> {
    try {
      const response = await this.client.post('/api/entities/extract', {
        documentId,
        entityTypes: entityTypes || ['person', 'organization', 'statute', 'case', 'legal_term'],
      });

      return response.data.data.extraction;
    } catch (error: any) {
      throw new Error(`Entity extraction failed: ${error.message}`);
    }
  }

  /**
   * Create relationship between entities
   */
  async createEntityRelationship(
    subjectId: string,
    predicate: string,
    objectId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.client.post('/api/entities/relationships', {
        subjectId,
        predicate,
        objectId,
        metadata,
      });
    } catch (error: any) {
      throw new Error(`Failed to create relationship: ${error.message}`);
    }
  }

  // ========================================================================
  // TEMPORAL QUERIES
  // ========================================================================

  /**
   * Track how legal concepts evolved over time
   *
   * Example: "How has the interpretation of 'fair use' changed from 1950 to 2024?"
   */
  async temporalQuery(
    concept: string,
    startDate: string,
    endDate: string,
    jurisdiction?: string
  ): Promise<{
    timeline: Array<{
      date: string;
      caseId: string;
      caseName: string;
      interpretation: string;
      trend: 'expanding' | 'restricting' | 'neutral';
    }>;
    overallTrend: string;
    keyShifts: Array<{ date: string; description: string }>;
  }> {
    try {
      const response = await this.client.post('/api/temporal/query', {
        concept,
        startDate,
        endDate,
        jurisdiction,
      });

      return response.data.data.timeline;
    } catch (error: any) {
      throw new Error(`Temporal query failed: ${error.message}`);
    }
  }

  // ========================================================================
  // STREAMING (WebSocket)
  // ========================================================================

  /**
   * Subscribe to ingestion progress
   */
  async subscribeToIngestion(
    jobId: string,
    onProgress: (data: any) => void,
    onComplete: (data: any) => void,
    onError: (error: any) => void
  ): Promise<void> {
    if (!this.config.wsUrl) {
      throw new Error('WebSocket URL required for streaming');
    }

    this.wsSocket = io(this.config.wsUrl);

    this.wsSocket.on('connect', () => {
      console.log('[GraphRAG] WebSocket connected');
      this.wsSocket!.emit('subscribe', { room: `ingestion:${jobId}` });
    });

    this.wsSocket.on(`ingestion:${jobId}`, (data: any) => {
      if (data.status === 'progress') {
        onProgress(data);
      } else if (data.status === 'completed') {
        onComplete(data);
        this.wsSocket?.disconnect();
      } else if (data.status === 'failed') {
        onError(new Error(data.error));
        this.wsSocket?.disconnect();
      }
    });

    this.wsSocket.on('error', (error) => {
      console.error('[GraphRAG] WebSocket error:', error);
      onError(error);
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.wsSocket) {
      this.wsSocket.disconnect();
      this.wsSocket = null;
    }
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  /**
   * Check GraphRAG service health
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency?: number;
    collections?: string[];
    error?: string
  }> {
    try {
      const start = Date.now();
      const response = await this.client.get('/health', { timeout: 5000 });
      const latency = Date.now() - start;

      return {
        healthy: true,
        latency,
        collections: response.data.collections || []
      };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }
}

// Export for convenience
export default GraphRAGClient;

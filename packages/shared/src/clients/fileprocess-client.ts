/**
 * FileProcess Integration Client for Nexus Law
 *
 * Deep integration with FileProcess for:
 * - High-volume document processing (1200+ docs/hour)
 * - Multi-format support (PDF, DOCX, images, scanned docs)
 * - OCR with 97.9% accuracy
 * - Legal document classification
 * - Automated metadata extraction
 * - Batch processing optimization
 *
 * FileProcess provides:
 * - 1200+ documents/hour throughput
 * - 97.9% OCR accuracy
 * - Auto-classification (contracts, briefs, discovery, etc.)
 * - Table extraction from PDFs
 * - Multi-language support
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { io, Socket } from 'socket.io-client';

export interface FileProcessConfig {
  baseUrl: string;
  timeout?: number;
  wsUrl?: string; // For WebSocket streaming
}

export interface ProcessingJob {
  /** Job ID */
  jobId: string;

  /** Status */
  status: 'queued' | 'processing' | 'completed' | 'failed';

  /** Progress (0-100) */
  progress: number;

  /** Documents */
  documents: {
    total: number;
    processed: number;
    failed: number;
  };

  /** Started/completed timestamps */
  startedAt?: string;
  completedAt?: string;

  /** Error if failed */
  error?: string;
}

export interface DocumentProcessingRequest {
  /** File buffer or URL */
  source: Buffer | string;

  /** Source type */
  sourceType: 'buffer' | 'url' | 'path';

  /** Document metadata */
  metadata: {
    fileName: string;
    fileType: 'pdf' | 'docx' | 'doc' | 'rtf' | 'html' | 'txt' | 'image';
    jurisdiction?: string;
    docType?: 'case' | 'statute' | 'contract' | 'brief' | 'discovery' | 'motion' | 'memo';
    parties?: string[];
    court?: string;
    caseNumber?: string;
  };

  /** Processing options */
  options?: {
    /** Enable OCR for scanned documents */
    enableOCR?: boolean;

    /** OCR language */
    ocrLanguage?: string;

    /** Extract tables */
    extractTables?: boolean;

    /** Extract images */
    extractImages?: boolean;

    /** Auto-classify document type */
    autoClassify?: boolean;

    /** Extract metadata automatically */
    autoExtractMetadata?: boolean;

    /** Chunk for GraphRAG ingestion */
    createChunks?: boolean;

    /** Chunking strategy */
    chunkingStrategy?: 'semantic' | 'paragraph' | 'section';
  };
}

export interface ProcessedDocument {
  /** Document ID */
  documentId: string;

  /** Original metadata */
  metadata: DocumentProcessingRequest['metadata'];

  /** Extracted content */
  content: {
    /** Full text */
    text: string;

    /** Text length */
    length: number;

    /** Detected language */
    language: string;

    /** Encoding confidence (0-1) */
    confidence: number;
  };

  /** Extracted metadata */
  extractedMetadata: {
    /** Auto-detected document type */
    docType?: string;

    /** Parties identified */
    parties?: string[];

    /** Dates found */
    dates?: string[];

    /** Courts mentioned */
    courts?: string[];

    /** Citations found */
    citations?: string[];

    /** Judges mentioned */
    judges?: string[];

    /** Case numbers */
    caseNumbers?: string[];

    /** Statutes referenced */
    statutes?: string[];
  };

  /** Tables (if extracted) */
  tables?: Array<{
    tableId: string;
    rows: number;
    cols: number;
    data: string[][];
    context?: string; // Surrounding text
  }>;

  /** Images (if extracted) */
  images?: Array<{
    imageId: string;
    format: string;
    size: number;
    caption?: string;
  }>;

  /** Chunks (if created) */
  chunks?: Array<{
    chunkId: string;
    content: string;
    position: number;
    type: 'text' | 'table' | 'image';
  }>;

  /** Processing metrics */
  processing: {
    duration: number; // ms
    ocrUsed: boolean;
    confidence: number; // 0-1
    quality: 'high' | 'medium' | 'low';
  };

  /** Status */
  status: 'completed' | 'partial' | 'failed';
  error?: string;
}

export interface BatchProcessingRequest {
  /** Documents to process */
  documents: DocumentProcessingRequest[];

  /** Batch options */
  options?: {
    /** Max concurrent processing */
    concurrency?: number;

    /** Stop on first error */
    stopOnError?: boolean;

    /** Priority (higher = process first) */
    priority?: number;

    /** Callback URL for completion */
    webhookUrl?: string;
  };
}

export interface ClassificationResult {
  /** Document type */
  docType: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Alternative classifications */
  alternatives: Array<{
    docType: string;
    confidence: number;
  }>;

  /** Classification reasoning */
  reasoning?: string;
}

/**
 * FileProcess client with deep legal document processing integration
 */
export class FileProcessClient {
  private client: AxiosInstance;
  private config: FileProcessConfig;
  private wsSocket: Socket | null = null;

  constructor(config: FileProcessConfig) {
    this.config = {
      timeout: 300000, // 5 minutes default for large files
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
  // SINGLE DOCUMENT PROCESSING
  // ========================================================================

  /**
   * Process a single legal document
   *
   * Supports:
   * - PDF (native and scanned)
   * - DOCX, DOC, RTF
   * - HTML, plain text
   * - Images (PNG, JPG, TIFF)
   *
   * Processing includes:
   * - OCR for scanned documents (97.9% accuracy)
   * - Table extraction
   * - Image extraction
   * - Metadata extraction (parties, dates, citations)
   * - Auto-classification
   * - Chunking for GraphRAG
   *
   * Example:
   * ```typescript
   * const result = await client.processDocument({
   *   source: pdfBuffer,
   *   sourceType: 'buffer',
   *   metadata: {
   *     fileName: 'contract.pdf',
   *     fileType: 'pdf',
   *     docType: 'contract'
   *   },
   *   options: {
   *     enableOCR: true,
   *     extractTables: true,
   *     autoExtractMetadata: true,
   *     createChunks: true
   *   }
   * });
   * ```
   */
  async processDocument(request: DocumentProcessingRequest): Promise<ProcessedDocument> {
    try {
      const formData = new FormData();

      // Add source
      if (request.sourceType === 'buffer') {
        formData.append('file', new Blob([request.source as Buffer]));
      } else if (request.sourceType === 'url') {
        formData.append('url', request.source as string);
      } else if (request.sourceType === 'path') {
        formData.append('path', request.source as string);
      }

      // Add metadata
      formData.append('metadata', JSON.stringify(request.metadata));

      // Add options
      if (request.options) {
        formData.append('options', JSON.stringify(request.options));
      }

      const response = await this.client.post('/api/process', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data.data.document;
    } catch (error: any) {
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  /**
   * Process document from URL
   */
  async processFromUrl(
    url: string,
    metadata: DocumentProcessingRequest['metadata'],
    options?: DocumentProcessingRequest['options']
  ): Promise<ProcessedDocument> {
    return this.processDocument({
      source: url,
      sourceType: 'url',
      metadata,
      options,
    });
  }

  /**
   * Process document from file path
   */
  async processFromPath(
    path: string,
    metadata: DocumentProcessingRequest['metadata'],
    options?: DocumentProcessingRequest['options']
  ): Promise<ProcessedDocument> {
    return this.processDocument({
      source: path,
      sourceType: 'path',
      metadata,
      options,
    });
  }

  // ========================================================================
  // BATCH PROCESSING
  // ========================================================================

  /**
   * Process multiple documents in batch
   *
   * Optimized for high throughput (1200+ docs/hour):
   * - Parallel processing
   * - Queue management
   * - Progress tracking
   * - Error handling
   *
   * Example:
   * ```typescript
   * const job = await client.processBatch({
   *   documents: [
   *     { source: buffer1, sourceType: 'buffer', metadata: {...} },
   *     { source: buffer2, sourceType: 'buffer', metadata: {...} },
   *     // ... 100 more documents
   *   ],
   *   options: {
   *     concurrency: 10,
   *     stopOnError: false,
   *     priority: 5
   *   }
   * });
   *
   * // Monitor progress
   * const status = await client.getJobStatus(job.jobId);
   * ```
   */
  async processBatch(request: BatchProcessingRequest): Promise<ProcessingJob> {
    try {
      const response = await this.client.post('/api/process/batch', {
        documents: request.documents.map(doc => ({
          source: Buffer.isBuffer(doc.source)
            ? (doc.source as Buffer).toString('base64')
            : doc.source,
          sourceType: doc.sourceType,
          metadata: doc.metadata,
          options: doc.options,
        })),
        options: request.options,
      });

      return response.data.data.job;
    } catch (error: any) {
      throw new Error(`Batch processing failed: ${error.message}`);
    }
  }

  /**
   * Get batch job status
   */
  async getJobStatus(jobId: string): Promise<ProcessingJob> {
    try {
      const response = await this.client.get(`/api/jobs/${jobId}`);
      return response.data.data.job;
    } catch (error: any) {
      throw new Error(`Failed to get job status: ${error.message}`);
    }
  }

  /**
   * Get batch job results
   */
  async getJobResults(jobId: string): Promise<ProcessedDocument[]> {
    try {
      const response = await this.client.get(`/api/jobs/${jobId}/results`);
      return response.data.data.documents;
    } catch (error: any) {
      throw new Error(`Failed to get job results: ${error.message}`);
    }
  }

  /**
   * Cancel batch job
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      await this.client.post(`/api/jobs/${jobId}/cancel`);
    } catch (error: any) {
      throw new Error(`Failed to cancel job: ${error.message}`);
    }
  }

  // ========================================================================
  // DOCUMENT CLASSIFICATION
  // ========================================================================

  /**
   * Classify document type automatically
   *
   * Identifies:
   * - Contracts (various types)
   * - Court documents (briefs, motions, orders)
   * - Discovery documents
   * - Legal memos
   * - Case law
   * - Statutes/regulations
   *
   * Uses ML model trained on 100,000+ legal documents
   */
  async classifyDocument(
    content: string | Buffer,
    jurisdiction?: string
  ): Promise<ClassificationResult> {
    try {
      const response = await this.client.post('/api/classify', {
        content: Buffer.isBuffer(content) ? content.toString('base64') : content,
        jurisdiction,
      });

      return response.data.data.classification;
    } catch (error: any) {
      throw new Error(`Document classification failed: ${error.message}`);
    }
  }

  // ========================================================================
  // OCR OPERATIONS
  // ========================================================================

  /**
   * Perform OCR on scanned document
   *
   * Features:
   * - 97.9% accuracy
   * - Multi-language support
   * - Table detection
   * - Handwriting recognition
   * - Layout preservation
   */
  async performOCR(
    image: Buffer,
    options?: {
      language?: string;
      detectTables?: boolean;
      preserveLayout?: boolean;
    }
  ): Promise<{
    text: string;
    confidence: number;
    language: string;
    pages: number;
    tables?: any[];
  }> {
    try {
      const formData = new FormData();
      formData.append('image', new Blob([image]));
      if (options) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await this.client.post('/api/ocr', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data.data.result;
    } catch (error: any) {
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  // ========================================================================
  // METADATA EXTRACTION
  // ========================================================================

  /**
   * Extract legal metadata from document
   *
   * Extracts:
   * - Parties (plaintiff, defendant, counsel)
   * - Dates (filing, hearing, decision)
   * - Courts and judges
   * - Case numbers and docket numbers
   * - Citations (cases, statutes, regulations)
   * - Key legal terms
   */
  async extractMetadata(
    content: string,
    docType?: string
  ): Promise<ProcessedDocument['extractedMetadata']> {
    try {
      const response = await this.client.post('/api/extract/metadata', {
        content,
        docType,
      });

      return response.data.data.metadata;
    } catch (error: any) {
      throw new Error(`Metadata extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract citations from document
   */
  async extractCitations(content: string): Promise<Array<{
    citation: string;
    type: 'case' | 'statute' | 'regulation';
    jurisdiction?: string;
    year?: number;
    confidence: number;
  }>> {
    try {
      const response = await this.client.post('/api/extract/citations', {
        content,
      });

      return response.data.data.citations;
    } catch (error: any) {
      throw new Error(`Citation extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract tables from document
   */
  async extractTables(
    documentId: string
  ): Promise<ProcessedDocument['tables']> {
    try {
      const response = await this.client.get(`/api/documents/${documentId}/tables`);
      return response.data.data.tables;
    } catch (error: any) {
      throw new Error(`Table extraction failed: ${error.message}`);
    }
  }

  // ========================================================================
  // CHUNKING FOR GRAPHRAG
  // ========================================================================

  /**
   * Create semantic chunks for GraphRAG ingestion
   *
   * Strategies:
   * - Semantic: AI-powered boundary detection
   * - Paragraph: Split by paragraphs
   * - Section: Split by document sections
   *
   * Optimized chunk sizes for embeddings (typically 512-1024 tokens)
   */
  async createChunks(
    content: string,
    strategy: 'semantic' | 'paragraph' | 'section' = 'semantic',
    options?: {
      maxChunkSize?: number;
      overlapTokens?: number;
      preserveContext?: boolean;
    }
  ): Promise<Array<{
    chunkId: string;
    content: string;
    position: number;
    tokens: number;
    metadata?: Record<string, any>;
  }>> {
    try {
      const response = await this.client.post('/api/chunk', {
        content,
        strategy,
        options: {
          maxChunkSize: options?.maxChunkSize || 1024,
          overlapTokens: options?.overlapTokens || 100,
          preserveContext: options?.preserveContext !== false,
        },
      });

      return response.data.data.chunks;
    } catch (error: any) {
      throw new Error(`Chunking failed: ${error.message}`);
    }
  }

  // ========================================================================
  // QUALITY METRICS
  // ========================================================================

  /**
   * Get processing quality metrics
   */
  async getQualityMetrics(documentId: string): Promise<{
    overallQuality: 'high' | 'medium' | 'low';
    ocrConfidence?: number;
    extractionAccuracy: number;
    classificationConfidence: number;
    issues: Array<{
      type: 'poor_scan' | 'missing_text' | 'corrupted_table' | 'unknown_format';
      severity: 'high' | 'medium' | 'low';
      description: string;
    }>;
  }> {
    try {
      const response = await this.client.get(`/api/documents/${documentId}/quality`);
      return response.data.data.metrics;
    } catch (error: any) {
      throw new Error(`Failed to get quality metrics: ${error.message}`);
    }
  }

  // ========================================================================
  // STREAMING (WebSocket)
  // ========================================================================

  /**
   * Subscribe to batch job progress via WebSocket
   */
  async subscribeToBatchJob(
    jobId: string,
    onProgress: (data: {
      jobId: string;
      processed: number;
      total: number;
      currentFile: string;
      progress: number;
    }) => void,
    onComplete: (data: {
      jobId: string;
      totalProcessed: number;
      totalFailed: number;
      duration: number;
    }) => void,
    onError: (error: any) => void
  ): Promise<void> {
    if (!this.config.wsUrl) {
      throw new Error('WebSocket URL required for streaming');
    }

    this.wsSocket = io(this.config.wsUrl);

    this.wsSocket.on('connect', () => {
      console.log('[FileProcess] WebSocket connected');
      this.wsSocket!.emit('subscribe', { room: `job:${jobId}` });
    });

    this.wsSocket.on(`job:${jobId}`, (data: any) => {
      if (data.type === 'progress') {
        onProgress(data);
      } else if (data.type === 'completed') {
        onComplete(data);
        this.wsSocket?.disconnect();
      } else if (data.type === 'failed') {
        onError(new Error(data.error));
        this.wsSocket?.disconnect();
      }
    });

    this.wsSocket.on('error', (error) => {
      console.error('[FileProcess] WebSocket error:', error);
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
  // SUPPORTED FORMATS
  // ========================================================================

  /**
   * Get list of supported file formats
   */
  async getSupportedFormats(): Promise<{
    formats: string[];
    capabilities: Record<string, {
      ocr: boolean;
      tables: boolean;
      images: boolean;
      metadata: boolean;
    }>;
  }> {
    try {
      const response = await this.client.get('/api/formats');
      return response.data.data;
    } catch (error: any) {
      throw new Error(`Failed to get supported formats: ${error.message}`);
    }
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  /**
   * Check FileProcess service health
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency?: number;
    throughput?: number; // docs/hour
    queueSize?: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      const response = await this.client.get('/health', { timeout: 5000 });
      const latency = Date.now() - start;

      return {
        healthy: true,
        latency,
        throughput: response.data.throughput,
        queueSize: response.data.queueSize,
      };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }
}

// Export for convenience
export default FileProcessClient;

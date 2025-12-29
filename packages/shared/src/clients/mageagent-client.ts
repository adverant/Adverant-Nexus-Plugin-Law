/**
 * MageAgent Integration Client for Nexus Law
 *
 * Deep integration with MageAgent for:
 * - Multi-agent legal research (spawn specialized legal research agents)
 * - Document analysis with multiple perspectives
 * - Automated legal memo generation
 * - Predictive case outcome analysis
 * - Complex multi-step legal reasoning
 *
 * MageAgent provides:
 * - 320+ LLM models
 * - Multi-agent orchestration
 * - Real-time streaming via WebSocket
 * - Cost optimization across models
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { io, Socket } from 'socket.io-client';

export interface MageAgentConfig {
  baseUrl: string;
  timeout?: number;
  graphragUrl?: string; // For WebSocket streaming
}

export interface LegalResearchTask {
  /** Research question */
  task: string;

  /** Maximum agents to spawn */
  maxAgents?: number;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Enable streaming progress */
  streamProgress?: boolean;

  /** Context for research */
  context?: {
    jurisdiction?: string;
    caseType?: string;
    focusAreas?: string[];
    precedents?: string[];
  };
}

export interface DocumentAnalysisTask {
  /** Document ID or content */
  documentId?: string;
  content?: string;

  /** Analysis type */
  analysisType: 'contract_review' | 'brief_analysis' | 'discovery_review' | 'compliance_check';

  /** Jurisdiction for legal standards */
  jurisdiction: string;

  /** Compare to template/standard */
  compareToStandard?: string;

  /** Focus areas */
  focusAreas?: string[];
}

export interface PredictiveAnalysisTask {
  /** Case facts */
  facts: Record<string, any>;

  /** Case type */
  caseType: string;

  /** Jurisdiction */
  jurisdiction: string;

  /** Historical cases to consider */
  similarCases?: string[];

  /** Judge information */
  judge?: {
    name: string;
    historicalData?: any;
  };
}

export interface TaskResult<T = any> {
  /** Task ID */
  taskId: string;

  /** Status */
  status: 'pending' | 'running' | 'completed' | 'failed';

  /** Progress (0-100) */
  progress: number;

  /** Result data */
  result?: T;

  /** Error if failed */
  error?: string;

  /** Metadata */
  metadata?: {
    agentsSpawned?: number;
    processingTime?: number;
    cost?: number;
  };
}

export interface LegalMemoResult {
  /** Complete legal memo */
  memo: string;

  /** Analysis sections */
  sections: {
    issue: string;
    rule: string;
    application: string;
    conclusion: string;
  };

  /** Citations */
  citations: {
    caseId: string;
    citation: string;
    relevance: string;
  }[];

  /** Confidence score */
  confidence: number;

  /** Research depth */
  depth: 'shallow' | 'moderate' | 'deep';
}

/**
 * MageAgent client with deep legal intelligence integration
 */
export class MageAgentClient {
  private client: AxiosInstance;
  private config: MageAgentConfig;
  private wsSocket: Socket | null = null;

  constructor(config: MageAgentConfig) {
    this.config = {
      timeout: 300000, // 5 minutes default
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
  // MULTI-AGENT LEGAL RESEARCH
  // ========================================================================

  /**
   * Conduct comprehensive legal research using multiple specialized agents
   *
   * This spawns multiple agents:
   * - Research Agent: Find relevant cases and statutes
   * - Coding Agent: Extract legal rules and holdings
   * - Review Agent: Validate citations and reasoning
   * - Synthesis Agent: Generate coherent legal memo
   *
   * Example:
   * ```typescript
   * const result = await client.conductLegalResearch({
   *   task: "Is a non-compete enforceable in California?",
   *   maxAgents: 5,
   *   context: { jurisdiction: "us-ca", focusAreas: ["employment_law"] }
   * });
   * ```
   */
  async conductLegalResearch(task: LegalResearchTask): Promise<TaskResult<LegalMemoResult>> {
    try {
      const response = await this.client.post('/api/orchestrate', {
        task: task.task,
        maxAgents: task.maxAgents || 5,
        timeout: task.timeout || 120000,
        streamProgress: task.streamProgress || false,
        context: {
          ...task.context,
          domain: 'legal',
          taskType: 'legal_research',
        },
      });

      const taskId = response.data.taskId;

      // If streaming, return task ID immediately
      if (task.streamProgress) {
        return {
          taskId,
          status: 'pending',
          progress: 0,
        };
      }

      // Otherwise poll for result
      return await this.pollTaskStatus(taskId);
    } catch (error: any) {
      throw new Error(`Legal research failed: ${error.message}`);
    }
  }

  /**
   * Analyze document with multiple AI perspectives
   *
   * Spawns specialized agents:
   * - Clause Extraction Agent: Identify key clauses
   * - Risk Analysis Agent: Assess legal risks
   * - Compliance Agent: Check regulatory compliance
   * - Redlining Agent: Suggest improvements
   */
  async analyzeDocument(task: DocumentAnalysisTask): Promise<TaskResult<any>> {
    try {
      const response = await this.client.post('/api/orchestrate', {
        task: `Analyze ${task.analysisType} document for jurisdiction ${task.jurisdiction}`,
        maxAgents: 4,
        context: {
          documentId: task.documentId,
          content: task.content,
          analysisType: task.analysisType,
          jurisdiction: task.jurisdiction,
          compareToStandard: task.compareToStandard,
          focusAreas: task.focusAreas,
          domain: 'legal',
          taskType: 'document_analysis',
        },
      });

      return await this.pollTaskStatus(response.data.taskId);
    } catch (error: any) {
      throw new Error(`Document analysis failed: ${error.message}`);
    }
  }

  /**
   * Predictive case outcome analysis using multi-agent ensemble
   *
   * Spawns agents for:
   * - Historical Case Analysis: Find similar cases
   * - Judge Pattern Analysis: Analyze judge's tendencies
   * - Settlement Value Analysis: Calculate likely outcomes
   * - Risk Assessment: Identify litigation risks
   */
  async predictCaseOutcome(task: PredictiveAnalysisTask): Promise<TaskResult<any>> {
    try {
      const response = await this.client.post('/api/orchestrate', {
        task: `Predict outcome for ${task.caseType} case in ${task.jurisdiction}`,
        maxAgents: 5,
        context: {
          facts: task.facts,
          caseType: task.caseType,
          jurisdiction: task.jurisdiction,
          similarCases: task.similarCases,
          judge: task.judge,
          domain: 'legal',
          taskType: 'predictive_analysis',
        },
      });

      return await this.pollTaskStatus(response.data.taskId);
    } catch (error: any) {
      throw new Error(`Predictive analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate legal memo automatically using multi-agent synthesis
   *
   * Uses IRAC (Issue, Rule, Application, Conclusion) framework
   */
  async generateLegalMemo(
    issue: string,
    facts: Record<string, any>,
    jurisdiction: string
  ): Promise<TaskResult<LegalMemoResult>> {
    try {
      const response = await this.client.post('/api/synthesize', {
        sources: [
          `Legal Issue: ${issue}`,
          `Facts: ${JSON.stringify(facts)}`,
          `Jurisdiction: ${jurisdiction}`,
        ],
        format: 'legal_memo',
        objective: 'Generate comprehensive legal memo using IRAC framework',
      });

      return await this.pollTaskStatus(response.data.taskId);
    } catch (error: any) {
      throw new Error(`Memo generation failed: ${error.message}`);
    }
  }

  // ========================================================================
  // ADVANCED LEGAL AI FEATURES
  // ========================================================================

  /**
   * Automated deposition question generation
   *
   * Analyzes case facts and generates strategic deposition questions
   */
  async generateDepositionQuestions(
    caseId: string,
    witnessInfo: any,
    strategy: string
  ): Promise<TaskResult<any>> {
    try {
      const response = await this.client.post('/api/orchestrate', {
        task: `Generate deposition questions for witness based on ${strategy} strategy`,
        maxAgents: 3,
        context: {
          caseId,
          witnessInfo,
          strategy,
          domain: 'legal',
          taskType: 'deposition_prep',
        },
      });

      return await this.pollTaskStatus(response.data.taskId);
    } catch (error: any) {
      throw new Error(`Deposition question generation failed: ${error.message}`);
    }
  }

  /**
   * Automated discovery request generation
   */
  async generateDiscoveryRequests(
    caseId: string,
    discoveryType: 'interrogatories' | 'requests_for_production' | 'requests_for_admission'
  ): Promise<TaskResult<any>> {
    try {
      const response = await this.client.post('/api/orchestrate', {
        task: `Generate ${discoveryType} for case`,
        maxAgents: 2,
        context: {
          caseId,
          discoveryType,
          domain: 'legal',
          taskType: 'discovery_generation',
        },
      });

      return await this.pollTaskStatus(response.data.taskId);
    } catch (error: any) {
      throw new Error(`Discovery generation failed: ${error.message}`);
    }
  }

  /**
   * Cross-jurisdictional conflict analysis
   *
   * Analyzes conflicts of law across multiple jurisdictions
   */
  async analyzeJurisdictionalConflicts(
    facts: Record<string, any>,
    jurisdictions: string[]
  ): Promise<TaskResult<any>> {
    try {
      const response = await this.client.post('/api/orchestrate', {
        task: `Analyze jurisdictional conflicts across ${jurisdictions.join(', ')}`,
        maxAgents: jurisdictions.length + 1, // One agent per jurisdiction + synthesis agent
        context: {
          facts,
          jurisdictions,
          domain: 'legal',
          taskType: 'conflict_analysis',
        },
      });

      return await this.pollTaskStatus(response.data.taskId);
    } catch (error: any) {
      throw new Error(`Conflict analysis failed: ${error.message}`);
    }
  }

  // ========================================================================
  // GEOSPATIAL PREDICTION (MageAgent Geospatial Service)
  // ========================================================================

  /**
   * Legal geospatial predictions (e.g., venue analysis, jurisdiction determination)
   */
  async geospatialPrediction(
    operation: string,
    params: any,
    options?: any
  ): Promise<TaskResult<any>> {
    try {
      const response = await this.client.post('/api/predictions', {
        operation,
        params,
        options,
      });

      if (response.data.status === 'completed') {
        return response.data;
      }

      // Poll for completion if async
      return await this.pollTaskStatus(response.data.jobId);
    } catch (error: any) {
      throw new Error(`Geospatial prediction failed: ${error.message}`);
    }
  }

  // ========================================================================
  // TASK MANAGEMENT
  // ========================================================================

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TaskResult> {
    try {
      const response = await this.client.get(`/api/tasks/${taskId}`);
      return response.data.data.task;
    } catch (error: any) {
      throw new Error(`Failed to get task status: ${error.message}`);
    }
  }

  /**
   * Poll task until completion
   */
  private async pollTaskStatus(
    taskId: string,
    maxAttempts: number = 60,
    intervalMs: number = 3000
  ): Promise<TaskResult> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getTaskStatus(taskId);

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Task failed: ${status.error}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Task ${taskId} timed out after ${maxAttempts * intervalMs}ms`);
  }

  // ========================================================================
  // STREAMING (WebSocket)
  // ========================================================================

  /**
   * Subscribe to task progress via WebSocket
   */
  async subscribeToTask(
    taskId: string,
    onProgress: (data: any) => void,
    onComplete: (data: any) => void,
    onError: (error: any) => void
  ): Promise<void> {
    if (!this.config.graphragUrl) {
      throw new Error('GraphRAG URL required for WebSocket streaming');
    }

    this.wsSocket = io(this.config.graphragUrl);

    this.wsSocket.on('connect', () => {
      console.log('[MageAgent] WebSocket connected');
      this.wsSocket!.emit('subscribe', { room: `task:${taskId}` });
    });

    this.wsSocket.on(`task:${taskId}`, (data: any) => {
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
      console.error('[MageAgent] WebSocket error:', error);
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
   * Check MageAgent service health
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.client.get('/health', { timeout: 5000 });
      const latency = Date.now() - start;

      return { healthy: true, latency };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }
}

// Export for convenience
export default MageAgentClient;

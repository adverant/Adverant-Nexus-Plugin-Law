/**
 * CourtListener Adapter
 *
 * Free, open-source legal database from Free Law Project.
 * Provides access to millions of US federal and state court opinions.
 *
 * API: https://www.courtlistener.com/api/rest-info/
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type {
  LegalDatabaseAdapter,
  AdapterCredentials,
  LegalQuery,
  CaseResult,
  StatuteResult,
  RegulationResult,
  CitationFormat,
  ValidationResult,
  LegalUpdate,
  HealthStatus,
  CostEstimate,
  CitationNetwork,
} from '@nexus-law/types';

interface CourtListenerConfig {
  apiKey?: string; // Optional - free tier available
  endpoint?: string;
  timeout?: number;
}

/**
 * CourtListener adapter implementation
 */
export class CourtListenerAdapter implements LegalDatabaseAdapter {
  // ===== Metadata =====
  public readonly id = 'courtlistener';
  public readonly name = 'CourtListener (Free Law Project)';
  public readonly type = 'open_source' as const;
  public readonly jurisdictions = ['us', 'us-*']; // All US jurisdictions

  private client: AxiosInstance | null = null;
  private config: CourtListenerConfig;
  private connected = false;

  constructor(config: CourtListenerConfig = {}) {
    this.config = {
      endpoint: config.endpoint || 'https://www.courtlistener.com/api/rest/v3/',
      timeout: config.timeout || 30000,
      apiKey: config.apiKey,
    };
  }

  // ===== Connection Management =====

  public async connect(credentials: AdapterCredentials): Promise<void> {
    if (this.connected) {
      return;
    }

    const apiKey = credentials.apiKey || this.config.apiKey || 'free';

    this.client = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey !== 'free' && { 'Authorization': `Token ${apiKey}` }),
      },
    });

    // Configure retries
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status === 429; // Retry on rate limit
      },
    });

    this.connected = true;
    console.log('[CourtListener] Connected successfully');
  }

  public async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
    console.log('[CourtListener] Disconnected');
  }

  public async healthCheck(): Promise<HealthStatus> {
    if (!this.client) {
      return {
        healthy: false,
        error: 'Not connected',
        lastCheck: new Date(),
      };
    }

    try {
      const start = Date.now();
      await this.client.get('', { timeout: 5000 });
      const latency = Date.now() - start;

      return {
        healthy: true,
        latency,
        lastCheck: new Date(),
      };
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message,
        lastCheck: new Date(),
      };
    }
  }

  // ===== Search Operations =====

  public async searchCases(query: LegalQuery): Promise<CaseResult[]> {
    this.ensureConnected();

    try {
      const params: any = {
        q: query.query,
        type: 'o', // Opinions
      };

      // Add date range if specified
      if (query.dateRange) {
        params.filed_after = query.dateRange.start;
        params.filed_before = query.dateRange.end;
      }

      // Add court filter based on jurisdiction
      if (query.jurisdictions.length > 0) {
        params.court = this.mapJurisdictionToCourt(query.jurisdictions[0]);
      }

      // Limit results
      const limit = query.maxResults || 20;
      params.order_by = 'score'; // Relevance

      const response = await this.client!.get('search/', { params: { ...params, page_size: limit } });

      const results: CaseResult[] = response.data.results.map((item: any) =>
        this.normalizeCaseResult(item, query)
      );

      return results;
    } catch (error: any) {
      console.error('[CourtListener] Search failed:', error.message);
      throw new Error(`CourtListener search failed: ${error.message}`);
    }
  }

  public async searchStatutes(query: LegalQuery): Promise<StatuteResult[]> {
    // CourtListener doesn't currently provide statute search
    console.warn('[CourtListener] Statute search not supported');
    return [];
  }

  public async searchRegulations(query: LegalQuery): Promise<RegulationResult[]> {
    // CourtListener doesn't currently provide regulation search
    console.warn('[CourtListener] Regulation search not supported');
    return [];
  }

  // ===== Citation Operations =====

  public async getCitation(id: string, format: CitationFormat): Promise<string> {
    this.ensureConnected();

    try {
      const response = await this.client!.get(`opinions/${id}/`);
      const opinion = response.data;

      // Format citation based on template
      return this.formatCitation(opinion, format);
    } catch (error: any) {
      throw new Error(`Failed to get citation: ${error.message}`);
    }
  }

  public async validateCitation(citation: string): Promise<ValidationResult> {
    // Basic validation - could be enhanced
    const bluebookPattern = /^(\d+)\s+([A-Za-z0-9.\s]+)\s+(\d+)\s+\((.+?)\s+(\d{4})\)$/;
    const match = citation.match(bluebookPattern);

    if (match) {
      return {
        valid: true,
        parsed: {
          volume: match[1],
          reporter: match[2].trim(),
          page: match[3],
          court: match[4],
          year: match[5],
        },
      };
    }

    return {
      valid: false,
      error: 'Citation does not match Bluebook format',
    };
  }

  // ===== Update Operations =====

  public async getUpdates(since: Date): Promise<LegalUpdate[]> {
    this.ensureConnected();

    try {
      const params = {
        date_filed__gte: since.toISOString().split('T')[0],
        order_by: '-date_filed',
        page_size: 100,
      };

      const response = await this.client!.get('search/', { params });

      const updates: LegalUpdate[] = response.data.results.map((item: any) => ({
        type: 'new_case' as const,
        documentId: item.id,
        title: item.caseName || item.case_name,
        date: new Date(item.dateFiled || item.date_filed),
        jurisdiction: 'us', // CourtListener is US-only
        summary: item.snippet || '',
        impact: 'low' as const, // Would need ML model to determine impact
      }));

      return updates;
    } catch (error: any) {
      console.error('[CourtListener] Get updates failed:', error.message);
      return [];
    }
  }

  // ===== Metadata =====

  public getSupportedFeatures(): string[] {
    return [
      'search_cases',
      'citation_formatting',
      'citation_validation',
      'case_updates',
      'full_text_access',
    ];
  }

  public getCostEstimate(operation: string, params?: any): CostEstimate {
    // CourtListener is free!
    return {
      baseCharge: 0.00,
      perResult: 0.00,
      estimatedTotal: 0.00,
      currency: 'USD',
    };
  }

  // ===== Private Helper Methods =====

  private ensureConnected(): void {
    if (!this.client || !this.connected) {
      throw new Error('CourtListener adapter not connected. Call connect() first.');
    }
  }

  private mapJurisdictionToCourt(jurisdiction: string): string {
    // Map jurisdiction codes to CourtListener court IDs
    const mapping: Record<string, string> = {
      'us': 'scotus', // Supreme Court
      'us-ca': 'ca', // California state courts + 9th Circuit
      'us-ny': 'ny', // New York state courts + 2nd Circuit
      'us-tx': 'tex', // Texas state courts + 5th Circuit
      // Add more as needed
    };

    return mapping[jurisdiction] || '';
  }

  private normalizeCaseResult(item: any, query: LegalQuery): CaseResult {
    // Build citation network if requested
    let citationNetwork: CitationNetwork | undefined;
    if (query.includeCitationAnalysis && item.citeCount) {
      citationNetwork = {
        citedByCount: item.citeCount || 0,
        citesCount: item.citation_count || 0,
        treatment: 'followed', // Would need additional API calls to determine
      };
    }

    return {
      id: item.id.toString(),
      type: 'case',
      title: item.caseName || item.case_name || 'Untitled',
      caseName: item.caseName || item.case_name || 'Untitled',
      citation: item.citation?.[0] || this.buildCitation(item),
      jurisdiction: this.extractJurisdiction(item.court || ''),
      relevanceScore: this.calculateRelevanceScore(item, query),
      source: 'courtlistener',
      cost: 0.00,
      courtId: item.court || '',
      courtName: item.court_name || item.court || '',
      decisionDate: item.dateFiled || item.date_filed || '',
      fullText: item.snippet || '',
      summary: item.snippet || '',
      url: item.absolute_url || `https://www.courtlistener.com${item.absolute_url}`,
      citationNetwork,
      metadata: {
        docketNumber: item.docketNumber || item.docket_number,
        status: item.status,
        pageCount: item.page_count,
      },
    };
  }

  private buildCitation(item: any): string {
    // Build a basic citation from available data
    const parts: string[] = [];

    if (item.volume) parts.push(item.volume);
    if (item.reporter) parts.push(item.reporter);
    if (item.page) parts.push(item.page);

    const year = item.dateFiled ? new Date(item.dateFiled).getFullYear() : '';
    if (year) {
      parts.push(`(${item.court || 'Unknown'} ${year})`);
    }

    return parts.length > 0 ? parts.join(' ') : 'Citation unavailable';
  }

  private extractJurisdiction(court: string): string {
    // Extract jurisdiction from court ID
    if (court.includes('scotus')) return 'us';
    if (court.includes('ca')) return 'us-ca';
    if (court.includes('ny')) return 'us-ny';
    if (court.includes('tex')) return 'us-tx';
    // Default to US
    return 'us';
  }

  private calculateRelevanceScore(item: any, query: LegalQuery): number {
    // CourtListener provides a score, normalize to 0-1
    if (item.score !== undefined) {
      // Assuming score is 0-10, normalize
      return Math.min(item.score / 10, 1.0);
    }

    // Fallback: simple keyword matching
    const content = `${item.caseName || ''} ${item.snippet || ''}`.toLowerCase();
    const keywords = query.query.toLowerCase().split(/\s+/);
    const matches = keywords.filter((kw) => content.includes(kw)).length;

    return Math.min(matches / keywords.length, 1.0);
  }

  private formatCitation(opinion: any, format: CitationFormat): string {
    // Use template to format citation
    let citation = format.template;

    const replacements: Record<string, string> = {
      '{volume}': opinion.volume || '',
      '{reporter}': opinion.reporter || '',
      '{page}': opinion.page || '',
      '{court}': opinion.court || '',
      '{year}': opinion.date_filed ? new Date(opinion.date_filed).getFullYear().toString() : '',
    };

    for (const [key, value] of Object.entries(replacements)) {
      citation = citation.replace(key, value);
    }

    return citation;
  }
}

// Export default for dynamic loading
export default CourtListenerAdapter;

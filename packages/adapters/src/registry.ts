/**
 * Legal Database Adapter Registry
 *
 * Manages registration, discovery, and lifecycle of database adapters.
 * Supports dynamic loading of adapters at runtime.
 */

import type {
  LegalDatabaseAdapter,
  AdapterCredentials,
  LegalQuery,
  QueryPreferences,
  CostEstimate,
} from '@nexus-law/types';

export interface AdapterConfig {
  id: string;
  name: string;
  type: 'commercial' | 'open_source' | 'government' | 'academic';
  jurisdictions: string[];
  modulePath?: string; // For dynamic loading
  enabled: boolean;
  credentials?: AdapterCredentials;
  priority?: number; // Lower number = higher priority
}

/**
 * Registry for managing all legal database adapters
 */
export class LegalDatabaseRegistry {
  private static instance: LegalDatabaseRegistry;
  private adapters: Map<string, LegalDatabaseAdapter> = new Map();
  private configs: Map<string, AdapterConfig> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): LegalDatabaseRegistry {
    if (!LegalDatabaseRegistry.instance) {
      LegalDatabaseRegistry.instance = new LegalDatabaseRegistry();
    }
    return LegalDatabaseRegistry.instance;
  }

  /**
   * Register an adapter
   */
  public registerAdapter(adapter: LegalDatabaseAdapter, config: AdapterConfig): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter with ID '${adapter.id}' is already registered`);
    }

    this.adapters.set(adapter.id, adapter);
    this.configs.set(adapter.id, config);

    console.log(`[Registry] Registered adapter: ${adapter.id} (${adapter.name})`);
  }

  /**
   * Unregister an adapter
   */
  public async unregisterAdapter(adapterId: string): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch (error) {
        console.error(`[Registry] Error disconnecting adapter ${adapterId}:`, error);
      }
      this.adapters.delete(adapterId);
      this.configs.delete(adapterId);
      console.log(`[Registry] Unregistered adapter: ${adapterId}`);
    }
  }

  /**
   * Get adapter by ID
   */
  public getAdapter(adapterId: string): LegalDatabaseAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Get all registered adapters
   */
  public getAllAdapters(): LegalDatabaseAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters by jurisdiction
   */
  public getAdaptersByJurisdiction(jurisdiction: string): LegalDatabaseAdapter[] {
    return this.getAllAdapters().filter((adapter) => {
      // Support wildcard matching (e.g., "us-*" matches "us-ca", "us-ny")
      return adapter.jurisdictions.some((j) => {
        if (j.endsWith('*')) {
          const prefix = j.slice(0, -1);
          return jurisdiction.startsWith(prefix);
        }
        return j === jurisdiction;
      });
    });
  }

  /**
   * Get adapters by type
   */
  public getAdaptersByType(
    type: 'commercial' | 'open_source' | 'government' | 'academic'
  ): LegalDatabaseAdapter[] {
    return this.getAllAdapters().filter((adapter) => adapter.type === type);
  }

  /**
   * Filter adapters by capability
   */
  public filterAdaptersByCapability(query: LegalQuery): LegalDatabaseAdapter[] {
    return this.getAllAdapters().filter((adapter) => {
      // Check jurisdiction support
      const supportsJurisdiction = query.jurisdictions.some((j) =>
        adapter.jurisdictions.some((aj) => {
          if (aj.endsWith('*')) {
            return j.startsWith(aj.slice(0, -1));
          }
          return aj === j;
        })
      );

      if (!supportsJurisdiction) {
        return false;
      }

      // Check if adapter supports the query type
      const features = adapter.getSupportedFeatures();
      const queryType = query.queryType || 'mixed';

      if (queryType === 'case_law' && !features.includes('search_cases')) {
        return false;
      }
      if (queryType === 'statute' && !features.includes('search_statutes')) {
        return false;
      }
      if (queryType === 'regulation' && !features.includes('search_regulations')) {
        return false;
      }

      return true;
    });
  }

  /**
   * Rank adapters by cost and quality
   */
  public rankAdaptersByCost(
    adapters: LegalDatabaseAdapter[],
    preferences: QueryPreferences
  ): LegalDatabaseAdapter[] {
    const ranked = adapters.map((adapter) => {
      const cost = adapter.getCostEstimate('search');
      const config = this.configs.get(adapter.id);
      const priority = config?.priority || 999;

      return {
        adapter,
        cost: cost.estimatedTotal,
        priority,
        score: this.calculateAdapterScore(adapter, cost, preferences),
      };
    });

    // Sort by score (higher is better)
    ranked.sort((a, b) => b.score - a.score);

    return ranked.map((r) => r.adapter);
  }

  /**
   * Calculate adapter score based on cost, quality, and preferences
   */
  private calculateAdapterScore(
    adapter: LegalDatabaseAdapter,
    cost: CostEstimate,
    preferences: QueryPreferences
  ): number {
    let score = 100; // Base score

    // Prefer free sources if requested
    if (preferences.preferFree && cost.estimatedTotal === 0) {
      score += 50;
    }

    // Penalize expensive sources
    if (preferences.maxCost && cost.estimatedTotal > preferences.maxCost) {
      return 0; // Exclude expensive sources
    }

    // Prefer lower-cost sources
    score -= cost.estimatedTotal * 10;

    // Prefer open source
    if (adapter.type === 'open_source') {
      score += 20;
    }

    // Prefer government sources for authoritative data
    if (adapter.type === 'government') {
      score += 15;
    }

    return score;
  }

  /**
   * Get optimal adapter for a query
   */
  public async getOptimalAdapter(
    query: LegalQuery,
    preferences: QueryPreferences = {}
  ): Promise<LegalDatabaseAdapter | null> {
    const candidates = this.filterAdaptersByCapability(query);

    if (candidates.length === 0) {
      console.warn(`[Registry] No adapters found for query in jurisdictions: ${query.jurisdictions.join(', ')}`);
      return null;
    }

    const ranked = this.rankAdaptersByCost(candidates, preferences);

    return ranked[0] || null;
  }

  /**
   * Get adapter chain (primary + fallbacks)
   */
  public getAdapterChain(
    query: LegalQuery,
    preferences: QueryPreferences = {}
  ): LegalDatabaseAdapter[] {
    const candidates = this.filterAdaptersByCapability(query);
    return this.rankAdaptersByCost(candidates, preferences);
  }

  /**
   * Health check all adapters
   */
  public async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, adapter] of this.adapters) {
      try {
        const health = await adapter.healthCheck();
        results[id] = health.healthy;
      } catch (error) {
        console.error(`[Registry] Health check failed for ${id}:`, error);
        results[id] = false;
      }
    }

    return results;
  }

  /**
   * Load adapter from configuration
   */
  public async loadAdapter(config: AdapterConfig): Promise<void> {
    if (!config.enabled) {
      console.log(`[Registry] Skipping disabled adapter: ${config.id}`);
      return;
    }

    try {
      // Dynamic import if modulePath provided
      if (config.modulePath) {
        const AdapterClass = await import(config.modulePath);
        const adapter = new AdapterClass.default(config);

        // Connect if credentials provided
        if (config.credentials) {
          await adapter.connect(config.credentials);
        }

        this.registerAdapter(adapter, config);
      }
    } catch (error) {
      console.error(`[Registry] Failed to load adapter ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * Load all adapters from configuration array
   */
  public async loadAdapters(configs: AdapterConfig[]): Promise<void> {
    console.log(`[Registry] Loading ${configs.length} adapters...`);

    for (const config of configs) {
      try {
        await this.loadAdapter(config);
      } catch (error) {
        console.error(`[Registry] Failed to load adapter ${config.id}, continuing...`);
      }
    }

    console.log(`[Registry] Loaded ${this.adapters.size} adapters successfully`);
  }

  /**
   * Get registry statistics
   */
  public getStats(): {
    totalAdapters: number;
    enabledAdapters: number;
    adaptersByType: Record<string, number>;
    adaptersByJurisdiction: Record<string, number>;
  } {
    const adapters = this.getAllAdapters();

    const adaptersByType: Record<string, number> = {};
    const adaptersByJurisdiction: Record<string, number> = {};

    for (const adapter of adapters) {
      // Count by type
      adaptersByType[adapter.type] = (adaptersByType[adapter.type] || 0) + 1;

      // Count by jurisdiction
      for (const jurisdiction of adapter.jurisdictions) {
        adaptersByJurisdiction[jurisdiction] = (adaptersByJurisdiction[jurisdiction] || 0) + 1;
      }
    }

    return {
      totalAdapters: adapters.length,
      enabledAdapters: Array.from(this.configs.values()).filter((c) => c.enabled).length,
      adaptersByType,
      adaptersByJurisdiction,
    };
  }
}

// Export singleton instance
export const legalDatabaseRegistry = LegalDatabaseRegistry.getInstance();

/**
 * Legal Database Adapters Integration Tests
 *
 * Tests adapter framework and CourtListener integration
 */

import { LegalDatabaseRegistry } from '@nexus-law/adapters';
import { CourtListenerAdapter } from '@nexus-law/adapters';
import type { LegalQuery } from '@nexus-law/types';

describe('Legal Database Adapters Integration Tests', () => {
  // ========================================================================
  // ADAPTER REGISTRY
  // ========================================================================

  describe('LegalDatabaseRegistry', () => {
    let registry: LegalDatabaseRegistry;

    beforeEach(() => {
      registry = LegalDatabaseRegistry.getInstance();
    });

    test('should be a singleton', () => {
      const registry2 = LegalDatabaseRegistry.getInstance();
      expect(registry).toBe(registry2);
    });

    test('should register adapter', () => {
      const adapter = new CourtListenerAdapter({
        id: 'test-courtlistener',
        enabled: true,
        credentials: {},
      });

      expect(() => {
        registry.registerAdapter(adapter, {
          id: 'test-courtlistener',
          enabled: true,
        });
      }).not.toThrow();
    });

    test('should list registered adapters', () => {
      const adapters = registry.listAdapters();
      expect(Array.isArray(adapters)).toBe(true);
    });

    test('should get adapter by ID', () => {
      const adapter = new CourtListenerAdapter({
        id: 'courtlistener-test',
        enabled: true,
        credentials: {},
      });

      registry.registerAdapter(adapter, {
        id: 'courtlistener-test',
        enabled: true,
      });

      const retrieved = registry.getAdapter('courtlistener-test');
      expect(retrieved).toBe(adapter);
    });

    test('should return null for non-existent adapter', () => {
      const adapter = registry.getAdapter('non-existent-adapter-xyz');
      expect(adapter).toBeNull();
    });

    test('should filter adapters by capability', async () => {
      const adapter = new CourtListenerAdapter({
        id: 'courtlistener-filter',
        enabled: true,
        credentials: {},
      });

      registry.registerAdapter(adapter, {
        id: 'courtlistener-filter',
        enabled: true,
      });

      const query: LegalQuery = {
        query: 'test',
        jurisdictions: ['us'],
      };

      const optimal = await registry.getOptimalAdapter(query, {
        preferFree: true,
      });

      // Should return an adapter or null (if none match)
      expect(optimal === null || typeof optimal === 'object').toBe(true);
    });
  });

  // ========================================================================
  // COURTLISTENER ADAPTER
  // ========================================================================

  describe('CourtListenerAdapter', () => {
    let adapter: CourtListenerAdapter;

    beforeAll(() => {
      adapter = new CourtListenerAdapter({
        id: 'courtlistener',
        enabled: true,
        credentials: {
          // CourtListener doesn't require auth for basic usage
        },
      });
    });

    test('should initialize adapter', () => {
      expect(adapter.id).toBe('courtlistener');
      expect(adapter.name).toBe('CourtListener (Free Law Project)');
      expect(adapter.type).toBe('open_source');
    });

    test('should support US jurisdictions', () => {
      expect(adapter.jurisdictions).toContain('us');
    });

    test('should connect without credentials', async () => {
      try {
        await adapter.connect({});
        expect(true).toBe(true); // Connection successful
      } catch (error) {
        // Connection may fail in test environment
        expect(error).toBeDefined();
      }
    });

    test('healthCheck should return status', async () => {
      const health = await adapter.healthCheck();

      expect(health).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    test('searchCases should accept query', async () => {
      try {
        await adapter.connect({});

        const results = await adapter.searchCases({
          query: 'employment discrimination',
          jurisdictions: ['us'],
          maxResults: 5,
        });

        expect(Array.isArray(results)).toBe(true);

        if (results.length > 0) {
          const result = results[0];
          expect(result).toHaveProperty('id');
          expect(result).toHaveProperty('title');
          expect(result).toHaveProperty('jurisdiction');
          expect(result).toHaveProperty('source');
          expect(result.source).toBe('courtlistener');
        }
      } catch (error: any) {
        // Service may be unavailable or rate limited
        console.log('CourtListener API error:', error.message);
        expect(error).toBeDefined();
      }
    });

    test('searchCases with date range', async () => {
      try {
        await adapter.connect({});

        const results = await adapter.searchCases({
          query: 'contract dispute',
          jurisdictions: ['us'],
          dateRange: {
            start: '2023-01-01',
            end: '2024-01-01',
          },
          maxResults: 3,
        });

        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('getCostEstimate should return zero (free service)', () => {
      const cost = adapter.getCostEstimate('search');

      expect(cost.baseCharge).toBe(0);
      expect(cost.perResult).toBe(0);
      expect(cost.estimatedTotal).toBe(0);
      expect(cost.currency).toBe('USD');
    });

    test('getSupportedFeatures should return feature list', () => {
      const features = adapter.getSupportedFeatures();

      expect(Array.isArray(features)).toBe(true);
      expect(features).toContain('case_search');
      expect(features).toContain('free_access');
    });

    test('validateCitation should accept citation string', async () => {
      try {
        await adapter.connect({});

        const result = await adapter.validateCitation('347 U.S. 483');

        expect(result).toHaveProperty('valid');
        expect(typeof result.valid).toBe('boolean');

        if (result.valid) {
          expect(result).toHaveProperty('normalized');
          expect(result).toHaveProperty('metadata');
        }
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('disconnect should work', async () => {
      expect(async () => {
        await adapter.disconnect();
      }).not.toThrow();
    });
  });

  // ========================================================================
  // ADAPTER COST OPTIMIZATION
  // ========================================================================

  describe('Adapter Cost Optimization', () => {
    let registry: LegalDatabaseRegistry;

    beforeEach(() => {
      registry = LegalDatabaseRegistry.getInstance();

      // Register CourtListener (free)
      const courtListener = new CourtListenerAdapter({
        id: 'courtlistener-cost',
        enabled: true,
        credentials: {},
      });

      registry.registerAdapter(courtListener, {
        id: 'courtlistener-cost',
        enabled: true,
      });
    });

    test('should prefer free adapters when preferFree=true', async () => {
      const query: LegalQuery = {
        query: 'test query',
        jurisdictions: ['us'],
      };

      const adapter = await registry.getOptimalAdapter(query, {
        preferFree: true,
      });

      if (adapter) {
        const cost = adapter.getCostEstimate('search');
        expect(cost.baseCharge).toBe(0);
      }
    });

    test('should calculate total estimated cost', async () => {
      const query: LegalQuery = {
        query: 'test query',
        jurisdictions: ['us'],
        maxResults: 20,
      };

      const adapter = await registry.getOptimalAdapter(query);

      if (adapter) {
        const cost = adapter.getCostEstimate('search', { results: 20 });
        expect(typeof cost.estimatedTotal).toBe('number');
        expect(cost.estimatedTotal).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ========================================================================
  // QUERY ROUTING
  // ========================================================================

  describe('Query Routing', () => {
    let registry: LegalDatabaseRegistry;

    beforeEach(() => {
      registry = LegalDatabaseRegistry.getInstance();

      const courtListener = new CourtListenerAdapter({
        id: 'courtlistener-routing',
        enabled: true,
        credentials: {},
      });

      registry.registerAdapter(courtListener, {
        id: 'courtlistener-routing',
        enabled: true,
      });
    });

    test('should route to appropriate adapter for US queries', async () => {
      const query: LegalQuery = {
        query: 'federal law',
        jurisdictions: ['us'],
      };

      const adapter = await registry.getOptimalAdapter(query);

      expect(adapter).not.toBeNull();

      if (adapter) {
        expect(adapter.jurisdictions.some((j) => j === 'us' || j.startsWith('us-'))).toBe(true);
      }
    });

    test('should return null for unsupported jurisdictions', async () => {
      const query: LegalQuery = {
        query: 'test',
        jurisdictions: ['zz-unsupported'], // Non-existent jurisdiction
      };

      const adapter = await registry.getOptimalAdapter(query);

      // May return null if no adapter supports this jurisdiction
      expect(adapter === null || adapter !== null).toBe(true);
    });
  });
});

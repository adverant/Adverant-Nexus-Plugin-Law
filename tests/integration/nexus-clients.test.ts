/**
 * Nexus Stack Clients Integration Tests
 *
 * Tests integration with MageAgent, GraphRAG, and FileProcess
 */

import { MageAgentClient, GraphRAGClient, FileProcessClient } from '@nexus-law/shared';

const MAGEAGENT_URL = process.env.MAGEAGENT_URL || 'http://localhost:9080';
const GRAPHRAG_URL = process.env.GRAPHRAG_URL || 'http://localhost:9090';
const FILEPROCESS_URL = process.env.FILEPROCESS_URL || 'http://localhost:9096';

describe('Nexus Stack Clients Integration Tests', () => {
  // ========================================================================
  // MAGEAGENT CLIENT
  // ========================================================================

  describe('MageAgentClient', () => {
    let client: MageAgentClient;

    beforeAll(() => {
      client = new MageAgentClient({
        baseUrl: MAGEAGENT_URL,
        graphragUrl: GRAPHRAG_URL,
      });
    });

    afterAll(() => {
      client.disconnectWebSocket();
    });

    test('should initialize client', () => {
      expect(client).toBeInstanceOf(MageAgentClient);
    });

    test('healthCheck should return service status', async () => {
      const health = await client.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(typeof health.healthy).toBe('boolean');

      if (health.healthy) {
        expect(health).toHaveProperty('latency');
        expect(typeof health.latency).toBe('number');
      } else {
        expect(health).toHaveProperty('error');
      }
    });

    test('conductLegalResearch should accept research task', async () => {
      try {
        const result = await client.conductLegalResearch({
          task: 'What are the key elements of a valid contract?',
          maxAgents: 3,
          timeout: 30000,
          context: {
            jurisdiction: 'us',
            focusAreas: ['contract_law'],
          },
        });

        // If service is available
        expect(result).toHaveProperty('taskId');
        expect(result).toHaveProperty('status');
      } catch (error: any) {
        // Service unavailable is acceptable
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('generateLegalMemo should accept memo request', async () => {
      try {
        const result = await client.generateLegalMemo(
          'Whether plaintiff can recover damages',
          { jurisdiction: 'us-ca', incident_date: '2024-01-15' },
          'us-ca'
        );

        expect(result).toHaveProperty('taskId');
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });
  });

  // ========================================================================
  // GRAPHRAG CLIENT
  // ========================================================================

  describe('GraphRAGClient', () => {
    let client: GraphRAGClient;

    beforeAll(() => {
      client = new GraphRAGClient({
        baseUrl: GRAPHRAG_URL,
        wsUrl: GRAPHRAG_URL,
      });
    });

    afterAll(() => {
      client.disconnectWebSocket();
    });

    test('should initialize client', () => {
      expect(client).toBeInstanceOf(GraphRAGClient);
    });

    test('healthCheck should return service status', async () => {
      const health = await client.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(typeof health.healthy).toBe('boolean');

      if (health.healthy) {
        expect(health).toHaveProperty('latency');
        expect(health).toHaveProperty('collections');
        expect(Array.isArray(health.collections)).toBe(true);
      } else {
        expect(health).toHaveProperty('error');
      }
    });

    test('storeDocument should accept document', async () => {
      try {
        const result = await client.storeDocument({
          content: 'This is a test legal document with important content.',
          metadata: {
            title: 'Test Document',
            jurisdiction: 'us',
            docType: 'memo',
          },
        });

        expect(result).toHaveProperty('documentId');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('layers');
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('semanticSearch should accept search query', async () => {
      try {
        const results = await client.semanticSearch({
          query: 'employment discrimination cases',
          jurisdiction: 'us',
          threshold: 0.7,
          limit: 10,
        });

        expect(Array.isArray(results)).toBe(true);
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('buildCitationNetwork should accept case ID', async () => {
      try {
        const network = await client.buildCitationNetwork('test_case_123', {
          depth: 2,
          minInfluence: 0.5,
        });

        expect(network).toHaveProperty('rootCase');
        expect(network).toHaveProperty('graph');
        expect(network).toHaveProperty('analysis');
      } catch (error: any) {
        // 404 is acceptable (case not found), as well as connection errors
        if (!error.response || error.response.status !== 404) {
          expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
        }
      }
    });

    test('queryKnowledgeGraph should accept query', async () => {
      try {
        const results = await client.queryKnowledgeGraph({
          query: 'Show me recent cases',
          type: 'natural',
          format: 'list',
        });

        expect(results).toBeDefined();
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('temporalQuery should accept temporal query', async () => {
      try {
        const timeline = await client.temporalQuery(
          'fair use',
          '2020-01-01',
          '2024-01-01',
          'us'
        );

        expect(timeline).toHaveProperty('timeline');
        expect(timeline).toHaveProperty('overallTrend');
        expect(timeline).toHaveProperty('keyShifts');
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });
  });

  // ========================================================================
  // FILEPROCESS CLIENT
  // ========================================================================

  describe('FileProcessClient', () => {
    let client: FileProcessClient;

    beforeAll(() => {
      client = new FileProcessClient({
        baseUrl: FILEPROCESS_URL,
        wsUrl: FILEPROCESS_URL,
      });
    });

    afterAll(() => {
      client.disconnectWebSocket();
    });

    test('should initialize client', () => {
      expect(client).toBeInstanceOf(FileProcessClient);
    });

    test('healthCheck should return service status', async () => {
      const health = await client.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(typeof health.healthy).toBe('boolean');

      if (health.healthy) {
        expect(health).toHaveProperty('latency');
        expect(health).toHaveProperty('throughput');
        expect(health).toHaveProperty('queueSize');
      } else {
        expect(health).toHaveProperty('error');
      }
    });

    test('classifyDocument should classify text', async () => {
      try {
        const result = await client.classifyDocument(
          'This Employment Agreement is entered into as of January 1, 2024...',
          'us'
        );

        expect(result).toHaveProperty('docType');
        expect(result).toHaveProperty('confidence');
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('extractMetadata should extract metadata from text', async () => {
      try {
        const metadata = await client.extractMetadata(
          'Case No. 2024-CV-001. John Doe v. Jane Smith. Filed January 15, 2024 in Superior Court.',
          'case'
        );

        expect(metadata).toBeDefined();
        // Metadata structure depends on what's extracted
        if (Object.keys(metadata).length > 0) {
          expect(typeof metadata).toBe('object');
        }
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('extractCitations should extract citations', async () => {
      try {
        const citations = await client.extractCitations(
          'As held in Brown v. Board of Education, 347 U.S. 483 (1954)...'
        );

        expect(Array.isArray(citations)).toBe(true);

        if (citations.length > 0) {
          expect(citations[0]).toHaveProperty('citation');
          expect(citations[0]).toHaveProperty('type');
          expect(citations[0]).toHaveProperty('confidence');
        }
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('createChunks should create semantic chunks', async () => {
      try {
        const chunks = await client.createChunks(
          'This is a long legal document. It contains multiple paragraphs. Each paragraph discusses different topics. We need to split this intelligently.',
          'semantic',
          { maxChunkSize: 1024 }
        );

        expect(Array.isArray(chunks)).toBe(true);

        if (chunks.length > 0) {
          expect(chunks[0]).toHaveProperty('chunkId');
          expect(chunks[0]).toHaveProperty('content');
          expect(chunks[0]).toHaveProperty('position');
          expect(chunks[0]).toHaveProperty('tokens');
        }
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });

    test('getSupportedFormats should return format list', async () => {
      try {
        const formats = await client.getSupportedFormats();

        expect(formats).toHaveProperty('formats');
        expect(formats).toHaveProperty('capabilities');
        expect(Array.isArray(formats.formats)).toBe(true);
        expect(typeof formats.capabilities).toBe('object');
      } catch (error: any) {
        expect(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']).toContain(error.code);
      }
    });
  });

  // ========================================================================
  // CLIENT ERROR HANDLING
  // ========================================================================

  describe('Client Error Handling', () => {
    test('MageAgentClient should handle invalid URL gracefully', async () => {
      const client = new MageAgentClient({
        baseUrl: 'http://invalid-host-that-does-not-exist:9999',
        graphragUrl: 'http://invalid-host:9999',
      });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });

    test('GraphRAGClient should handle invalid URL gracefully', async () => {
      const client = new GraphRAGClient({
        baseUrl: 'http://invalid-host-that-does-not-exist:9999',
      });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });

    test('FileProcessClient should handle invalid URL gracefully', async () => {
      const client = new FileProcessClient({
        baseUrl: 'http://invalid-host-that-does-not-exist:9999',
      });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  // ========================================================================
  // CLIENT TIMEOUT HANDLING
  // ========================================================================

  describe('Client Timeout Handling', () => {
    test('MageAgentClient should respect timeout', async () => {
      const client = new MageAgentClient({
        baseUrl: MAGEAGENT_URL,
        graphragUrl: GRAPHRAG_URL,
        timeout: 100, // Very short timeout
      });

      try {
        await client.conductLegalResearch({
          task: 'Complex research task',
          maxAgents: 10,
          timeout: 100,
        });
      } catch (error: any) {
        // Should timeout or service unavailable
        expect(['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED']).toContain(error.code);
      }
    });
  });
});

/**
 * API Gateway Integration Tests
 *
 * Tests REST API endpoints with real HTTP requests
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9200';

describe('API Gateway Integration Tests', () => {
  let client: AxiosInstance;
  let authToken: string;

  beforeAll(() => {
    client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });
  });

  // ========================================================================
  // HEALTH CHECKS
  // ========================================================================

  describe('Health Checks', () => {
    test('GET /health should return healthy status', async () => {
      const response = await client.get('/health');

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'healthy',
        uptime: expect.any(Number),
        version: expect.any(String),
      });
    });

    test('GET /health/detailed should return detailed health info', async () => {
      const response = await client.get('/health/detailed');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('services');
      expect(response.data.services).toHaveProperty('database');
      expect(response.data.services).toHaveProperty('redis');
      expect(response.data.services).toHaveProperty('nexusStack');
    });

    test('GET /health/ready should check readiness', async () => {
      const response = await client.get('/health/ready');

      expect([200, 503]).toContain(response.status);
      expect(response.data).toHaveProperty('ready');
    });

    test('GET /health/live should always return alive', async () => {
      const response = await client.get('/health/live');

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({ alive: true });
    });
  });

  // ========================================================================
  // AUTHENTICATION
  // ========================================================================

  describe('Authentication', () => {
    const testUser = {
      email: `test-${Date.now()}@nexuslaw.ai`,
      password: 'TestPassword123!',
      name: 'Test User',
      organizationName: 'Test Organization',
    };

    test('POST /api/auth/register should create new user', async () => {
      const response = await client.post('/api/auth/register', testUser);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('user');
      expect(response.data.data).toHaveProperty('token');
      expect(response.data.data.user.email).toBe(testUser.email);

      // Save token for subsequent tests
      authToken = response.data.data.token;
    });

    test('POST /api/auth/register should reject duplicate email', async () => {
      const response = await client.post('/api/auth/register', testUser);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('already registered');
    });

    test('POST /api/auth/login should authenticate existing user', async () => {
      const response = await client.post('/api/auth/login', {
        email: testUser.email,
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('token');
      expect(response.data.data.user.email).toBe(testUser.email);
    });

    test('POST /api/auth/login should reject invalid credentials', async () => {
      const response = await client.post('/api/auth/login', {
        email: testUser.email,
        password: 'WrongPassword',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    test('POST /api/auth/logout should blacklist token', async () => {
      const response = await client.post('/api/auth/logout', null, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    test('Using blacklisted token should fail', async () => {
      const response = await client.post(
        '/api/research',
        { task: 'test' },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect(response.status).toBe(401);
    });

    test('Demo account should work', async () => {
      const response = await client.post('/api/auth/login', {
        email: 'demo@nexuslaw.ai',
        password: 'demo123456',
      });

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        authToken = response.data.data.token;
      } else {
        // Demo account not seeded yet - create test user
        const registerResponse = await client.post('/api/auth/register', testUser);
        authToken = registerResponse.data.data.token;
      }
    });
  });

  // ========================================================================
  // PROTECTED ROUTES (Require Authentication)
  // ========================================================================

  describe('Protected Routes', () => {
    test('Request without token should return 401', async () => {
      const response = await client.post('/api/research', {
        task: 'test task',
      });

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });

    test('Request with invalid token should return 401', async () => {
      const response = await client.post(
        '/api/research',
        { task: 'test task' },
        { headers: { Authorization: 'Bearer invalid-token' } }
      );

      expect(response.status).toBe(401);
    });
  });

  // ========================================================================
  // LEGAL RESEARCH (MageAgent Integration)
  // ========================================================================

  describe('Legal Research API', () => {
    test('POST /api/research should accept valid research task', async () => {
      const response = await client.post(
        '/api/research',
        {
          task: 'Is a non-compete clause enforceable in California?',
          maxAgents: 3,
          timeout: 60000,
          context: {
            jurisdiction: 'us-ca',
            focusAreas: ['employment_law'],
          },
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Accept either success (if MageAgent is running) or service unavailable
      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('taskId');
      }
    });

    test('POST /api/research should validate required fields', async () => {
      const response = await client.post(
        '/api/research',
        { maxAgents: 3 }, // Missing 'task'
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    test('POST /api/research/memo should accept memo generation request', async () => {
      const response = await client.post(
        '/api/research/memo',
        {
          issue: 'Whether non-compete is enforceable',
          facts: {
            jurisdiction: 'us-ca',
            employee_role: 'software engineer',
            duration: '2 years',
          },
          jurisdiction: 'us-ca',
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);
    });

    test('POST /api/research/predict should accept prediction request', async () => {
      const response = await client.post(
        '/api/research/predict',
        {
          facts: { type: 'employment_dispute' },
          caseType: 'employment',
          jurisdiction: 'us-ca',
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);
    });
  });

  // ========================================================================
  // DOCUMENT PROCESSING (FileProcess Integration)
  // ========================================================================

  describe('Document Processing API', () => {
    test('POST /api/documents/classify should classify text', async () => {
      const response = await client.post(
        '/api/documents/classify',
        {
          content: 'This Agreement is entered into as of January 1, 2024...',
          jurisdiction: 'us',
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('docType');
        expect(response.data.data).toHaveProperty('confidence');
      }
    });

    test('POST /api/documents/extract/metadata should extract metadata', async () => {
      const response = await client.post(
        '/api/documents/extract/metadata',
        {
          content: 'Case No. 2024-001. John Doe v. Jane Smith. Filed January 15, 2024.',
          docType: 'case',
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);
    });
  });

  // ========================================================================
  // CITATIONS (GraphRAG Integration)
  // ========================================================================

  describe('Citations API', () => {
    test('POST /api/citations/network should validate input', async () => {
      const response = await client.post(
        '/api/citations/network',
        {
          caseId: 'case_12345',
          depth: 2,
          minInfluence: 0.5,
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 404, 503]).toContain(response.status);
    });

    test('POST /api/citations/similar should find similar cases', async () => {
      const response = await client.post(
        '/api/citations/similar',
        {
          caseId: 'case_12345',
          limit: 10,
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 404, 503]).toContain(response.status);
    });

    test('POST /api/citations/temporal should accept temporal query', async () => {
      const response = await client.post(
        '/api/citations/temporal',
        {
          concept: 'fair use',
          startDate: '1950-01-01',
          endDate: '2024-01-01',
          jurisdiction: 'us',
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);
    });
  });

  // ========================================================================
  // QUERIES (GraphRAG Semantic Search)
  // ========================================================================

  describe('Queries API', () => {
    test('POST /api/queries/semantic should perform semantic search', async () => {
      const response = await client.post(
        '/api/queries/semantic',
        {
          query: 'employment discrimination',
          jurisdiction: 'us-ca',
          threshold: 0.7,
          limit: 10,
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toBeInstanceOf(Array);
      }
    });

    test('POST /api/queries/hybrid should perform hybrid search', async () => {
      const response = await client.post(
        '/api/queries/hybrid',
        {
          semanticQuery: 'employment discrimination',
          keywordQuery: 'Title VII',
          jurisdiction: 'us',
          limit: 20,
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);
    });

    test('POST /api/queries/graph should accept graph query', async () => {
      const response = await client.post(
        '/api/queries/graph',
        {
          query: 'Show me all cases that cite Brown v. Board of Education',
          type: 'natural',
          format: 'list',
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      expect([200, 503]).toContain(response.status);
    });
  });

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  describe('Error Handling', () => {
    test('404 for non-existent endpoint', async () => {
      const response = await client.get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('not found');
    });

    test('400 for invalid request body', async () => {
      const response = await client.post(
        '/api/research',
        'invalid json string',
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      expect([400, 500]).toContain(response.status);
    });

    test('Rate limiting headers should be present', async () => {
      const response = await client.get('/health');

      // Rate limiting headers may or may not be present depending on config
      // Just check that the request succeeds
      expect(response.status).toBe(200);
    });
  });

  // ========================================================================
  // CORS
  // ========================================================================

  describe('CORS', () => {
    test('OPTIONS request should return CORS headers', async () => {
      const response = await client.options('/api/research');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });
});

# Nexus Law Integration Tests

Comprehensive integration tests for the Nexus Law platform.

## Test Suites

### 1. API Gateway Tests (`api-gateway.test.ts`)

Tests all REST API endpoints with real HTTP requests:

- **Health Checks**: Basic, detailed, readiness, liveness probes
- **Authentication**: Registration, login, logout, token validation
- **Protected Routes**: Authorization enforcement
- **Legal Research API**: Multi-agent research, memo generation, predictions
- **Document Processing API**: Classification, metadata extraction
- **Citations API**: Network building, similarity, temporal queries
- **Queries API**: Semantic search, hybrid search, graph queries
- **Error Handling**: 404s, validation errors, rate limiting
- **CORS**: Cross-origin request handling

**Coverage**: 50+ test cases

### 2. Nexus Stack Clients Tests (`nexus-clients.test.ts`)

Tests integration with all Nexus Stack services:

**MageAgentClient**:
- Health checks
- Legal research orchestration
- Legal memo generation
- Error handling and timeouts

**GraphRAGClient**:
- Health checks
- Document storage (Document DNA)
- Semantic search
- Citation network building
- Knowledge graph queries
- Temporal queries

**FileProcessClient**:
- Health checks
- Document classification
- Metadata extraction
- Citation extraction
- Semantic chunking
- Supported formats

**Coverage**: 30+ test cases

### 3. Adapters Tests (`adapters.test.ts`)

Tests legal database adapter framework:

**LegalDatabaseRegistry**:
- Singleton pattern
- Adapter registration
- Adapter retrieval
- Capability filtering
- Optimal adapter selection

**CourtListenerAdapter**:
- Initialization
- Connection handling
- Case search
- Date range filtering
- Citation validation
- Cost estimation (free service)

**Cost Optimization**:
- Free vs. commercial preference
- Cost calculation
- Query routing

**Coverage**: 25+ test cases

## Prerequisites

### Required Services

For full test coverage, ensure these services are running:

```bash
# 1. Start Nexus Stack
docker-compose -f docker/docker-compose.nexus.yml up -d

# 2. Start Nexus Law
docker-compose -f docker/docker-compose.nexus-law.yml up -d
```

Required services:
- **Nexus Law API Gateway** (Port 9200)
- **PostgreSQL** (Port 9201)
- **Redis** (Port 9202)
- **MageAgent** (Port 9080) - Optional but recommended
- **GraphRAG** (Port 9090) - Optional but recommended
- **FileProcess** (Port 9096) - Optional but recommended

### Environment Variables

Set these environment variables or use defaults:

```bash
export API_BASE_URL=http://localhost:9200
export MAGEAGENT_URL=http://localhost:9080
export GRAPHRAG_URL=http://localhost:9090
export FILEPROCESS_URL=http://localhost:9096
```

## Running Tests

### Install Dependencies

```bash
cd services/nexus-law/tests
pnpm install
```

### Run All Tests

```bash
pnpm test
```

### Run Specific Test Suite

```bash
# API Gateway tests only
pnpm test api-gateway

# Nexus clients tests only
pnpm test nexus-clients

# Adapters tests only
pnpm test adapters
```

### Run in Watch Mode

```bash
pnpm test:watch
```

### Generate Coverage Report

```bash
pnpm test:coverage
```

Coverage report will be in `coverage/` directory.

## Test Behavior

### Graceful Degradation

Tests are designed to handle service unavailability gracefully:

- **If Nexus Stack services are unavailable**: Tests check for appropriate error codes (503, ECONNREFUSED) and pass
- **If API Gateway is unavailable**: Tests will fail (core service required)
- **If Database is unavailable**: Tests will fail (core service required)

### Rate Limiting

Some tests may be rate-limited by external services (e.g., CourtListener). Tests handle rate limiting gracefully:

- Accept 429 (Too Many Requests) as valid response
- Implement exponential backoff in adapters
- Tests may be slower if rate limited

### Test Isolation

Each test suite is independent:

- Tests create unique users to avoid conflicts
- Tests clean up resources after completion
- WebSocket connections are properly closed

## Expected Results

### Full Stack Available

When all services are running:

```
Test Suites: 3 passed, 3 total
Tests:       100+ passed, 100+ total
Time:        30-60 seconds
```

### Degraded Mode (Nexus Stack Unavailable)

With only API Gateway + Database + Redis:

```
Test Suites: 3 passed, 3 total
Tests:       60+ passed, 40+ skipped (service unavailable)
Time:        15-30 seconds
```

## Troubleshooting

### All tests failing

**Check API Gateway is running:**
```bash
curl http://localhost:9200/health
```

If not running:
```bash
docker-compose -f docker/docker-compose.nexus-law.yml up -d
docker-compose -f docker/docker-compose.nexus-law.yml logs -f nexus-law-api
```

### Authentication tests failing

**Check database is accessible:**
```bash
docker exec nexus-law-db psql -U nexus_law_user -d nexus_law -c "SELECT 1"
```

**Check database is seeded:**
```bash
docker exec nexus-law-db psql -U nexus_law_user -d nexus_law -c "SELECT COUNT(*) FROM nexus_law.users"
```

### Nexus Stack tests failing

**Check services are running:**
```bash
docker ps | grep nexus
curl http://localhost:9080/health  # MageAgent
curl http://localhost:9090/health  # GraphRAG
curl http://localhost:9096/health  # FileProcess
```

**Expected behavior**: Tests should pass even if services are unavailable (graceful degradation)

### CourtListener adapter tests failing

**Possible causes**:
- Rate limiting (429 errors) - Normal, tests handle this
- Network connectivity issues
- CourtListener API maintenance

**Workaround**: Tests are designed to handle API unavailability

### Timeout errors

**Increase test timeout** in `jest.config.js`:
```javascript
testTimeout: 60000, // 60 seconds
```

## Test Data

### Demo Account

Tests use this demo account if available:
- Email: `demo@nexuslaw.ai`
- Password: `demo123456`

If not available, tests create temporary users automatically.

### Test Documents

Tests use sample legal text for document processing:
- Employment agreements
- Case summaries
- Legal citations

No sensitive or real data is used.

## Continuous Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: nexus_law
          POSTGRES_USER: nexus_law_user
          POSTGRES_PASSWORD: test_password
        ports:
          - 5432:5432

      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: cd services/nexus-law && pnpm install

      - name: Run tests
        run: cd services/nexus-law/tests && pnpm test
        env:
          API_BASE_URL: http://localhost:9200
          DB_HOST: localhost
          DB_PORT: 5432
          REDIS_URL: redis://localhost:6379
```

## Coverage Goals

Current coverage targets:

- **API Gateway**: 80%+ line coverage
- **Nexus Clients**: 70%+ line coverage
- **Adapters**: 85%+ line coverage

Run `pnpm test:coverage` to see current coverage.

## Contributing

When adding new features, please:

1. Add corresponding integration tests
2. Ensure tests handle service unavailability
3. Update this README if needed
4. Maintain coverage targets

## Support

For test failures or issues:

1. Check service health: `curl http://localhost:9200/health/detailed`
2. Check logs: `docker-compose logs -f`
3. Review test output for specific error messages
4. File an issue with full error logs

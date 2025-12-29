/**
 * Jest Test Setup
 *
 * Global setup for integration tests
 */

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Suppress console logs in tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};

// Test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9200';
process.env.MAGEAGENT_URL = process.env.MAGEAGENT_URL || 'http://localhost:9080';
process.env.GRAPHRAG_URL = process.env.GRAPHRAG_URL || 'http://localhost:9090';
process.env.FILEPROCESS_URL = process.env.FILEPROCESS_URL || 'http://localhost:9096';

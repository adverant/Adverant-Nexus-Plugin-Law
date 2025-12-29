/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/integration'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '../services/*/src/**/*.ts',
    '../packages/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000, // 30 seconds for integration tests
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  moduleNameMapper: {
    '^@nexus-law/types$': '<rootDir>/../packages/types/src',
    '^@nexus-law/shared$': '<rootDir>/../packages/shared/src',
    '^@nexus-law/adapters$': '<rootDir>/../packages/adapters/src',
  },
};

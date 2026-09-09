/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  moduleNameMapper: {
    // Workspace packages consumed as TS source in tests (same pattern as
    // apps/api and packages/llm-adapter). rootDir here = apps/analysis-worker.
    '^@recipe-systems/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@recipe-systems/schemas$': '<rootDir>/../../packages/schemas/src/index.ts',
    '^@recipe-systems/llm-adapter$': '<rootDir>/../../packages/llm-adapter/src/index.ts',
  },
  // QG1 floor: apps/analysis-worker (grounding + validation paths) = 80% statements (TEST_PLAN §2).
  coverageThreshold: {
    global: { statements: 80 },
  },
};

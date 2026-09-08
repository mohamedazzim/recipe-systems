/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  // QG1 floor: apps/analysis-worker (grounding + validation paths) = 80% statements (TEST_PLAN §2).
  coverageThreshold: {
    global: { statements: 80 },
  },
};

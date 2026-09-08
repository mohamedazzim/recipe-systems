/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  // QG1 floor (TEST_PLAN §2): 90% statements.
  coverageThreshold: {
    global: { statements: 90 },
  },
};

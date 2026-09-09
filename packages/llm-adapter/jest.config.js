/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  moduleNameMapper: {
    // Same pattern as apps/api: unit tests consume workspace packages' TS source directly
    // (no dist build needed). rootDir here = packages/llm-adapter → ../schemas.
    '^@recipe-systems/schemas$': '<rootDir>/../schemas/src/index.ts',
  },
  // QG1 floor (TEST_PLAN §2): 75% lines.
  coverageThreshold: {
    global: { lines: 75 },
  },
};

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  moduleNameMapper: {
    // Same pattern as apps/api: unit tests consume workspace packages' TS source
    // directly (no dist build needed).
    '^@recipe-systems/schemas$': '<rootDir>/../schemas/src/index.ts',
  },
  // No QG1 floor assigned to this package (TEST_PLAN §2 QG1 table).
};

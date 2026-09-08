/** @type {import('jest').Config} */
// Integration suites: one file per story ID (SCAFFOLD §6 / TEST_PLAN §1, e.g.
// story_b3_parse_review.test.ts). Empty at P0 — suites join the repo with each phase.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          skipLibCheck: true,
          strict: false,
          experimentalDecorators: true,
          emitDecoratorMetadata: false,
          module: 'CommonJS',
          target: 'ES2021',
          moduleResolution: 'node',
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Integration tests consume the database package's TS source directly
    // (same pattern as apps/api/jest.config.js).
    '^@recipe-systems/database$': '<rootDir>/packages/database/src/index.ts',
  },
  collectCoverageFrom: [],
};

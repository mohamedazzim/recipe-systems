/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.ts', '!**/main.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      // QG1 (TEST_PLAN §2) — apps/api floor: 75% lines.
      lines: 75,
    },
  },
  moduleNameMapper: {
    // Unit tests consume the database package's TS source directly (no dist build needed).
    // rootDir is src/ → ../../../ reaches the repo root.
    '^@recipe-systems/database$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@recipe-systems/rendering$': '<rootDir>/../../../packages/rendering/src/index.ts',
  },
  testEnvironment: 'node',
};

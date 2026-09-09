/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          module: 'CommonJS',
          target: 'ES2021',
          moduleResolution: 'node',
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@phosphor-icons/react$': '<rootDir>/test/phosphor-mock.tsx',
    '\\.(css|scss|sass)$': '<rootDir>/test/style-mock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    'components/app/**/*.{ts,tsx}',
    'lib/flow.ts',
    'lib/hooks/**/*.ts',
    'lib/types.ts',
  ],
  coverageThreshold: {
    global: {
      // UI floor (QG1 posture, TEST_PLAN §2): the app views + flow helpers.
      lines: 75,
    },
  },
};

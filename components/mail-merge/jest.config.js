module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/integration/'],
  setupFiles: ['<rootDir>/__tests__/setup/gas-shims.ts'],
  globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};

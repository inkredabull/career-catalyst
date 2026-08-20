module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        // Tests are excluded from tsconfig.json's `include` (it drives the
        // emit), so ts-jest gets its own inline config rather than a separate
        // tsconfig.test.json — the root .gitignore's *.json allowlist would
        // silently untrack that filename.
        module: 'commonjs',
        target: 'ES2022',
        esModuleInterop: true,
        strict: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

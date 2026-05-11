module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        // override GAS-specific settings that break Jest/commonjs
        module: 'commonjs',
        isolatedModules: false,
        noEmit: true,
      },
    }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

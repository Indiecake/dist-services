/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@services-sandbox/contracts/http/catalog$':
      '<rootDir>/../../packages/contracts/http/catalog.ts',
    '^@services-sandbox/contracts/http/create-order$':
      '<rootDir>/../../packages/contracts/http/create-order.ts',
    '^@services-sandbox/contracts/http/errors$':
      '<rootDir>/../../packages/contracts/http/errors.ts'
  },
  testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.json'
      }
    ]
  }
};

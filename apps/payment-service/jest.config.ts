/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@services-sandbox/kafka/runtime$':
      '<rootDir>/../../packages/kafka/runtime.ts',
    '^@services-sandbox/kafka/schema$': '<rootDir>/../../packages/kafka/schema.ts',
    '^@services-sandbox/kafka$': '<rootDir>/../../packages/kafka/index.ts'
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

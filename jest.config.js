module.exports = {
  projects: [
    // Backend tests (Node.js environment)
    {
      displayName: 'backend',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/backend'],
      testMatch: ['**/backend/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      collectCoverageFrom: [
        'src/backend/**/*.ts',
        'src/server.ts',
        'src/shared/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts'
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
    },
    // Frontend tests (jsdom environment for React)
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/tests/frontend'],
      testMatch: ['**/frontend/**/*.test.tsx', '**/frontend/**/*.test.ts'],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: 'tsconfig.test.json'
        }],
      },
      collectCoverageFrom: [
        'src/renderer/**/*.ts',
        'src/renderer/**/*.tsx',
        '!src/renderer/index.tsx',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.test.tsx',
        '!src/**/*.spec.ts'
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setupReact.ts'],
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      }
    }
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/renderer/index.tsx'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
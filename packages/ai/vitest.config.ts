import { defineConfig } from 'vitest/config';
import { testEnv } from './test/env';

export default defineConfig({
  test: {
    globals: true,
    env: testEnv,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});

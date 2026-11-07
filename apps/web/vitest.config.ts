import { defineConfig } from 'vitest/config';
import { testEnv } from './test/env';

const root = new URL('./', import.meta.url).pathname;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    env: { ...testEnv },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@/': `${root}`,
      'server-only': `${root}test/empty.ts`,
    },
  },
});

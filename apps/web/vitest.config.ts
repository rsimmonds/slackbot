import { defineConfig } from 'vitest/config';
import { webTestEnv } from './test/env';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'test/**/*.test.ts'],
    env: webTestEnv,
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname,
      // `server-only` throws outside a React Server Components bundle; tests run plain Node.
      'server-only': new URL('./test/server-only-stub.ts', import.meta.url).pathname,
    },
  },
});

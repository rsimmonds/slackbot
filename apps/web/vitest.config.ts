import { defineConfig } from 'vitest/config';

const here = (p: string) => new URL(p, import.meta.url).pathname;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': here('./'),
      'server-only': here('./test/server-only.ts'),
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['lib/**/*.test.ts', 'app/**/*.test.ts'] },
  resolve: { alias: { '@': new URL('./', import.meta.url).pathname } },
});

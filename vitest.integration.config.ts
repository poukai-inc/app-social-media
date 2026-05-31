import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests run against a real (in-memory) MongoDB via
 * mongodb-memory-server. Separate from the unit config so the fast unit suite
 * never pays the mongod startup cost. Run with `pnpm test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // One mongod at a time — avoids port/races and keeps memory bounded.
    fileParallelism: false,
    env: {
      // Force the Groq selection branch in ai-client (no network is made).
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'test-key-not-called',
      // Cron route auth for integration tests.
      CRON_SECRET: 'test-cron-secret',
      NEXTAUTH_URL: 'http://localhost:3000',
    },
  },
});

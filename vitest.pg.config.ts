import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Postgres repository-layer tests (BACKLOG #23). Require a real Postgres via
 * DATABASE_URL (a `postgres:16` service in CI, or local Docker). The tests
 * self-skip when DATABASE_URL is unset. Run with `pnpm test:db`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/db/**/*.pg.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});

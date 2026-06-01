import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" path alias so tests can import modules that
    // use it transitively (e.g. adapters importing `@/lib/logger`).
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: false,
    include: [
      'lib/**/*.test.{ts,tsx}',
      'app/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // RATCHET: only modules that actually have tests are gated, so the 80%
      // gate is real AND green today. Add files here as tests land
      // (BACKLOG #75-80). Do not lower the thresholds — grow the include list.
      include: [
        'lib/oauth-state.ts',
        'lib/timezone.ts',
        'lib/sanitize-page.ts',
        'lib/db/dual-write.ts',
        'lib/notifications/events.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        // Branch floor is 70 (vs 80 elsewhere): strict-mode defensive guards
        // (`?? default`, impossible-but-typed fallbacks) add branches that are
        // intentionally hard to exercise. Statements/lines/functions stay 80.
        branches: 70,
        statements: 80,
      },
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config — generates SQL migrations from db/schema.ts.
 * DATABASE_URL points at Neon (hosted) or the bundled Postgres (self-host).
 * BACKLOG #21 / decisions/0002-database.md.
 */
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/autopost',
  },
  strict: true,
  verbose: true,
});

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Drizzle client (Postgres). The repository layer (#23) consumes `db`.
 * Mongo/Mongoose remains the live store until the cutover (#24/#25); this is
 * the target-side client.
 */
const globalForDb = globalThis as unknown as { __autopostPool?: Pool };

const pool =
  globalForDb.__autopostPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__autopostPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };

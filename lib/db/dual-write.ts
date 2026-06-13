import { logger } from '@/lib/logger';

/**
 * Dual-write window adapter (BACKLOG #25). Temporary — removed once the
 * Mongo→Postgres cutover completes and Mongo is decommissioned. See
 * docs/cutover.md for the rollout plan.
 *
 * Routing is controlled by two env flags, read at call time:
 *   DB_WRITE = mongo | postgres | both   (default: mongo)
 *   DB_READ  = mongo | postgres          (default: mongo)
 *
 * During the dual-write window (DB_WRITE=both, DB_READ=mongo), Mongo is the
 * authoritative store and Postgres receives a SHADOW write that must never
 * break the live request (failures are logged, not thrown). After reads cut
 * over (DB_READ=postgres) Mongo writes continue for rollback safety; finally
 * DB_WRITE=postgres drops Mongo entirely.
 */
const log = logger.child('db:dual-write');

export type WriteTarget = 'mongo' | 'postgres' | 'both';
export type ReadTarget = 'mongo' | 'postgres';

function parseWrite(value: string | undefined): WriteTarget {
  return value === 'postgres' || value === 'both' ? value : 'mongo';
}

function parseRead(value: string | undefined): ReadTarget {
  return value === 'postgres' ? 'postgres' : 'mongo';
}

export const dbRouting = {
  get write(): WriteTarget {
    return parseWrite(process.env.DB_WRITE);
  },
  get read(): ReadTarget {
    return parseRead(process.env.DB_READ);
  },
  get writesMongo(): boolean {
    const w = this.write;
    return w === 'mongo' || w === 'both';
  },
  get writesPostgres(): boolean {
    const w = this.write;
    return w === 'postgres' || w === 'both';
  },
  get readsPostgres(): boolean {
    return this.read === 'postgres';
  },
};

/**
 * Run a write against the configured store(s) and return the authoritative
 * result. While Mongo is in the write set it is authoritative and the Postgres
 * write is a non-fatal shadow; in postgres-only mode Postgres is authoritative.
 */
export async function dualWrite<T>(ops: {
  mongo: () => Promise<T>;
  postgres: () => Promise<T | unknown>;
}): Promise<T> {
  if (dbRouting.writesMongo) {
    const result = await ops.mongo();
    if (dbRouting.writesPostgres) {
      try {
        await ops.postgres();
      } catch (error) {
        // Shadow write — must never fail the live (Mongo) path during the window.
        log.error('postgres shadow write failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }
  // postgres-only (post-cutover): Postgres is authoritative.
  return (await ops.postgres()) as T;
}

/**
 * Read from whichever store DB_READ selects. Used during the shadow-read phase
 * and the cutover.
 */
export async function dualRead<T>(ops: {
  mongo: () => Promise<T>;
  postgres: () => Promise<T>;
}): Promise<T> {
  return dbRouting.readsPostgres ? ops.postgres() : ops.mongo();
}

/**
 * Normalize a value for cross-store comparison: Dates -> ISO strings, Mongo
 * ObjectId -> hex string, object keys sorted. This avoids the false mismatches
 * that a raw JSON.stringify produces for Date vs ISO, ObjectId vs string, and
 * differing key order. (review M13)
 */
function normalizeForCompare(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const toHex = (obj as { toHexString?: unknown }).toHexString;
    if (typeof toHex === 'function') return (toHex as () => string).call(obj);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = normalizeForCompare(obj[key]);
    return out;
  }
  return value;
}

function defaultEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

/**
 * Shadow-read verification: read both stores and report whether they agree.
 * Mismatches are logged (with `label`) for investigation; returns the boolean.
 * Never throws on mismatch — it is a diagnostic, not a gate.
 */
export async function verifyParity<T>(
  label: string,
  ops: {
    mongo: () => Promise<T>;
    postgres: () => Promise<T>;
    equals?: (a: T, b: T) => boolean;
  },
): Promise<boolean> {
  const [m, p] = await Promise.all([ops.mongo(), ops.postgres()]);
  const equal = ops.equals ? ops.equals(m, p) : defaultEquals(m, p);
  if (!equal) {
    log.warn('parity mismatch between mongo and postgres', { label });
  }
  return equal;
}

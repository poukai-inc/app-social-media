import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dbRouting, dualWrite, dualRead, verifyParity } from './dual-write';

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});
beforeEach(() => {
  delete process.env.DB_WRITE;
  delete process.env.DB_READ;
});

describe('dbRouting', () => {
  it('defaults to mongo-only writes and mongo reads', () => {
    expect(dbRouting.write).toBe('mongo');
    expect(dbRouting.read).toBe('mongo');
    expect(dbRouting.writesMongo).toBe(true);
    expect(dbRouting.writesPostgres).toBe(false);
    expect(dbRouting.readsPostgres).toBe(false);
  });

  it('parses both / postgres', () => {
    process.env.DB_WRITE = 'both';
    process.env.DB_READ = 'postgres';
    expect(dbRouting.writesMongo).toBe(true);
    expect(dbRouting.writesPostgres).toBe(true);
    expect(dbRouting.readsPostgres).toBe(true);
  });

  it('treats unknown values as the safe default', () => {
    process.env.DB_WRITE = 'garbage';
    process.env.DB_READ = 'garbage';
    expect(dbRouting.write).toBe('mongo');
    expect(dbRouting.read).toBe('mongo');
  });
});

describe('dualWrite', () => {
  it('mongo-only: runs mongo, never postgres, returns mongo result', async () => {
    const mongo = vi.fn(async () => 'm');
    const postgres = vi.fn(async () => 'p');
    const out = await dualWrite({ mongo, postgres });
    expect(out).toBe('m');
    expect(mongo).toHaveBeenCalledOnce();
    expect(postgres).not.toHaveBeenCalled();
  });

  it('both: runs mongo then shadow postgres, returns mongo result', async () => {
    process.env.DB_WRITE = 'both';
    const mongo = vi.fn(async () => 'm');
    const postgres = vi.fn(async () => 'p');
    const out = await dualWrite({ mongo, postgres });
    expect(out).toBe('m');
    expect(mongo).toHaveBeenCalledOnce();
    expect(postgres).toHaveBeenCalledOnce();
  });

  it('both: a failing postgres shadow does NOT break the live path', async () => {
    process.env.DB_WRITE = 'both';
    const mongo = vi.fn(async () => 'm');
    const postgres = vi.fn(async () => {
      throw new Error('pg down');
    });
    await expect(dualWrite({ mongo, postgres })).resolves.toBe('m');
    expect(mongo).toHaveBeenCalledOnce();
  });

  it('postgres-only: runs postgres only, returns its result', async () => {
    process.env.DB_WRITE = 'postgres';
    const mongo = vi.fn(async () => 'm');
    const postgres = vi.fn(async () => 'p');
    const out = await dualWrite<string>({ mongo, postgres });
    expect(out).toBe('p');
    expect(mongo).not.toHaveBeenCalled();
    expect(postgres).toHaveBeenCalledOnce();
  });
});

describe('dualRead', () => {
  it('reads mongo by default, postgres when DB_READ=postgres', async () => {
    const mongo = vi.fn(async () => 'm');
    const postgres = vi.fn(async () => 'p');
    expect(await dualRead({ mongo, postgres })).toBe('m');

    process.env.DB_READ = 'postgres';
    expect(await dualRead({ mongo, postgres })).toBe('p');
  });
});

describe('verifyParity', () => {
  it('returns true on match, false on mismatch', async () => {
    expect(
      await verifyParity('x', { mongo: async () => ({ a: 1 }), postgres: async () => ({ a: 1 }) }),
    ).toBe(true);
    expect(
      await verifyParity('x', { mongo: async () => ({ a: 1 }), postgres: async () => ({ a: 2 }) }),
    ).toBe(false);
  });
});

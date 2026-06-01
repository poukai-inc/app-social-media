import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type * as Repos from '@/db/queries';
import type { ContentStrategy, ContentSources, DataSources, PostingSchedule } from '@/lib/models/Page';
import type { PlatformType } from '@/lib/platforms/types';

const ADMIN_URL = process.env.DATABASE_URL;
const RUN = Boolean(ADMIN_URL);

// A page literal that satisfies the NOT-NULL jsonb columns.
const pageInput = (userId: string, name: string) => ({
  userId,
  name,
  contentStrategy: { persona: 'p', topics: [], tone: 't', targetAudience: 'a', postingFrequency: 3, preferredAngles: [] } as ContentStrategy,
  contentSources: {} as ContentSources,
  dataSources: { databases: [] } as DataSources,
  schedule: { timezone: 'UTC', preferredDays: [], preferredTimes: [], autoGenerate: false, autoApprove: false, minConfidenceForAutoApprove: 0.8 } as PostingSchedule,
  publishTo: { platforms: [] as PlatformType[], adaptContent: true },
});

describe.skipIf(!RUN)('repository layer — RLS isolation (pg integration)', () => {
  let adminPool: Pool;
  let repos: typeof Repos;
  const u1 = '11111111-aaaa-4aaa-8aaa-111111111111';
  const u2 = '22222222-bbbb-4bbb-8bbb-222222222222';

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: ADMIN_URL });
    await migrate(drizzle(adminPool), { migrationsFolder: './db/migrations' });

    // Non-superuser app role so RLS is actually enforced for repo queries
    // (a superuser bypasses RLS entirely).
    await adminPool.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_role')
         THEN CREATE ROLE app_role LOGIN PASSWORD 'app_pw'; END IF; END $$;`,
    );
    await adminPool.query('GRANT USAGE ON SCHEMA public TO app_role');
    await adminPool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO app_role');
    await adminPool.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_role');
    await adminPool.query(
      `INSERT INTO users (id,email) VALUES ($1,'u1@test.com'),($2,'u2@test.com') ON CONFLICT DO NOTHING`,
      [u1, u2],
    );

    // Point the repo pool at the non-superuser role, then import the repos.
    const appUrl = new URL(ADMIN_URL as string);
    appUrl.username = 'app_role';
    appUrl.password = 'app_pw';
    process.env.DATABASE_URL = appUrl.toString();
    repos = await import('@/db/queries');
  });

  afterAll(async () => {
    await adminPool?.end();
  });

  it('isolates pages per org and resolves only the caller’s memberships', async () => {
    const suffix = `${u1.slice(0, 8)}`;
    const org1 = await repos.organizationsRepo.create('Org One', `org1-${suffix}`, u1);
    const org2 = await repos.organizationsRepo.create('Org Two', `org2-${suffix}`, u2);

    await repos.pagesRepo.create(org1, pageInput(u1, 'PageOne'));
    await repos.pagesRepo.create(org2, pageInput(u2, 'PageTwo'));

    // Each org sees only its own page.
    expect((await repos.pagesRepo.list(org1)).map((p) => p.name)).toEqual(['PageOne']);
    expect((await repos.pagesRepo.list(org2)).map((p) => p.name)).toEqual(['PageTwo']);

    // A page id from org2 is invisible inside org1's context.
    const [org2Page] = await repos.pagesRepo.list(org2);
    expect(org2Page).toBeDefined();
    expect(await repos.pagesRepo.findById(org1, org2Page!.id)).toBeNull();

    // Membership bootstrap returns only the caller's orgs.
    const u1Orgs = (await repos.organizationsRepo.listForUser(u1)).map((o) => o.id);
    expect(u1Orgs).toContain(org1);
    expect(u1Orgs).not.toContain(org2);
  });
});

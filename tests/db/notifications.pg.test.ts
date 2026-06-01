import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as applyMigrations } from 'drizzle-orm/node-postgres/migrator';
import type { inAppChannel as InAppChannel } from '@/lib/notifications/channels/in-app';
import type { notificationsRepo as NotificationsRepo } from '@/db/queries/notifications';
import type { organizationsRepo as OrganizationsRepo } from '@/db/queries/organizations';

const ADMIN_URL = process.env.DATABASE_URL;
const RUN = Boolean(ADMIN_URL);

describe.skipIf(!RUN)('in-app notification channel (pg integration, #77)', () => {
  let adminPool: Pool;
  let inAppChannel: typeof InAppChannel;
  let notificationsRepo: typeof NotificationsRepo;
  let organizationsRepo: typeof OrganizationsRepo;
  const u1 = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
  const u2 = 'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb';

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: ADMIN_URL });
    await applyMigrations(drizzle(adminPool), { migrationsFolder: './db/migrations' });
    await adminPool.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_role')
         THEN CREATE ROLE app_role LOGIN PASSWORD 'app_pw'; END IF; END $$;`,
    );
    await adminPool.query('GRANT USAGE ON SCHEMA public TO app_role');
    await adminPool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO app_role');
    await adminPool.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_role');
    await adminPool.query(
      `INSERT INTO users (id,email) VALUES ($1,'n1@test.com'),($2,'n2@test.com') ON CONFLICT DO NOTHING`,
      [u1, u2],
    );

    const appUrl = new URL(ADMIN_URL as string);
    appUrl.username = 'app_role';
    appUrl.password = 'app_pw';
    process.env.DATABASE_URL = appUrl.toString();
    ({ inAppChannel } = await import('@/lib/notifications/channels/in-app'));
    ({ notificationsRepo } = await import('@/db/queries/notifications'));
    ({ organizationsRepo } = await import('@/db/queries/organizations'));
  });

  afterAll(async () => {
    await adminPool?.end();
  });

  it('persists a notification to the org feed, RLS-scoped to that org', async () => {
    const org1 = await organizationsRepo.create('NOrg One', `norg1-${Date.now()}`, u1);
    const org2 = await organizationsRepo.create('NOrg Two', `norg2-${Date.now()}`, u2);

    await inAppChannel.send(
      { organizationId: org1, userId: u1 },
      { event: 'post.published', title: 'Published', body: 'Your post is live', data: { x: 1 } },
    );

    const org1Feed = await notificationsRepo.listForOrg(org1);
    expect(org1Feed).toHaveLength(1);
    expect(org1Feed[0]?.event).toBe('post.published');
    expect(org1Feed[0]?.title).toBe('Published');

    // Cross-org isolation: org2 sees nothing.
    expect(await notificationsRepo.listForOrg(org2)).toHaveLength(0);

    // Unread-for-user surfaces it; markRead clears it.
    const unread = await notificationsRepo.listUnreadForUser(org1, u1);
    expect(unread).toHaveLength(1);
    const id = unread[0]?.id;
    expect(id).toBeDefined();
    await notificationsRepo.markRead(org1, id!);
    expect(await notificationsRepo.listUnreadForUser(org1, u1)).toHaveLength(0);
  });
});

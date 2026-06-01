import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as applyMigrations } from 'drizzle-orm/node-postgres/migrator';
import { v5 as uuidv5 } from 'uuid';
import { sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { migrate } from '@/scripts/migrate-mongo-to-postgres';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';

const PG_URL = process.env.DATABASE_URL;
const RUN = Boolean(PG_URL);
const NS = '1b671a64-40d5-491e-99b0-da01ff1f3341';

describe.skipIf(!RUN)('mongo → postgres backfill (#24)', () => {
  let mongod: MongoMemoryServer;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let userOid: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    pool = new Pool({ connectionString: PG_URL });
    db = drizzle(pool, { schema });
    await applyMigrations(db, { migrationsFolder: './db/migrations' });
    // clean PG tables from any prior run
    await db.execute(
      sql`truncate organizations, users, organization_members, pages, posts restart identity cascade`,
    );

    // seed a minimal Mongo dataset
    const user = await User.create({ name: 'Mig User', email: 'mig@test.com' });
    userOid = user._id;
    const page = await Page.create({
      userId: user._id,
      name: 'Mig Page',
      contentStrategy: { persona: 'p', tone: 't', targetAudience: 'a' },
      schedule: { timezone: 'UTC' },
    });
    await Post.create({ userId: user._id, pageId: page._id, content: 'hello', status: 'draft' });
  });

  afterAll(async () => {
    await pool?.end();
    await mongoose.disconnect();
    await mongod?.stop();
  });

  it('backfills users→orgs, pages and posts with derived org_id; is idempotent', async () => {
    const counts = await migrate(db);
    expect(counts.users).toBe(1);
    expect(counts.organizations).toBe(1);
    expect(counts.pages).toBe(1);
    expect(counts.posts).toBe(1);

    const orgId = uuidv5(`org:${String(userOid)}`, NS);
    const userId = uuidv5(String(userOid), NS);

    const orgs = await db.select().from(schema.organizations);
    expect(orgs.map((o) => o.id)).toContain(orgId);

    const pages = await db.select().from(schema.pages);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.organizationId).toBe(orgId);
    expect(pages[0]?.userId).toBe(userId);

    const posts = await db.select().from(schema.posts);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.organizationId).toBe(orgId);

    // owner membership created
    const members = await db.select().from(schema.organizationMembers);
    expect(members[0]?.role).toBe('owner');

    // re-run: idempotent (ON CONFLICT DO NOTHING) — no duplicate rows
    await migrate(db);
    expect(await db.select().from(schema.pages)).toHaveLength(1);
    expect(await db.select().from(schema.posts)).toHaveLength(1);
    expect(await db.select().from(schema.organizations)).toHaveLength(1);
  });
});

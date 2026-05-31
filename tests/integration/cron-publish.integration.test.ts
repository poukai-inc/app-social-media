import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Mock the external boundaries: platform adapters (network) + the legacy
// LinkedIn helper. The lock + atomic claim + Mongo writes run for real.
vi.mock('@/lib/platforms', () => ({
  platformRegistry: {
    getAdapter: () => ({
      adaptContent: async (content: string) => content,
      publish: async () => ({ success: true, postId: 'tw-1', postUrl: 'http://x/tw-1' }),
    }),
  },
}));
vi.mock('@/lib/linkedin', () => ({
  postToLinkedIn: vi.fn(async () => ({ success: true, postId: 'li-1', postUrl: 'http://x/li-1' })),
}));

import { GET } from '@/app/api/cron/publish/route';
import Post from '@/lib/models/Post';
import Page from '@/lib/models/Page';
import User from '@/lib/models/User';

const CRON = 'test-cron-secret';
const req = (secret?: string) =>
  new Request('http://localhost:3000/api/cron/publish', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

let seedCounter = 0;
async function seedDuePost() {
  seedCounter += 1;
  const user = await User.create({ email: `u${seedCounter}@test.com`, name: 'Test User' });
  const page = await Page.create({
    userId: user._id,
    name: 'Test Page',
    connections: [
      { platform: 'twitter', platformId: 'acct-1', platformUsername: '@me', accessToken: 'AT', isActive: true },
    ],
    contentStrategy: { persona: 'p', tone: 't', targetAudience: 'a' },
  });
  const post = await Post.create({
    userId: user._id,
    pageId: page._id,
    content: 'hello world',
    status: 'scheduled',
    scheduledFor: new Date(Date.now() - 60_000),
    targetPlatforms: ['twitter'],
  });
  return { user, page, post };
}

beforeEach(async () => {
  await Promise.all([Post.deleteMany({}), Page.deleteMany({}), User.deleteMany({})]);
  await mongoose.connection.collection('cron_locks').deleteMany({}).catch(() => undefined);
});

describe('cron/publish (integration)', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('publishes a due post exactly once and clears the claim marker', async () => {
    const { post } = await seedDuePost();

    const res = await GET(req(CRON));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);

    const updated = await Post.findById(post._id).lean();
    expect(updated?.status).toBe('published');
    expect(updated?.publishStartedAt ?? null).toBeNull();
    expect(updated?.platformResults?.[0]?.status).toBe('published');
  });

  it('is idempotent — a second run finds nothing left to publish', async () => {
    await seedDuePost();
    await GET(req(CRON)); // publishes it
    const res2 = await GET(req(CRON)); // nothing scheduled remains
    const body2 = await res2.json();
    expect(body2.processed).toBe(0);
  });
});

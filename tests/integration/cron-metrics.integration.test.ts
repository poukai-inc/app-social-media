import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the platform registry so fetchMetrics returns canned metrics instead of
// hitting a network. EngagementHistory persistence + scoring run for real.
vi.mock('@/lib/platforms', () => ({
  platformRegistry: {
    getAdapter: () => ({
      fetchMetrics: async () => ({
        impressions: 1000,
        reach: 900,
        likes: 50,
        comments: 10,
        shares: 5,
        clicks: 20,
      }),
    }),
  },
}));

import { GET } from '@/app/api/cron/collect-metrics/route';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import EngagementHistory from '@/lib/models/EngagementHistory';

const CRON = 'test-cron-secret';
const req = (secret?: string) =>
  new Request('http://localhost:3000/api/cron/collect-metrics', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  }) as unknown as NextRequest;

let n = 0;
async function seedPublishedPost() {
  n += 1;
  const user = await User.create({ email: `m${n}@test.com`, name: 'Metrics' });
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
    content: 'published post',
    status: 'published',
    publishedAt: new Date(Date.now() - 3600_000),
    targetPlatforms: ['twitter'],
    platformResults: [{ platform: 'twitter', status: 'published', postId: 'tw-1', postUrl: 'http://x/tw-1' }],
  });
  return { user, page, post };
}

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Page.deleteMany({}),
    Post.deleteMany({}),
    EngagementHistory.deleteMany({}),
  ]);
});

describe('cron/collect-metrics (integration)', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('collects metrics for a published post into EngagementHistory', async () => {
    const { post } = await seedPublishedPost();

    const res = await GET(req(CRON));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.metricsCollected).toBeGreaterThanOrEqual(1);

    const history = await EngagementHistory.findOne({ postId: post._id }).lean();
    expect(history).not.toBeNull();
    const twitter = history?.platforms.find((p) => p.platform === 'twitter');
    expect(twitter?.currentMetrics.impressions).toBe(1000);
    expect(twitter?.currentMetrics.shares).toBe(5);
    expect(typeof twitter?.performanceScore).toBe('number');
  });
});

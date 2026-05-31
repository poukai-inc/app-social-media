import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Mock the external boundaries (LinkedIn engagement + AI). The distributed
// lock, batching, and Mongo writes run for real.
vi.mock('@/lib/linkedin-engagement', () => ({
  engageWithPost: vi.fn(async () => ({ success: true, liked: true, commented: false })),
  getPostComments: vi.fn(async () => ({ success: true, comments: [] })),
  replyToComment: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/openai', () => ({
  generateComment: vi.fn(async () => 'a comment'),
  generateReply: vi.fn(async () => 'a reply'),
}));

import { GET } from '@/app/api/cron/engage/route';
import User from '@/lib/models/User';
import { EngagementTarget } from '@/lib/models/Engagement';

const CRON = 'test-cron-secret';
const req = (secret?: string) =>
  new Request('http://localhost:3000/api/cron/engage', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

let n = 0;
async function seedApprovedEngagement() {
  n += 1;
  const user = await User.create({ email: `e${n}@test.com`, name: 'Engager', linkedinAccessToken: 'LAT' });
  const target = await EngagementTarget.create({
    userId: user._id,
    postUrl: 'https://linkedin.com/feed/update/urn:li:activity:1',
    postUrn: 'urn:li:activity:1',
    engagementType: 'like',
    status: 'approved',
  });
  return { user, target };
}

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), EngagementTarget.deleteMany({})]);
  await mongoose.connection.collection('cron_locks').deleteMany({}).catch(() => undefined);
});

describe('cron/engage (integration)', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('engages an approved target once and marks it engaged', async () => {
    const { target } = await seedApprovedEngagement();

    const res = await GET(req(CRON));
    expect(res.status).toBe(200);

    const updated = await EngagementTarget.findById(target._id).lean();
    expect(updated?.status).toBe('engaged');
    expect(updated?.engagedAt).toBeTruthy();
  });

  it('a second run does not re-engage an already-engaged target', async () => {
    await seedApprovedEngagement();
    await GET(req(CRON));
    const res2 = await GET(req(CRON));
    const body2 = await res2.json();
    // nothing approved/pending remains -> no engagements processed
    expect(body2.engagementsProcessed).toBe(0);
  });
});

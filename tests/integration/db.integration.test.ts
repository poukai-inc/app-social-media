import { describe, it, expect, afterEach } from 'vitest';
import AIUsage, { getDateKey } from '@/lib/models/AIUsage';
import PendingConnection, { createPendingConnection } from '@/lib/models/PendingConnection';
import mongoose from 'mongoose';

afterEach(async () => {
  await AIUsage.deleteMany({});
  await PendingConnection.deleteMany({});
});

describe('AIUsage model (integration)', () => {
  it('round-trips a usage record', async () => {
    const date = getDateKey();
    await AIUsage.create({ date, modelName: 'llama-3.1-8b-instant', tokensUsed: 1234, requestCount: 5 });

    const found = await AIUsage.findOne({ date, modelName: 'llama-3.1-8b-instant' }).lean();
    expect(found?.tokensUsed).toBe(1234);
    expect(found?.requestCount).toBe(5);
  });

  it('enforces the unique {date, modelName} index', async () => {
    const date = getDateKey();
    await AIUsage.create({ date, modelName: 'dup-model', tokensUsed: 1 });
    await AIUsage.syncIndexes();
    await expect(
      AIUsage.create({ date, modelName: 'dup-model', tokensUsed: 2 })
    ).rejects.toThrow();
  });
});

describe('PendingConnection model (integration)', () => {
  it('createPendingConnection stores the payload under an opaque key', async () => {
    const userId = new mongoose.Types.ObjectId();
    const key = await createPendingConnection(userId, 'twitter', { accessToken: 'AT' });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(20);

    const doc = await PendingConnection.findById(key).lean();
    expect(doc?.platform).toBe('twitter');
    expect((doc?.payload as { accessToken: string }).accessToken).toBe('AT');
    expect(doc?.userId.toString()).toBe(userId.toString());
  });

  it('is consumed exactly once via findOneAndDelete', async () => {
    const userId = new mongoose.Types.ObjectId();
    const key = await createPendingConnection(userId, 'facebook', { pages: [] });

    const first = await PendingConnection.findOneAndDelete({ _id: key, userId });
    expect(first).not.toBeNull();

    const second = await PendingConnection.findOneAndDelete({ _id: key, userId });
    expect(second).toBeNull();
  });

  it('does not return a record for a different user', async () => {
    const owner = new mongoose.Types.ObjectId();
    const attacker = new mongoose.Types.ObjectId();
    const key = await createPendingConnection(owner, 'twitter', { accessToken: 'AT' });

    const stolen = await PendingConnection.findOneAndDelete({ _id: key, userId: attacker });
    expect(stolen).toBeNull();
  });
});

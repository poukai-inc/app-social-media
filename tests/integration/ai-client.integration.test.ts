import { describe, it, expect, afterEach } from 'vitest';
import AIUsage, { GROQ_MODEL_LIMITS, MODEL_PRIORITY, getDateKey } from '@/lib/models/AIUsage';
import { getSelectedModel, getUsageStatus } from '@/lib/ai-client';

afterEach(async () => {
  await AIUsage.deleteMany({});
});

describe('ai-client model selection (integration)', () => {
  it('skips an over-limit model and reflects seeded usage', async () => {
    // MODEL_PRIORITY[0] has a finite daily token limit — exhaust it.
    const exhausted = MODEL_PRIORITY[0];
    expect(exhausted).toBeDefined();
    const modelLimits = GROQ_MODEL_LIMITS[exhausted!];
    expect(modelLimits).toBeDefined();
    const limit = modelLimits!.tokensPerDay as number;
    const seeded = limit + 1000;
    await AIUsage.create({
      date: getDateKey(),
      modelName: exhausted!, // exhausted is defined — asserted above
      tokensUsed: seeded,
      requestCount: 1,
    });

    // First ai-client call populates the daily cache from the seed (Groq branch
    // forced via AI_PROVIDER env in vitest.integration.config.ts).
    const selected = await getSelectedModel();

    const detail = selected.allModels.find((m) => m.model === exhausted);
    expect(detail?.hasCapacity).toBe(false);
    expect(detail?.tokensUsed).toBe(seeded);
    // The exhausted model must not be chosen.
    expect(selected.model).not.toBe(exhausted);

    const status = await getUsageStatus();
    const exhaustedStatus = status[exhausted!];
    expect(exhaustedStatus).toBeDefined();
    expect(exhaustedStatus!.tokensUsed).toBe(seeded);
    expect(exhaustedStatus!.available).toBe(false);
  });
});

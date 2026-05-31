import { describe, it, expect } from 'vitest';
import {
  GROQ_MODEL_LIMITS,
  MODEL_PRIORITY,
  FAST_MODEL_PRIORITY,
  getDateKey,
  getMinuteKey,
} from './AIUsage';

describe('AIUsage date keys', () => {
  it('getDateKey zeroes the UTC time of day', () => {
    const d = getDateKey(new Date('2026-05-31T17:42:13.500Z'));
    expect(d.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('getDateKey is idempotent', () => {
    const a = getDateKey(new Date('2026-05-31T17:42:13.500Z'));
    const b = getDateKey(a);
    expect(b.toISOString()).toBe(a.toISOString());
  });

  it('getMinuteKey zeroes seconds and milliseconds', () => {
    const d = getMinuteKey(new Date('2026-05-31T17:42:13.500Z'));
    expect(d.toISOString()).toBe('2026-05-31T17:42:00.000Z');
  });

  it('does not mutate the input date', () => {
    const input = new Date('2026-05-31T17:42:13.500Z');
    getDateKey(input);
    getMinuteKey(input);
    expect(input.toISOString()).toBe('2026-05-31T17:42:13.500Z');
  });
});

describe('GROQ_MODEL_LIMITS', () => {
  it('every model has the four limit fields with sane types', () => {
    for (const [model, limits] of Object.entries(GROQ_MODEL_LIMITS)) {
      expect(typeof limits.requestsPerMinute, model).toBe('number');
      expect(typeof limits.requestsPerDay, model).toBe('number');
      expect(typeof limits.tokensPerMinute, model).toBe('number');
      // tokensPerDay is `number | null` (null = unlimited)
      expect(limits.tokensPerDay === null || typeof limits.tokensPerDay === 'number', model).toBe(true);
    }
  });

  it('local ollama model is unlimited (tokensPerDay null)', () => {
    expect(GROQ_MODEL_LIMITS['qwen2.5:7b'].tokensPerDay).toBeNull();
  });
});

describe('model priority lists', () => {
  it('are non-empty arrays', () => {
    expect(MODEL_PRIORITY.length).toBeGreaterThan(0);
    expect(FAST_MODEL_PRIORITY.length).toBeGreaterThan(0);
  });

  it('every prioritized model has a configured limit', () => {
    for (const model of [...MODEL_PRIORITY, ...FAST_MODEL_PRIORITY]) {
      expect(GROQ_MODEL_LIMITS[model], model).toBeDefined();
    }
  });

  it('contain no duplicates within each list', () => {
    expect(new Set(MODEL_PRIORITY).size).toBe(MODEL_PRIORITY.length);
    expect(new Set(FAST_MODEL_PRIORITY).size).toBe(FAST_MODEL_PRIORITY.length);
  });
});

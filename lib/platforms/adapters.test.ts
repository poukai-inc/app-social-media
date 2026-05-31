import { describe, it, expect } from 'vitest';
import { FacebookAdapter } from './facebook-adapter';
import { LinkedInAdapter } from './linkedin-adapter';
import { twitterAdapter } from './twitter-adapter';

describe('adaptContent — per-platform shaping', () => {
  it('facebook tags the platform and caps hashtags at its max (3)', async () => {
    const out = await new FacebookAdapter().adaptContent('Hello world #a #b #c #d #e');
    expect(out.platform).toBe('facebook');
    expect(out.hashtags?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('linkedin tags the platform and caps hashtags at its max (5)', async () => {
    const out = await new LinkedInAdapter().adaptContent('Big post #a #b #c #d #e #f #g');
    expect(out.platform).toBe('linkedin');
    expect(out.hashtags?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it('twitter tags the platform and returns string content', async () => {
    const out = await twitterAdapter.adaptContent('Quick tweet #hi');
    expect(out.platform).toBe('twitter');
    expect(typeof out.content).toBe('string');
    expect(out.content.length).toBeGreaterThan(0);
  });
});

describe('base truncateContent', () => {
  // truncateContent is a protected helper; exercise it on a real adapter instance.
  const adapter = new FacebookAdapter() as unknown as {
    truncateContent(content: string, maxLength?: number): string;
  };

  it('leaves content within the limit unchanged', () => {
    expect(adapter.truncateContent('short text', 100)).toBe('short text');
  });

  it('truncates over-limit content to within the limit and marks it', () => {
    const out = adapter.truncateContent('a'.repeat(500), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('...')).toBe(true);
  });

  it('never exceeds the limit even with sentence/newline boundaries', () => {
    const text = 'First sentence here.\nThen a much longer tail ' + 'b'.repeat(200);
    const out = adapter.truncateContent(text, 40);
    expect(out.length).toBeLessThanOrEqual(40);
  });
});

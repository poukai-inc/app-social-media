import { describe, it, expect, vi } from 'vitest';
import { dispatch, DEFAULT_CHANNELS } from './index';
import { postPublishedEvent, postFailedEvent, approvalNeededEvent, tokenExpiringEvent } from './events';
import type { NotificationChannel, NotificationContext, NotificationMessage } from './channel';

const ctx: NotificationContext = { organizationId: 'org-1', userId: 'user-1' };
const msg: NotificationMessage = { event: 'test.event', title: 'Hi' };

function fakeChannel(name: NotificationChannel['name'], send = vi.fn(async () => {})): NotificationChannel {
  return { name, send };
}

describe('dispatch', () => {
  it('delivers to every channel', async () => {
    const a = fakeChannel('in-app');
    const b = fakeChannel('email');
    await dispatch([a, b], ctx, msg);
    expect(a.send).toHaveBeenCalledWith(ctx, msg);
    expect(b.send).toHaveBeenCalledWith(ctx, msg);
  });

  it('isolates failures — one channel throwing does not block others or throw', async () => {
    const bad = fakeChannel('in-app', vi.fn(async () => {
      throw new Error('channel down');
    }));
    const good = fakeChannel('email');
    await expect(dispatch([bad, good], ctx, msg)).resolves.toBeUndefined();
    expect(good.send).toHaveBeenCalledOnce();
  });

  it('is a no-op with no channels', async () => {
    await expect(dispatch([], ctx, msg)).resolves.toBeUndefined();
  });
});

describe('DEFAULT_CHANNELS', () => {
  it('is in-app + email (MVP, Slack deferred)', () => {
    expect(DEFAULT_CHANNELS).toEqual(['in-app', 'email']);
  });
});

describe('event builders', () => {
  it('post.published has no email', () => {
    const m = postPublishedEvent({ pageName: 'Acme', platforms: ['twitter'] });
    expect(m.event).toBe('post.published');
    expect(m.email).toBeUndefined();
    expect(m.body).toContain('twitter');
  });

  it('post.failed carries the error in data', () => {
    const m = postFailedEvent({ pageName: 'Acme', error: 'boom' });
    expect(m.event).toBe('post.failed');
    expect(m.data?.error).toBe('boom');
  });

  it('approval.needed renders an email only when a recipient is given', () => {
    expect(approvalNeededEvent({ pageName: 'Acme', approveUrl: 'http://x/a' }).email).toBeUndefined();
    const withEmail = approvalNeededEvent({ pageName: 'Acme', approveUrl: 'http://x/a', recipientEmail: 'u@x.com' });
    expect(withEmail.email?.to).toBe('u@x.com');
    expect(withEmail.email?.html).toContain('http://x/a');
  });

  it('token.expiring rounds the hours and renders email when asked', () => {
    const m = tokenExpiringEvent({ platform: 'twitter', pageName: 'Acme', hoursUntilExpiry: 23.6, recipientEmail: 'u@x.com' });
    expect(m.body).toContain('24h');
    expect(m.email?.subject).toContain('twitter');
  });
});

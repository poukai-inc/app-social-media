import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true) }));

import { emailChannel } from './email';
import { sendEmail } from '@/lib/email';

const ctx = { organizationId: 'org-1' };

describe('email channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers when the message carries an email payload', async () => {
    await emailChannel.send(ctx, {
      event: 'approval.needed',
      title: 'Approve',
      email: { to: 'u@x.com', subject: 'Approve', html: '<p>hi</p>' },
    });
    expect(sendEmail).toHaveBeenCalledWith({ to: 'u@x.com', subject: 'Approve', html: '<p>hi</p>' });
  });

  it('forwards an optional text body', async () => {
    await emailChannel.send(ctx, {
      event: 'x',
      title: 't',
      email: { to: 'u@x.com', subject: 's', html: '<p>h</p>', text: 'plain' },
    });
    expect(sendEmail).toHaveBeenCalledWith({ to: 'u@x.com', subject: 's', html: '<p>h</p>', text: 'plain' });
  });

  it('skips silently when there is no email payload', async () => {
    await emailChannel.send(ctx, { event: 'post.published', title: 'Published' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

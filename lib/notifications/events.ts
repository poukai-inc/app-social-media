import type { NotificationMessage } from './channel';

/**
 * Typed builders for the common notification events. Each returns a
 * NotificationMessage; pass the result to `notify(ctx, msg)`. Call sites use
 * these instead of hand-building messages, so wording/keys stay consistent.
 * (BACKLOG #32; #33 migrates the existing email call sites onto these.)
 */

export function postPublishedEvent(args: { pageName: string; platforms: string[] }): NotificationMessage {
  return {
    event: 'post.published',
    title: 'Post published',
    body: `Your post for ${args.pageName} went live on ${args.platforms.join(', ') || 'your platforms'}.`,
    data: { pageName: args.pageName, platforms: args.platforms },
  };
}

export function postFailedEvent(args: { pageName: string; error: string }): NotificationMessage {
  return {
    event: 'post.failed',
    title: 'Post failed to publish',
    body: `Publishing for ${args.pageName} failed: ${args.error}`,
    data: { pageName: args.pageName, error: args.error },
  };
}

export function approvalNeededEvent(args: {
  pageName: string;
  approveUrl: string;
  recipientEmail?: string;
}): NotificationMessage {
  const msg: NotificationMessage = {
    event: 'approval.needed',
    title: 'A post needs your approval',
    body: `A new post for ${args.pageName} is awaiting approval.`,
    data: { pageName: args.pageName, approveUrl: args.approveUrl },
  };
  if (args.recipientEmail) {
    msg.email = {
      to: args.recipientEmail,
      subject: `Approval needed — ${args.pageName}`,
      html: `<p>A new post for <strong>${args.pageName}</strong> needs your approval.</p>`
        + `<p><a href="${args.approveUrl}">Review it</a></p>`,
    };
  }
  return msg;
}

export function tokenExpiringEvent(args: {
  platform: string;
  pageName: string;
  hoursUntilExpiry: number;
  recipientEmail?: string;
}): NotificationMessage {
  const msg: NotificationMessage = {
    event: 'token.expiring',
    title: `${args.platform} connection expiring`,
    body: `Your ${args.platform} connection for ${args.pageName} expires in ~${Math.round(args.hoursUntilExpiry)}h. Reconnect to keep posting.`,
    data: { platform: args.platform, pageName: args.pageName, hoursUntilExpiry: args.hoursUntilExpiry },
  };
  if (args.recipientEmail) {
    msg.email = {
      to: args.recipientEmail,
      subject: `${args.platform} connection expiring soon`,
      html: `<p>Your <strong>${args.platform}</strong> connection for ${args.pageName} expires soon. Please reconnect.</p>`,
    };
  }
  return msg;
}

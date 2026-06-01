/**
 * Notification dispatcher (BACKLOG #32). One call site — `notify(ctx, msg)` —
 * fans a message out to the org's configured channels. Adding a channel is a
 * new adapter file + a registry entry; call sites never change.
 *
 * Delivery is best-effort + isolated: one channel failing never blocks the
 * others (Promise.allSettled), and failures are logged, not thrown — a request
 * should not 500 because email was down.
 */
import { logger } from '@/lib/logger';
import type { ChannelName, NotificationChannel, NotificationContext, NotificationMessage } from './channel';
import { inAppChannel } from './channels/in-app';
import { emailChannel } from './channels/email';

const log = logger.child('notifications');

/** Registered channels. Slack (#35) / Discord (#67) land in P2. */
const registry: Partial<Record<ChannelName, NotificationChannel>> = {
  'in-app': inAppChannel,
  email: emailChannel,
};

/** MVP default per decisions/0007-notifications.md (Slack deferred to P2). */
export const DEFAULT_CHANNELS: ChannelName[] = ['in-app', 'email'];

/** Deliver to an explicit channel list (exported for testing + advanced use). */
export async function dispatch(
  channels: NotificationChannel[],
  ctx: NotificationContext,
  msg: NotificationMessage,
): Promise<void> {
  const results = await Promise.allSettled(channels.map((c) => c.send(ctx, msg)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      log.error('notification channel failed', {
        channel: channels[i]?.name,
        event: msg.event,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

export async function notify(ctx: NotificationContext, msg: NotificationMessage): Promise<void> {
  const names = ctx.channels ?? DEFAULT_CHANNELS;
  const channels = names
    .map((name) => registry[name])
    .filter((c): c is NotificationChannel => Boolean(c));
  await dispatch(channels, ctx, msg);
}

export * from './channel';
export * from './events';

import { notificationsRepo } from '@/db/queries/notifications';
import type { NotificationChannel } from '../channel';

/**
 * In-app channel — persists the message to the org's notification feed
 * (Postgres `notifications` table, RLS-scoped). Always available.
 */
export const inAppChannel: NotificationChannel = {
  name: 'in-app',
  async send(ctx, msg) {
    await notificationsRepo.create(ctx.organizationId, {
      ...(ctx.userId ? { userId: ctx.userId } : {}),
      event: msg.event,
      title: msg.title,
      ...(msg.body ? { body: msg.body } : {}),
      data: msg.data ?? {},
    });
  },
};

import { eq, desc, and, isNull } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { notifications } from '../schema';

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = Omit<InferInsertModel<typeof notifications>, 'organizationId'>;

export const notificationsRepo = {
  listForOrg: (orgId: string, opts: { limit?: number } = {}): Promise<Notification[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(notifications)
        .orderBy(desc(notifications.createdAt))
        .limit(opts.limit ?? 100),
    ),

  listUnreadForUser: (orgId: string, userId: string): Promise<Notification[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
        .orderBy(desc(notifications.createdAt)),
    ),

  create: (orgId: string, data: NewNotification): Promise<Notification> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(notifications)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('notifications.create: insert returned no row');
      return row;
    }),

  markRead: (orgId: string, id: string): Promise<Notification | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(notifications).where(eq(notifications.id, id));
    }),
};

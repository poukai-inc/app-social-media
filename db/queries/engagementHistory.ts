import { eq, desc } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { engagementHistory } from '../schema';

export type EngagementHistory = InferSelectModel<typeof engagementHistory>;
export type NewEngagementHistory = Omit<InferInsertModel<typeof engagementHistory>, 'organizationId'>;

export const engagementHistoryRepo = {
  findByPost: (orgId: string, postId: string): Promise<EngagementHistory | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(engagementHistory)
        .where(eq(engagementHistory.postId, postId))
        .limit(1);
      return row ?? null;
    }),

  listByPage: (orgId: string, pageId: string): Promise<EngagementHistory[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(engagementHistory)
        .where(eq(engagementHistory.pageId, pageId))
        .orderBy(desc(engagementHistory.createdAt)),
    ),

  create: (orgId: string, data: NewEngagementHistory): Promise<EngagementHistory> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(engagementHistory)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('engagementHistory.create: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewEngagementHistory>): Promise<EngagementHistory | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(engagementHistory)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(engagementHistory.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(engagementHistory).where(eq(engagementHistory.id, id));
    }),
};

import { eq, desc } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { icpEngagements } from '../schema';

export type IcpEngagement = InferSelectModel<typeof icpEngagements>;
export type NewIcpEngagement = Omit<InferInsertModel<typeof icpEngagements>, 'organizationId'>;

export const icpEngagementsRepo = {
  list: (orgId: string, opts: { limit?: number; offset?: number } = {}): Promise<IcpEngagement[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(icpEngagements)
        .orderBy(desc(icpEngagements.createdAt))
        .limit(opts.limit ?? 100)
        .offset(opts.offset ?? 0),
    ),

  listByPage: (orgId: string, pageId: string): Promise<IcpEngagement[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(icpEngagements)
        .where(eq(icpEngagements.pageId, pageId))
        .orderBy(desc(icpEngagements.engagedAt)),
    ),

  findById: (orgId: string, id: string): Promise<IcpEngagement | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(icpEngagements)
        .where(eq(icpEngagements.id, id))
        .limit(1);
      return row ?? null;
    }),

  create: (orgId: string, data: NewIcpEngagement): Promise<IcpEngagement> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(icpEngagements)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('icpEngagements.create: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewIcpEngagement>): Promise<IcpEngagement | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(icpEngagements)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(icpEngagements.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(icpEngagements).where(eq(icpEngagements.id, id));
    }),
};

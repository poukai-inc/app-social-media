import { eq, desc, and } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { engagementTargets } from '../schema';

export type EngagementTarget = InferSelectModel<typeof engagementTargets>;
export type NewEngagementTarget = Omit<InferInsertModel<typeof engagementTargets>, 'organizationId'>;

export const engagementTargetsRepo = {
  list: (orgId: string, opts: { limit?: number; offset?: number } = {}): Promise<EngagementTarget[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(engagementTargets)
        .orderBy(desc(engagementTargets.createdAt))
        .limit(opts.limit ?? 100)
        .offset(opts.offset ?? 0),
    ),

  listByUserStatus: (
    orgId: string,
    userId: string,
    status: EngagementTarget['status'],
    opts: { limit?: number } = {},
  ): Promise<EngagementTarget[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(engagementTargets)
        .where(and(eq(engagementTargets.userId, userId), eq(engagementTargets.status, status)))
        .orderBy(desc(engagementTargets.createdAt))
        .limit(opts.limit ?? 200), // bounded (review M3)
    ),

  findById: (orgId: string, id: string): Promise<EngagementTarget | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(engagementTargets)
        .where(eq(engagementTargets.id, id))
        .limit(1);
      return row ?? null;
    }),

  create: (orgId: string, data: NewEngagementTarget): Promise<EngagementTarget> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(engagementTargets)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('engagementTargets.create: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewEngagementTarget>): Promise<EngagementTarget | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(engagementTargets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(engagementTargets.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(engagementTargets).where(eq(engagementTargets.id, id));
    }),
};

import { eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { engagementSettings } from '../schema';

export type EngagementSettings = InferSelectModel<typeof engagementSettings>;
export type NewEngagementSettings = Omit<InferInsertModel<typeof engagementSettings>, 'organizationId'>;

export const engagementSettingsRepo = {
  findByUser: (orgId: string, userId: string): Promise<EngagementSettings | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(engagementSettings)
        .where(eq(engagementSettings.userId, userId))
        .limit(1);
      return row ?? null;
    }),

  upsertForUser: (
    orgId: string,
    userId: string,
    data: Partial<NewEngagementSettings>,
  ): Promise<EngagementSettings> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(engagementSettings)
        .values({ ...data, userId, organizationId: orgId })
        .onConflictDoUpdate({
          target: engagementSettings.userId,
          set: { ...data, updatedAt: new Date() },
        })
        .returning();
      if (!row) throw new Error('engagementSettings.upsertForUser: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewEngagementSettings>): Promise<EngagementSettings | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(engagementSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(engagementSettings.id, id))
        .returning();
      return row ?? null;
    }),
};

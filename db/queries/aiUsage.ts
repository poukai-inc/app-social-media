import { eq, and } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { aiUsage } from '../schema';

export type AiUsage = InferSelectModel<typeof aiUsage>;
export type NewAiUsage = Omit<InferInsertModel<typeof aiUsage>, 'organizationId'>;

export const aiUsageRepo = {
  getForDate: (orgId: string, date: Date, modelName: string): Promise<AiUsage | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.organizationId, orgId),
            eq(aiUsage.date, date),
            eq(aiUsage.modelName, modelName),
          ),
        )
        .limit(1);
      return row ?? null;
    }),

  upsert: (
    orgId: string,
    date: Date,
    modelName: string,
    data: Partial<NewAiUsage>,
  ): Promise<AiUsage> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(aiUsage)
        .values({ ...data, organizationId: orgId, date, modelName })
        .onConflictDoUpdate({
          target: [aiUsage.organizationId, aiUsage.date, aiUsage.modelName],
          set: {
            tokensUsed: data.tokensUsed ?? 0,
            requestCount: data.requestCount ?? 0,
            lastUpdated: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error('aiUsage.upsert: insert returned no row');
      return row;
    }),

  listForDate: (orgId: string, date: Date): Promise<AiUsage[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(aiUsage)
        .where(and(eq(aiUsage.organizationId, orgId), eq(aiUsage.date, date))),
    ),
};

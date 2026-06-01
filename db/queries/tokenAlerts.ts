import { eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { tokenAlerts } from '../schema';

export type TokenAlert = InferSelectModel<typeof tokenAlerts>;
export type NewTokenAlert = Omit<InferInsertModel<typeof tokenAlerts>, 'organizationId'>;

export const tokenAlertsRepo = {
  listByPage: (orgId: string, pageId: string): Promise<TokenAlert[]> =>
    withOrg(orgId, (tx) =>
      tx.select().from(tokenAlerts).where(eq(tokenAlerts.pageId, pageId)),
    ),

  create: (orgId: string, data: NewTokenAlert): Promise<TokenAlert> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(tokenAlerts)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('tokenAlerts.create: insert returned no row');
      return row;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(tokenAlerts).where(eq(tokenAlerts.id, id));
    }),
};

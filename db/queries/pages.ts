import { eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { pages } from '../schema';

export type Page = InferSelectModel<typeof pages>;
export type NewPage = Omit<InferInsertModel<typeof pages>, 'organizationId'>;

/**
 * Pages repository. `orgId` is the first arg of every method and drives RLS;
 * isolation is enforced by Postgres, not by these queries.
 */
export const pagesRepo = {
  list: (orgId: string, opts: { limit?: number } = {}): Promise<Page[]> =>
    withOrg(orgId, (tx) => tx.select().from(pages).limit(opts.limit ?? 200)), // bounded (review M3)

  findById: (orgId: string, id: string): Promise<Page | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx.select().from(pages).where(eq(pages.id, id)).limit(1);
      return row ?? null;
    }),

  create: (orgId: string, data: NewPage): Promise<Page> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(pages)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('pages.create: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewPage>): Promise<Page | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(pages)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(pages.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(pages).where(eq(pages.id, id));
    }),
};

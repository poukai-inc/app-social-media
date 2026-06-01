import { eq, desc } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { posts } from '../schema';

export type Post = InferSelectModel<typeof posts>;
export type NewPost = Omit<InferInsertModel<typeof posts>, 'organizationId'>;

export const postsRepo = {
  list: (orgId: string, opts: { limit?: number; offset?: number } = {}): Promise<Post[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(posts)
        .orderBy(desc(posts.createdAt))
        .limit(opts.limit ?? 100)
        .offset(opts.offset ?? 0),
    ),

  listByUser: (orgId: string, userId: string, limit = 100): Promise<Post[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(posts)
        .where(eq(posts.userId, userId))
        .orderBy(desc(posts.createdAt))
        .limit(limit),
    ),

  findById: (orgId: string, id: string): Promise<Post | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx.select().from(posts).where(eq(posts.id, id)).limit(1);
      return row ?? null;
    }),

  create: (orgId: string, data: NewPost): Promise<Post> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(posts)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('posts.create: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewPost>): Promise<Post | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(posts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(posts.id, id))
        .returning();
      return row ?? null;
    }),

  listByStatus: (orgId: string, status: Post['status'], limit = 100): Promise<Post[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(posts)
        .where(eq(posts.status, status))
        .orderBy(desc(posts.scheduledFor))
        .limit(limit),
    ),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(posts).where(eq(posts.id, id));
    }),
};

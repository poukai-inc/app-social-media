import { eq, desc, inArray } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { commentReplies } from '../schema';

export type CommentReply = InferSelectModel<typeof commentReplies>;
export type NewCommentReply = Omit<InferInsertModel<typeof commentReplies>, 'organizationId'>;

export const commentRepliesRepo = {
  list: (orgId: string, opts: { limit?: number } = {}): Promise<CommentReply[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(commentReplies)
        .orderBy(desc(commentReplies.createdAt))
        .limit(opts.limit ?? 100),
    ),

  findById: (orgId: string, id: string): Promise<CommentReply | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(commentReplies)
        .where(eq(commentReplies.id, id))
        .limit(1);
      return row ?? null;
    }),

  findByCommentUrn: (orgId: string, commentUrn: string): Promise<CommentReply | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(commentReplies)
        .where(eq(commentReplies.commentUrn, commentUrn))
        .limit(1);
      return row ?? null;
    }),

  existingUrns: (orgId: string, urns: string[]): Promise<Set<string>> =>
    withOrg(orgId, async (tx) => {
      if (urns.length === 0) return new Set<string>();
      const rows = await tx
        .select({ commentUrn: commentReplies.commentUrn })
        .from(commentReplies)
        .where(inArray(commentReplies.commentUrn, urns));
      return new Set(rows.map((r) => r.commentUrn));
    }),

  create: (orgId: string, data: NewCommentReply): Promise<CommentReply> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(commentReplies)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('commentReplies.create: insert returned no row');
      return row;
    }),

  update: (orgId: string, id: string, data: Partial<NewCommentReply>): Promise<CommentReply | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(commentReplies)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(commentReplies.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(commentReplies).where(eq(commentReplies.id, id));
    }),
};

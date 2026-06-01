import { eq, and } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg } from '../tenant';
import { commentSuggestions } from '../schema';

export type CommentSuggestion = InferSelectModel<typeof commentSuggestions>;
export type NewCommentSuggestion = Omit<InferInsertModel<typeof commentSuggestions>, 'organizationId'>;

export const commentSuggestionsRepo = {
  listByUserStatus: (
    orgId: string,
    userId: string,
    status: CommentSuggestion['status'],
  ): Promise<CommentSuggestion[]> =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(commentSuggestions)
        .where(and(eq(commentSuggestions.userId, userId), eq(commentSuggestions.status, status))),
    ),

  findById: (orgId: string, id: string): Promise<CommentSuggestion | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(commentSuggestions)
        .where(eq(commentSuggestions.id, id))
        .limit(1);
      return row ?? null;
    }),

  create: (orgId: string, data: NewCommentSuggestion): Promise<CommentSuggestion> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(commentSuggestions)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('commentSuggestions.create: insert returned no row');
      return row;
    }),

  update: (
    orgId: string,
    id: string,
    data: Partial<NewCommentSuggestion>,
  ): Promise<CommentSuggestion | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(commentSuggestions)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(commentSuggestions.id, id))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, id: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(commentSuggestions).where(eq(commentSuggestions.id, id));
    }),
};

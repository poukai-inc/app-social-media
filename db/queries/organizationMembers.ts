import { eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { withOrg, withUser } from '../tenant';
import { organizationMembers } from '../schema';

export type OrganizationMember = InferSelectModel<typeof organizationMembers>;
export type NewOrganizationMember = Omit<InferInsertModel<typeof organizationMembers>, 'organizationId'>;

export const organizationMembersRepo = {
  /** Members of the active org. */
  list: (orgId: string): Promise<OrganizationMember[]> =>
    withOrg(orgId, (tx) => tx.select().from(organizationMembers)),

  /** The caller's own memberships (bootstrap, no active org). */
  listForUser: (userId: string): Promise<OrganizationMember[]> =>
    withUser(userId, (tx) =>
      tx.select().from(organizationMembers).where(eq(organizationMembers.userId, userId)),
    ),

  add: (orgId: string, data: NewOrganizationMember): Promise<OrganizationMember> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .insert(organizationMembers)
        .values({ ...data, organizationId: orgId })
        .returning();
      if (!row) throw new Error('organizationMembers.add: insert returned no row');
      return row;
    }),

  setRole: (orgId: string, userId: string, role: OrganizationMember['role']): Promise<OrganizationMember | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(organizationMembers)
        .set({ role })
        .where(eq(organizationMembers.userId, userId))
        .returning();
      return row ?? null;
    }),

  remove: (orgId: string, userId: string): Promise<void> =>
    withOrg(orgId, async (tx) => {
      await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId));
    }),
};

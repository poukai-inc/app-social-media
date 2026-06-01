import { eq, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '../index';
import { withOrg, withUser } from '../tenant';
import { organizations, organizationMembers } from '../schema';

export type Organization = InferSelectModel<typeof organizations>;

export const organizationsRepo = {
  /**
   * Create an org + its owner membership atomically via the SECURITY DEFINER
   * bootstrap function (#23 migration 0002). Returns the new org id.
   */
  create: async (name: string, slug: string, ownerUserId: string): Promise<string> => {
    const result = await db.execute<{ id: string }>(
      sql`select create_organization(${name}, ${slug}, ${ownerUserId}) as id`,
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('organizations.create: function returned no id');
    return id;
  },

  /** The org the caller has active. */
  findById: (orgId: string): Promise<Organization | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      return row ?? null;
    }),

  update: (orgId: string, data: Partial<Pick<Organization, 'name' | 'notificationChannels'>>): Promise<Organization | null> =>
    withOrg(orgId, async (tx) => {
      const [row] = await tx
        .update(organizations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning();
      return row ?? null;
    }),

  /** Membership bootstrap — the orgs a user belongs to (org picker / signin). */
  listForUser: (userId: string): Promise<Organization[]> =>
    withUser(userId, (tx) =>
      tx
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          notificationChannels: organizations.notificationChannels,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        })
        .from(organizations)
        .innerJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id))
        .where(eq(organizationMembers.userId, userId)),
    ),
};

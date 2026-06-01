import { sql } from 'drizzle-orm';
import { db } from './index';

/**
 * Tenant-scoped data access (BACKLOG #23).
 *
 * Every tenant query runs inside `withOrg(orgId, fn)`, which opens a
 * transaction and sets the `app.current_org_id` GUC for its duration. The RLS
 * policies (#22) then restrict every row to that org — isolation is enforced by
 * Postgres, so a repository method physically cannot read or write another
 * tenant's data even if a query forgets an org filter.
 */

/** The drizzle transaction handle passed to `withOrg` callbacks. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // Transaction-local (third arg `true`) — reset automatically at commit/rollback.
    await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * Membership bootstrap: run a query under `app.current_user_id` (no org chosen
 * yet) so the user can resolve which orgs they belong to. Backed by the
 * member_self_read / member_orgs_read policies (#23 migration 0002).
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx);
  });
}

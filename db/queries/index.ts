/**
 * Tenant-scoped repository layer (BACKLOG #23).
 *
 * Every data-plane method takes `orgId` as its first argument and runs under
 * `withOrg`, so Postgres RLS (#22) enforces isolation. Identity/bootstrap reads
 * (`organizationsRepo.listForUser`, `organizationMembersRepo.listForUser`) run
 * under `withUser`. Org creation goes through the SECURITY DEFINER bootstrap fn.
 */
export { withOrg, withUser, type Tx } from '../tenant';

export * from './organizations';
export * from './organizationMembers';
export * from './pages';
export * from './posts';
export * from './engagementTargets';
export * from './commentReplies';
export * from './engagementSettings';
export * from './icpEngagements';
export * from './engagementHistory';
export * from './aiUsage';
export * from './tokenAlerts';
export * from './commentSuggestions';
export * from './pendingConnections';
export * from './notifications';

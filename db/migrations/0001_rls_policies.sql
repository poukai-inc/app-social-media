-- Row-Level Security: tenant isolation (BACKLOG #22).
--
-- The repository layer (#23) runs `SET LOCAL app.current_org_id = '<uuid>'`
-- inside each request's transaction. Every tenant table only exposes rows whose
-- organization_id matches that setting; INSERT/UPDATE are also constrained so a
-- row can never be written into another org. With the setting UNSET,
-- current_setting(..., true) returns NULL and the predicate denies all rows —
-- fail-closed by default.
--
-- FORCE ROW LEVEL SECURITY makes the policies apply even to the table owner
-- (the app connects as the owner role), which plain ENABLE does not.

-- Helper: the active org for the current transaction, or NULL if unset.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- ---- Strict tenant tables (organization_id NOT NULL) ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organization_members',
    'pages',
    'posts',
    'engagement_targets',
    'comment_replies',
    'engagement_settings',
    'icp_engagements',
    'engagement_history',
    'token_alerts',
    'comment_suggestions',
    'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (organization_id = current_org_id()) '
      || 'WITH CHECK (organization_id = current_org_id());', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---- Tables whose organization_id is NULLABLE (system / user-scoped rows) ----
-- ai_usage: NULL org = global/system usage; pending_connections: short-lived
-- OAuth handoff keyed by user before an org may be assigned. Allow the active
-- org's rows AND NULL-org rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_usage', 'pending_connections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (organization_id IS NULL OR organization_id = current_org_id()) '
      || 'WITH CHECK (organization_id IS NULL OR organization_id = current_org_id());', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---- organizations: only the active org is visible ----
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations
  USING (id = current_org_id())
  WITH CHECK (id = current_org_id());
--> statement-breakpoint

-- NOTE: users / accounts / sessions / verification_tokens are cross-tenant
-- identity tables (no organization_id) and are intentionally NOT under org RLS.
-- Access to them is gated at the application/auth layer.

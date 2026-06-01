-- Membership bootstrap RLS (BACKLOG #23).
--
-- Before a user selects an active org, the app must resolve WHICH orgs they
-- belong to. That read can't use app.current_org_id (none is chosen yet), so it
-- runs under a second GUC, app.current_user_id, set by `withUser(userId, …)`.
-- These additional policies are OR'd with the existing org-scoped ones, so they
-- only widen visibility to the caller's own memberships — never another user's.

CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- A user can read their own membership rows regardless of active org.
CREATE POLICY member_self_read ON organization_members
  FOR SELECT
  USING (user_id = current_user_id());
--> statement-breakpoint

-- A user can read the organizations they are a member of (for the org picker).
CREATE POLICY member_orgs_read ON organizations
  FOR SELECT
  USING (id IN (SELECT organization_id FROM organization_members WHERE user_id = current_user_id()));
--> statement-breakpoint

-- Org creation can't satisfy its own org-scoped WITH CHECK (no org exists yet),
-- so it runs through a SECURITY DEFINER function that creates the org and its
-- owner membership atomically. The function executes with the privileges of its
-- owner (the migration/bootstrap role), bypassing the per-row policies. The
-- app calls this for the first-boot wizard / signup (#30).
CREATE OR REPLACE FUNCTION create_organization(p_name text, p_slug text, p_owner uuid)
  RETURNS uuid
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO organizations (name, slug) VALUES (p_name, p_slug) RETURNING id INTO new_id;
  INSERT INTO organization_members (organization_id, user_id, role) VALUES (new_id, p_owner, 'owner');
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

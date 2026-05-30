/**
 * Page-ownership authorization helpers.
 *
 * Tenant data (Pages and everything scoped by `pageId` — ICP engagements,
 * conversations, learning insights) must only be reachable by the user who
 * owns the Page. Resolving a record by id alone (`findById`) is a cross-tenant
 * IDOR. These helpers enforce `Page.userId === <session user>` consistently.
 *
 * See SECURITY: BACKLOG #125 (AUDIT2-H1) / GitHub issue #17.
 */

import mongoose from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import Page from './models/Page';
import type { IPage } from './models/Page';
import User from './models/User';

/** Minimal shape of the auth() session we depend on. */
export interface SessionLike {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
}

/**
 * Resolve the authenticated user's Mongo `_id` from a session.
 * Supports sessions that carry `user.id` directly and those that only carry
 * `user.email` (resolved via the User collection). Returns null when neither
 * yields a user.
 */
async function resolveUserId(
  session: SessionLike | null
): Promise<mongoose.Types.ObjectId | null> {
  const id = session?.user?.id;
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }

  const email = session?.user?.email;
  if (email) {
    const user = await User.findOne({ email }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
    return user?._id ?? null;
  }

  return null;
}

/**
 * Return the Page document for `pageId` only if it belongs to the session user.
 * Returns null when the page does not exist, the id is malformed, the session
 * cannot be resolved, or the page is owned by someone else — callers should map
 * null to 404 (never distinguish "not found" from "not yours").
 */
export async function findOwnedPage(
  session: SessionLike | null,
  pageId: string | null | undefined
): Promise<HydratedDocument<IPage> | null> {
  if (!pageId || !mongoose.Types.ObjectId.isValid(pageId)) {
    return null;
  }
  const userId = await resolveUserId(session);
  if (!userId) {
    return null;
  }
  return Page.findOne({ _id: pageId, userId });
}

/**
 * Boolean ownership check (lean, no full document fetch). Use when the page
 * document itself is not needed.
 */
export async function userOwnsPage(
  session: SessionLike | null,
  pageId: string | mongoose.Types.ObjectId | null | undefined
): Promise<boolean> {
  if (!pageId) {
    return false;
  }
  const id = pageId.toString();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return false;
  }
  const userId = await resolveUserId(session);
  if (!userId) {
    return false;
  }
  const page = await Page.findOne({ _id: id, userId }).select('_id').lean();
  return Boolean(page);
}

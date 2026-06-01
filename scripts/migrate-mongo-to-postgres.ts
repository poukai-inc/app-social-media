/**
 * Mongo → Postgres backfill (BACKLOG #24).
 *
 * Non-destructive, idempotent: reads from Mongo and writes to Postgres. Safe to
 * re-run — every row's PK is a DETERMINISTIC uuidv5 of its Mongo ObjectId, and
 * all inserts use ON CONFLICT DO NOTHING.
 *
 * Multi-tenancy bootstrap: the current data has no organizations, so each User
 * becomes the OWNER of their own Organization. Every tenant row's
 * organization_id is derived from its owning user (directly, or via its page).
 *
 * Runs as a PRIVILEGED Postgres role (superuser / BYPASSRLS): it writes across
 * all orgs in one pass, so RLS must not apply. Set DATABASE_URL to that role.
 *
 * Usage:  MONGODB_URI=... DATABASE_URL=... npx tsx scripts/migrate-mongo-to-postgres.ts
 */
import { v5 as uuidv5 } from 'uuid';
import type { Types } from 'mongoose';
import mongoose from 'mongoose';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import { EngagementTarget, CommentReply, EngagementSettings } from '@/lib/models/Engagement';
import ICPEngagement from '@/lib/models/ICPEngagement';
import EngagementHistory from '@/lib/models/EngagementHistory';
import AIUsage from '@/lib/models/AIUsage';
import TokenAlert from '@/lib/models/TokenAlert';
import CommentSuggestion from '@/lib/models/CommentSuggestion';
import * as schema from '@/db/schema';

// Stable namespace for deterministic uuidv5 (do not change — re-runs depend on it).
const NS = '1b671a64-40d5-491e-99b0-da01ff1f3341';

type Oid = Types.ObjectId | string;
const oidToUuid = (oid: Oid): string => uuidv5(String(oid), NS);
const orgIdForUser = (userOid: Oid): string => uuidv5(`org:${String(userOid)}`, NS);

/** Drop undefined-valued keys so they don't clash with NOT-NULL defaults. */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface MigrationCounts {
  organizations: number;
  users: number;
  pages: number;
  posts: number;
  engagementTargets: number;
  commentReplies: number;
  engagementSettings: number;
  icpEngagements: number;
  engagementHistory: number;
  aiUsage: number;
  tokenAlerts: number;
  commentSuggestions: number;
}

export async function migrate(db: Db): Promise<MigrationCounts> {
  const counts: MigrationCounts = {
    organizations: 0, users: 0, pages: 0, posts: 0, engagementTargets: 0,
    commentReplies: 0, engagementSettings: 0, icpEngagements: 0,
    engagementHistory: 0, aiUsage: 0, tokenAlerts: 0, commentSuggestions: 0,
  };

  // --- users -> users + one organization (owner) per user ---
  const users = await User.find({}).lean();
  // pageId -> orgId, for tables that only carry a pageId.
  const pageOrg = new Map<string, string>();
  for (const u of users) {
    const userId = oidToUuid(u._id);
    const orgId = orgIdForUser(u._id);
    await db.insert(schema.organizations).values({
      id: orgId,
      name: u.name ? `${u.name}'s workspace` : u.email,
      slug: `org-${String(u._id).slice(-12)}`,
    }).onConflictDoNothing();
    counts.organizations += 1;

    await db.insert(schema.users).values(defined({
      id: userId,
      name: u.name,
      email: u.email,
      image: u.image,
      linkedinId: u.linkedinId,
      linkedinAccessToken: u.linkedinAccessToken,
      linkedinAccessTokenExpires: u.linkedinAccessTokenExpires,
      defaultPostAs: u.defaultPostAs ?? 'person',
    }) as typeof schema.users.$inferInsert).onConflictDoNothing();
    counts.users += 1;

    await db.insert(schema.organizationMembers).values({
      id: uuidv5(`member:${String(u._id)}`, NS),
      organizationId: orgId,
      userId,
      role: 'owner',
    }).onConflictDoNothing();
  }

  // --- pages ---
  const pages = await Page.find({}).lean();
  for (const p of pages) {
    const orgId = orgIdForUser(p.userId);
    const id = oidToUuid(p._id);
    pageOrg.set(id, orgId);
    await db.insert(schema.pages).values(defined({
      id,
      organizationId: orgId,
      userId: oidToUuid(p.userId),
      name: p.name,
      description: p.description,
      avatar: p.avatar,
      connections: p.connections ?? [],
      contentStrategy: p.contentStrategy,
      contentSources: p.contentSources ?? {},
      dataSources: p.dataSources ?? { databases: [] },
      schedule: p.schedule,
      publishTo: p.publishTo ?? { platforms: [], adaptContent: true },
      stats: p.stats ?? {},
      pageType: p.pageType ?? 'personal',
      isActive: p.isActive ?? true,
      isSetupComplete: p.isSetupComplete ?? false,
      isManual: p.isManual ?? false,
    }) as typeof schema.pages.$inferInsert).onConflictDoNothing();
    counts.pages += 1;
  }

  // --- posts ---
  const posts = await Post.find({}).lean();
  for (const p of posts) {
    await db.insert(schema.posts).values(defined({
      id: oidToUuid(p._id),
      organizationId: orgIdForUser(p.userId),
      userId: oidToUuid(p.userId),
      pageId: p.pageId ? oidToUuid(p.pageId) : undefined,
      mode: p.mode,
      content: p.content,
      generatedContent: p.generatedContent,
      structuredInput: p.structuredInput,
      aiPrompt: p.aiPrompt,
      media: p.media ?? [],
      scheduledFor: p.scheduledFor,
      publishedAt: p.publishedAt,
      status: p.status,
      publishStartedAt: p.publishStartedAt,
      error: p.error,
      postAs: p.postAs ?? 'person',
      organizationName: p.organizationName,
      aiAnalysis: p.aiAnalysis,
      approval: p.approval,
      requiresApproval: p.requiresApproval ?? false,
      includesLink: p.includesLink ?? false,
      linkUrl: p.linkUrl,
      blogSource: p.blogSource,
      sourceContent: p.sourceContent,
      performance: p.performance,
      outcomeRating: p.outcomeRating,
      targetPlatforms: p.targetPlatforms ?? [],
      platformContent: p.platformContent,
      platformResults: p.platformResults,
      learningMetadata: p.learningMetadata,
      aiReview: p.aiReview,
    }) as typeof schema.posts.$inferInsert).onConflictDoNothing();
    counts.posts += 1;
  }

  // --- engagement_targets ---
  for (const e of await EngagementTarget.find({}).lean()) {
    await db.insert(schema.engagementTargets).values(defined({
      id: oidToUuid(e._id),
      organizationId: orgIdForUser(e.userId),
      userId: oidToUuid(e.userId),
      postUrl: e.postUrl,
      postUrn: e.postUrn,
      postAuthor: e.postAuthor,
      postContent: e.postContent,
      engagementType: e.engagementType ?? 'both',
      aiGeneratedComment: e.aiGeneratedComment,
      userEditedComment: e.userEditedComment,
      status: e.status,
      scheduledFor: e.scheduledFor,
      engagedAt: e.engagedAt,
      error: e.error,
    }) as typeof schema.engagementTargets.$inferInsert).onConflictDoNothing();
    counts.engagementTargets += 1;
  }

  // --- comment_replies ---
  for (const c of await CommentReply.find({}).lean()) {
    await db.insert(schema.commentReplies).values(defined({
      id: oidToUuid(c._id),
      organizationId: orgIdForUser(c.userId),
      userId: oidToUuid(c.userId),
      postId: c.postId ? oidToUuid(c.postId) : undefined,
      linkedinPostUrn: c.linkedinPostUrn,
      commentUrn: c.commentUrn,
      commenterName: c.commenterName,
      commenterProfileUrl: c.commenterProfileUrl,
      commentText: c.commentText,
      aiGeneratedReply: c.aiGeneratedReply,
      userEditedReply: c.userEditedReply,
      status: c.status,
      repliedAt: c.repliedAt,
      error: c.error,
    }) as typeof schema.commentReplies.$inferInsert).onConflictDoNothing();
    counts.commentReplies += 1;
  }

  // --- engagement_settings ---
  for (const s of await EngagementSettings.find({}).lean()) {
    await db.insert(schema.engagementSettings).values({
      id: oidToUuid(s._id),
      organizationId: orgIdForUser(s.userId),
      userId: oidToUuid(s.userId),
      autoReplyEnabled: s.autoReplyEnabled ?? false,
      autoEngageEnabled: s.autoEngageEnabled ?? false,
      requireApproval: s.requireApproval ?? true,
      dailyEngagementLimit: s.dailyEngagementLimit ?? 20,
      dailyReplyLimit: s.dailyReplyLimit ?? 30,
      engagementDelay: s.engagementDelay ?? 15,
      engagementStyle: s.engagementStyle ?? 'professional',
    }).onConflictDoNothing();
    counts.engagementSettings += 1;
  }

  // --- icp_engagements (org via the page's owner) ---
  for (const i of await ICPEngagement.find({}).lean()) {
    const pageUuid = oidToUuid(i.pageId);
    const orgId = pageOrg.get(pageUuid);
    if (!orgId) continue; // orphan page reference — skip
    await db.insert(schema.icpEngagements).values(defined({
      id: oidToUuid(i._id),
      organizationId: orgId,
      pageId: pageUuid,
      platform: i.platform,
      targetPost: i.targetPost,
      targetUser: i.targetUser,
      ourReply: i.ourReply,
      icpMatch: i.icpMatch,
      status: i.status,
      followUp: i.followUp,
      conversation: i.conversation,
      engagedAt: i.engagedAt,
    }) as typeof schema.icpEngagements.$inferInsert).onConflictDoNothing();
    counts.icpEngagements += 1;
  }

  // --- engagement_history ---
  for (const h of await EngagementHistory.find({}).lean()) {
    await db.insert(schema.engagementHistory).values(defined({
      id: oidToUuid(h._id),
      organizationId: orgIdForUser(h.userId),
      postId: oidToUuid(h.postId),
      pageId: oidToUuid(h.pageId),
      userId: oidToUuid(h.userId),
      contentMetadata: h.contentMetadata,
      platforms: h.platforms ?? [],
      aggregateStats: h.aggregateStats,
      isProcessedForLearning: h.isProcessedForLearning ?? false,
      learningProcessedAt: h.learningProcessedAt,
    }) as typeof schema.engagementHistory.$inferInsert).onConflictDoNothing();
    counts.engagementHistory += 1;
  }

  // --- ai_usage (global / no org) ---
  for (const a of await AIUsage.find({}).lean()) {
    await db.insert(schema.aiUsage).values(defined({
      id: oidToUuid(a._id),
      date: a.date,
      modelName: a.modelName,
      tokensUsed: a.tokensUsed ?? 0,
      requestCount: a.requestCount ?? 0,
      minuteUsage: a.minuteUsage ?? [],
      rateLimitHits: a.rateLimitHits ?? 0,
      errorCount: a.errorCount ?? 0,
      lastUpdated: a.lastUpdated,
    }) as typeof schema.aiUsage.$inferInsert).onConflictDoNothing();
    counts.aiUsage += 1;
  }

  // --- token_alerts ---
  for (const t of await TokenAlert.find({}).lean()) {
    await db.insert(schema.tokenAlerts).values(defined({
      id: oidToUuid(t._id),
      organizationId: orgIdForUser(t.userId),
      pageId: oidToUuid(t.pageId),
      userId: oidToUuid(t.userId),
      platform: t.platform,
      platformId: t.platformId,
      alertType: t.alertType,
      tokenExpiresAt: t.tokenExpiresAt,
      refreshAttempted: t.refreshAttempted ?? false,
      refreshSucceeded: t.refreshSucceeded ?? false,
      refreshError: t.refreshError,
      emailSent: t.emailSent ?? false,
      emailError: t.emailError,
      hoursUntilExpiry: t.hoursUntilExpiry,
      alertedAt: t.alertedAt,
    }) as typeof schema.tokenAlerts.$inferInsert).onConflictDoNothing();
    counts.tokenAlerts += 1;
  }

  // --- comment_suggestions ---
  for (const c of await CommentSuggestion.find({}).lean()) {
    await db.insert(schema.commentSuggestions).values(defined({
      id: oidToUuid(c._id),
      organizationId: orgIdForUser(c.userId),
      userId: oidToUuid(c.userId),
      linkedinPostUrl: c.linkedinPostUrl,
      linkedinPostUrn: c.linkedinPostUrn,
      postAuthor: c.postAuthor,
      postAuthorHeadline: c.postAuthorHeadline,
      postContent: c.postContent,
      postContentSnippet: c.postContentSnippet,
      suggestedComment: c.suggestedComment,
      alternativeComments: c.alternativeComments,
      editedComment: c.editedComment,
      relevanceScore: c.relevanceScore,
      engagementPotential: c.engagementPotential,
      style: c.style,
      status: c.status,
      source: c.source,
      postedAt: c.postedAt,
      skippedReason: c.skippedReason,
    }) as typeof schema.commentSuggestions.$inferInsert).onConflictDoNothing();
    counts.commentSuggestions += 1;
  }

  return counts;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await connectToDatabase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    const counts = await migrate(db);
    console.log('Migration complete:', counts);
  } finally {
    await pool.end();
    await mongoose.disconnect();
  }
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('migrate-mongo-to-postgres')) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

/**
 * Drizzle schema — Postgres target for the Mongo→Postgres migration.
 *
 * Design (per decisions/0002-database.md):
 * - Postgres 16 + Drizzle ORM.
 * - **Multi-tenancy**: every tenant-owned table carries `organization_id`
 *   (FK → organizations). RLS policies enforcing isolation are added in a
 *   separate migration (BACKLOG #22).
 * - Nested Mongo sub-documents/arrays are stored as `jsonb` for the first cut;
 *   normalize later only where query patterns demand it. `$type<…>()` gives the
 *   app layer (repository layer, #23) compile-time shapes without changing SQL.
 * - NextAuth adapter tables (accounts/sessions/verification_tokens) are included
 *   so the `@auth/drizzle-adapter` swap (#26) is a wiring change, not a schema one.
 *
 * BACKLOG #21.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

import type {
  IPlatformConnection,
  ContentStrategy,
  ContentSources,
  DataSources,
  PostingSchedule,
  PageStats,
} from '@/lib/models/Page';
import type {
  MediaItem,
  StructuredInput,
  AIAnalysis,
  ApprovalInfo,
  BlogSource,
  SourceContent,
  PostPerformance,
  PlatformContent,
  PlatformPublishResult,
} from '@/lib/models/Post';
import type { PlatformEngagement } from '@/lib/models/EngagementHistory';
import type { PlatformType } from '@/lib/platforms/types';

// ============================================================================
// Enums
// ============================================================================
export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member']);
export const pageType = pgEnum('page_type', ['personal', 'organization', 'manual']);
export const postAs = pgEnum('post_as', ['person', 'organization']);
export const postMode = pgEnum('post_mode', ['manual', 'structured', 'ai', 'blog_repurpose']);
export const postStatus = pgEnum('post_status', [
  'draft',
  'pending_approval',
  'scheduled',
  'published',
  'partially_published',
  'failed',
  'rejected',
]);
export const outcomeRating = pgEnum('outcome_rating', ['poor', 'average', 'good', 'excellent']);
export const engagementType = pgEnum('engagement_type', ['like', 'comment', 'both']);
export const engagementStatus = pgEnum('engagement_status', [
  'pending',
  'approved',
  'engaged',
  'failed',
  'skipped',
]);
export const replyStatus = pgEnum('reply_status', ['pending', 'approved', 'replied', 'skipped', 'failed']);
export const engagementStyle = pgEnum('engagement_style', ['professional', 'casual', 'friendly', 'thoughtful']);
export const icpPlatform = pgEnum('icp_platform', ['twitter', 'linkedin']);
export const icpStatus = pgEnum('icp_status', [
  'sent',
  'got_reply',
  'got_like',
  'got_follow',
  'conversation',
  'ignored',
]);
export const commentStatus = pgEnum('comment_status', ['pending', 'approved', 'posted', 'skipped']);
export const commentSource = pgEnum('comment_source', ['feed', 'target_profile', 'engagement_reply']);
export const engagementPotential = pgEnum('engagement_potential', ['low', 'medium', 'high']);
export const tokenAlertType = pgEnum('token_alert_type', ['expiring_soon', 'expired', 'refresh_failed']);
export const tokenAlertPlatform = pgEnum('token_alert_platform', ['twitter', 'facebook', 'linkedin']);

// ============================================================================
// Tenancy + identity
// ============================================================================
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  notificationChannels: jsonb('notification_channels').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  linkedinId: text('linkedin_id'),
  linkedinAccessToken: text('linkedin_access_token'),
  linkedinAccessTokenExpires: timestamp('linkedin_access_token_expires', { withTimezone: true }),
  linkedinOrganizations: jsonb('linkedin_organizations').$type<unknown[]>().notNull().default([]),
  defaultPostAs: postAs('default_post_as').notNull().default('person'),
  defaultOrganizationId: text('default_organization_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('org_members_org_user_uq').on(t.organizationId, t.userId),
    index('org_members_user_idx').on(t.userId),
  ],
);

// ---- NextAuth (@auth/drizzle-adapter) tables — wired in #26 ----
export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ============================================================================
// Core tenant tables
// ============================================================================
export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    avatar: text('avatar'),
    connections: jsonb('connections').$type<IPlatformConnection[]>().notNull().default([]),
    contentStrategy: jsonb('content_strategy').$type<ContentStrategy>().notNull(),
    contentSources: jsonb('content_sources').$type<ContentSources>().notNull().default({} as ContentSources),
    dataSources: jsonb('data_sources').$type<DataSources>().notNull().default({ databases: [] } as unknown as DataSources),
    schedule: jsonb('schedule').$type<PostingSchedule>().notNull(),
    publishTo: jsonb('publish_to').$type<{ platforms: PlatformType[]; adaptContent: boolean }>().notNull(),
    stats: jsonb('stats').$type<PageStats>().notNull().default({} as PageStats),
    pageType: pageType('page_type').notNull().default('personal'),
    isActive: boolean('is_active').notNull().default(true),
    isSetupComplete: boolean('is_setup_complete').notNull().default(false),
    isManual: boolean('is_manual').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pages_org_idx').on(t.organizationId),
    index('pages_user_idx').on(t.userId),
    index('pages_org_active_idx').on(t.organizationId, t.isActive),
  ],
);

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    mode: postMode('mode').notNull().default('manual'),
    content: text('content').notNull(),
    generatedContent: text('generated_content'),
    structuredInput: jsonb('structured_input').$type<StructuredInput>(),
    aiPrompt: text('ai_prompt'),
    media: jsonb('media').$type<MediaItem[]>().notNull().default([]),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    status: postStatus('status').notNull().default('draft'),
    // Concurrency claim marker for the publish cron (BACKLOG #124).
    publishStartedAt: timestamp('publish_started_at', { withTimezone: true }),
    error: text('error'),
    postAs: postAs('post_as').notNull().default('person'),
    organizationName: text('organization_name'),
    aiAnalysis: jsonb('ai_analysis').$type<AIAnalysis>(),
    approval: jsonb('approval').$type<ApprovalInfo>(),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    includesLink: boolean('includes_link').notNull().default(false),
    linkUrl: text('link_url'),
    blogSource: jsonb('blog_source').$type<BlogSource>(),
    sourceContent: jsonb('source_content').$type<SourceContent>(),
    performance: jsonb('performance').$type<PostPerformance>(),
    outcomeRating: outcomeRating('outcome_rating'),
    targetPlatforms: jsonb('target_platforms').$type<PlatformType[]>().notNull().default([]),
    platformContent: jsonb('platform_content').$type<PlatformContent[]>(),
    platformResults: jsonb('platform_results').$type<PlatformPublishResult[]>(),
    learningMetadata: jsonb('learning_metadata').$type<Record<string, unknown>>(),
    aiReview: jsonb('ai_review').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('posts_org_idx').on(t.organizationId),
    index('posts_user_created_idx').on(t.userId, t.createdAt),
    index('posts_user_status_published_idx').on(t.userId, t.status, t.publishedAt),
    index('posts_page_status_created_idx').on(t.pageId, t.status, t.createdAt),
    index('posts_status_scheduled_idx').on(t.status, t.scheduledFor),
  ],
);

export const engagementTargets = pgTable(
  'engagement_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postUrl: text('post_url').notNull(),
    postUrn: text('post_urn'),
    postAuthor: text('post_author'),
    postContent: text('post_content'),
    engagementType: engagementType('engagement_type').notNull().default('both'),
    aiGeneratedComment: text('ai_generated_comment'),
    userEditedComment: text('user_edited_comment'),
    status: engagementStatus('status').notNull().default('pending'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    engagedAt: timestamp('engaged_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('eng_targets_org_idx').on(t.organizationId),
    index('eng_targets_user_status_idx').on(t.userId, t.status),
    index('eng_targets_status_scheduled_user_idx').on(t.status, t.scheduledFor, t.userId),
  ],
);

export const commentReplies = pgTable(
  'comment_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
    linkedinPostUrn: text('linkedin_post_urn').notNull(),
    commentUrn: text('comment_urn').notNull().unique(),
    commenterName: text('commenter_name').notNull(),
    commenterProfileUrl: text('commenter_profile_url'),
    commentText: text('comment_text').notNull(),
    aiGeneratedReply: text('ai_generated_reply'),
    userEditedReply: text('user_edited_reply'),
    status: replyStatus('status').notNull().default('pending'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comment_replies_org_idx').on(t.organizationId),
    index('comment_replies_user_status_idx').on(t.userId, t.status),
  ],
);

export const engagementSettings = pgTable(
  'engagement_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    autoReplyEnabled: boolean('auto_reply_enabled').notNull().default(false),
    autoEngageEnabled: boolean('auto_engage_enabled').notNull().default(false),
    requireApproval: boolean('require_approval').notNull().default(true),
    dailyEngagementLimit: integer('daily_engagement_limit').notNull().default(20),
    dailyReplyLimit: integer('daily_reply_limit').notNull().default(30),
    engagementDelay: integer('engagement_delay').notNull().default(15),
    engagementStyle: engagementStyle('engagement_style').notNull().default('professional'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('eng_settings_user_uq').on(t.userId)],
);

export const icpEngagements = pgTable(
  'icp_engagements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    platform: icpPlatform('platform').notNull(),
    targetPost: jsonb('target_post').$type<Record<string, unknown>>().notNull(),
    targetUser: jsonb('target_user').$type<Record<string, unknown>>().notNull(),
    ourReply: jsonb('our_reply').$type<Record<string, unknown>>().notNull(),
    icpMatch: jsonb('icp_match').$type<Record<string, unknown>>().notNull(),
    status: icpStatus('status').notNull().default('sent'),
    followUp: jsonb('follow_up').$type<Record<string, unknown>>(),
    conversation: jsonb('conversation').$type<Record<string, unknown>>(),
    engagedAt: timestamp('engaged_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('icp_org_idx').on(t.organizationId),
    index('icp_page_platform_engaged_idx').on(t.pageId, t.platform, t.engagedAt),
    index('icp_page_status_idx').on(t.pageId, t.status),
  ],
);

export const engagementHistory = pgTable(
  'engagement_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentMetadata: jsonb('content_metadata').$type<Record<string, unknown>>().notNull(),
    platforms: jsonb('platforms').$type<PlatformEngagement[]>().notNull().default([]),
    aggregateStats: jsonb('aggregate_stats').$type<Record<string, unknown>>().notNull(),
    isProcessedForLearning: boolean('is_processed_for_learning').notNull().default(false),
    learningProcessedAt: timestamp('learning_processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('eng_history_org_idx').on(t.organizationId),
    uniqueIndex('eng_history_post_uq').on(t.postId),
    index('eng_history_page_idx').on(t.pageId),
  ],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Per-org usage accounting (BACKLOG #28). Null = global/system usage.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    modelName: text('model_name').notNull(),
    tokensUsed: integer('tokens_used').notNull().default(0),
    requestCount: integer('request_count').notNull().default(0),
    minuteUsage: jsonb('minute_usage').$type<unknown[]>().notNull().default([]),
    rateLimitHits: integer('rate_limit_hits').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ai_usage_org_date_model_uq').on(t.organizationId, t.date, t.modelName)],
);

export const tokenAlerts = pgTable(
  'token_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: tokenAlertPlatform('platform').notNull(),
    platformId: text('platform_id').notNull(),
    alertType: tokenAlertType('alert_type').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    refreshAttempted: boolean('refresh_attempted').notNull().default(false),
    refreshSucceeded: boolean('refresh_succeeded').notNull().default(false),
    refreshError: text('refresh_error'),
    emailSent: boolean('email_sent').notNull().default(false),
    emailError: text('email_error'),
    hoursUntilExpiry: real('hours_until_expiry'),
    alertedAt: timestamp('alerted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('token_alerts_page_idx').on(t.pageId)],
);

export const commentSuggestions = pgTable(
  'comment_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    linkedinPostUrl: text('linkedin_post_url'),
    linkedinPostUrn: text('linkedin_post_urn'),
    postAuthor: text('post_author').notNull(),
    postAuthorHeadline: text('post_author_headline'),
    postContent: text('post_content').notNull(),
    postContentSnippet: text('post_content_snippet').notNull(),
    suggestedComment: text('suggested_comment').notNull(),
    alternativeComments: jsonb('alternative_comments').$type<string[]>(),
    editedComment: text('edited_comment'),
    relevanceScore: real('relevance_score').notNull(),
    engagementPotential: engagementPotential('engagement_potential').notNull(),
    style: engagementStyle('style').notNull(),
    status: commentStatus('status').notNull().default('pending'),
    source: commentSource('source').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    skippedReason: text('skipped_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comment_suggestions_user_status_idx').on(t.userId, t.status)],
);

export const pendingConnections = pgTable(
  'pending_connections',
  {
    // Opaque random key (base64url) — used directly in the redirect (#110).
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pending_conn_user_idx').on(t.userId), index('pending_conn_expires_idx').on(t.expiresAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_org_idx').on(t.organizationId),
    index('notifications_user_read_idx').on(t.userId, t.readAt),
  ],
);

// ============================================================================
// Relations
// ============================================================================
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  pages: many(pages),
  posts: many(posts),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
  pages: many(pages),
  posts: many(posts),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  organization: one(organizations, { fields: [pages.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [pages.userId], references: [users.id] }),
  posts: many(posts),
  icpEngagements: many(icpEngagements),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  organization: one(organizations, { fields: [posts.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [posts.userId], references: [users.id] }),
  page: one(pages, { fields: [posts.pageId], references: [pages.id] }),
}));

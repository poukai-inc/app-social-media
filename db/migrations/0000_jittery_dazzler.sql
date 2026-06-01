CREATE TYPE "public"."comment_source" AS ENUM('feed', 'search', 'manual', 'icp');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('pending', 'approved', 'posted', 'skipped', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."engagement_potential" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('pending', 'approved', 'engaged', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."engagement_style" AS ENUM('professional', 'casual', 'friendly', 'thoughtful');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('like', 'comment', 'both');--> statement-breakpoint
CREATE TYPE "public"."icp_platform" AS ENUM('twitter', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."icp_status" AS ENUM('sent', 'got_reply', 'got_like', 'got_follow', 'conversation', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."outcome_rating" AS ENUM('poor', 'average', 'good', 'excellent');--> statement-breakpoint
CREATE TYPE "public"."page_type" AS ENUM('personal', 'organization', 'manual');--> statement-breakpoint
CREATE TYPE "public"."post_as" AS ENUM('person', 'organization');--> statement-breakpoint
CREATE TYPE "public"."post_mode" AS ENUM('structured', 'freeform', 'ai_generated', 'blog', 'data_source');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'pending_approval', 'scheduled', 'published', 'partially_published', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reply_status" AS ENUM('pending', 'approved', 'replied', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."token_alert_platform" AS ENUM('twitter', 'facebook', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."token_alert_type" AS ENUM('expiring_soon', 'expired', 'refresh_failed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"date" timestamp with time zone NOT NULL,
	"model_name" text NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"minute_usage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rate_limit_hits" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid,
	"linkedin_post_urn" text NOT NULL,
	"comment_urn" text NOT NULL,
	"commenter_name" text NOT NULL,
	"commenter_profile_url" text,
	"comment_text" text NOT NULL,
	"ai_generated_reply" text,
	"user_edited_reply" text,
	"status" "reply_status" DEFAULT 'pending' NOT NULL,
	"replied_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_replies_comment_urn_unique" UNIQUE("comment_urn")
);
--> statement-breakpoint
CREATE TABLE "comment_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"linkedin_post_url" text,
	"linkedin_post_urn" text,
	"post_author" text NOT NULL,
	"post_author_headline" text,
	"post_content" text NOT NULL,
	"post_content_snippet" text NOT NULL,
	"suggested_comment" text NOT NULL,
	"alternative_comments" jsonb,
	"edited_comment" text,
	"relevance_score" real NOT NULL,
	"engagement_potential" "engagement_potential" NOT NULL,
	"style" "engagement_style" NOT NULL,
	"status" "comment_status" DEFAULT 'pending' NOT NULL,
	"source" "comment_source" NOT NULL,
	"posted_at" timestamp with time zone,
	"skipped_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content_metadata" jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aggregate_stats" jsonb NOT NULL,
	"is_processed_for_learning" boolean DEFAULT false NOT NULL,
	"learning_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"auto_engage_enabled" boolean DEFAULT false NOT NULL,
	"require_approval" boolean DEFAULT true NOT NULL,
	"daily_engagement_limit" integer DEFAULT 20 NOT NULL,
	"daily_reply_limit" integer DEFAULT 30 NOT NULL,
	"engagement_delay" integer DEFAULT 15 NOT NULL,
	"engagement_style" "engagement_style" DEFAULT 'professional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"post_url" text NOT NULL,
	"post_urn" text,
	"post_author" text,
	"post_content" text,
	"engagement_type" "engagement_type" DEFAULT 'both' NOT NULL,
	"ai_generated_comment" text,
	"user_edited_comment" text,
	"status" "engagement_status" DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"engaged_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icp_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"platform" "icp_platform" NOT NULL,
	"target_post" jsonb NOT NULL,
	"target_user" jsonb NOT NULL,
	"our_reply" jsonb NOT NULL,
	"icp_match" jsonb NOT NULL,
	"status" "icp_status" DEFAULT 'sent' NOT NULL,
	"follow_up" jsonb,
	"conversation" jsonb,
	"engaged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"notification_channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"avatar" text,
	"connections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_strategy" jsonb NOT NULL,
	"content_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_sources" jsonb DEFAULT '{"databases":[]}'::jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"publish_to" jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"page_type" "page_type" DEFAULT 'personal' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_setup_complete" boolean DEFAULT false NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"platform" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"page_id" uuid,
	"mode" "post_mode" DEFAULT 'freeform' NOT NULL,
	"content" text NOT NULL,
	"generated_content" text,
	"structured_input" jsonb,
	"ai_prompt" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"publish_started_at" timestamp with time zone,
	"error" text,
	"post_as" "post_as" DEFAULT 'person' NOT NULL,
	"organization_name" text,
	"ai_analysis" jsonb,
	"approval" jsonb,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"includes_link" boolean DEFAULT false NOT NULL,
	"link_url" text,
	"blog_source" jsonb,
	"source_content" jsonb,
	"performance" jsonb,
	"outcome_rating" "outcome_rating",
	"target_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platform_content" jsonb,
	"platform_results" jsonb,
	"learning_metadata" jsonb,
	"ai_review" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "token_alert_platform" NOT NULL,
	"platform_id" text NOT NULL,
	"alert_type" "token_alert_type" NOT NULL,
	"token_expires_at" timestamp with time zone,
	"refresh_attempted" boolean DEFAULT false NOT NULL,
	"refresh_succeeded" boolean DEFAULT false NOT NULL,
	"refresh_error" text,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_error" text,
	"hours_until_expiry" real,
	"alerted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"linkedin_id" text,
	"linkedin_access_token" text,
	"linkedin_access_token_expires" timestamp with time zone,
	"linkedin_organizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_post_as" "post_as" DEFAULT 'person' NOT NULL,
	"default_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_replies" ADD CONSTRAINT "comment_replies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_replies" ADD CONSTRAINT "comment_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_replies" ADD CONSTRAINT "comment_replies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_suggestions" ADD CONSTRAINT "comment_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_suggestions" ADD CONSTRAINT "comment_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_history" ADD CONSTRAINT "engagement_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_history" ADD CONSTRAINT "engagement_history_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_history" ADD CONSTRAINT "engagement_history_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_history" ADD CONSTRAINT "engagement_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_settings" ADD CONSTRAINT "engagement_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_settings" ADD CONSTRAINT "engagement_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_targets" ADD CONSTRAINT "engagement_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_targets" ADD CONSTRAINT "engagement_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icp_engagements" ADD CONSTRAINT "icp_engagements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icp_engagements" ADD CONSTRAINT "icp_engagements_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_connections" ADD CONSTRAINT "pending_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_connections" ADD CONSTRAINT "pending_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_alerts" ADD CONSTRAINT "token_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_alerts" ADD CONSTRAINT "token_alerts_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_alerts" ADD CONSTRAINT "token_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_org_date_model_uq" ON "ai_usage" USING btree ("organization_id","date","model_name");--> statement-breakpoint
CREATE INDEX "comment_replies_org_idx" ON "comment_replies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comment_replies_user_status_idx" ON "comment_replies" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "comment_suggestions_user_status_idx" ON "comment_suggestions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "eng_history_org_idx" ON "engagement_history" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eng_history_post_uq" ON "engagement_history" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "eng_history_page_idx" ON "engagement_history" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eng_settings_user_uq" ON "engagement_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eng_targets_org_idx" ON "engagement_targets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "eng_targets_user_status_idx" ON "engagement_targets" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "eng_targets_status_scheduled_user_idx" ON "engagement_targets" USING btree ("status","scheduled_for","user_id");--> statement-breakpoint
CREATE INDEX "icp_org_idx" ON "icp_engagements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "icp_page_platform_engaged_idx" ON "icp_engagements" USING btree ("page_id","platform","engaged_at");--> statement-breakpoint
CREATE INDEX "icp_page_status_idx" ON "icp_engagements" USING btree ("page_id","status");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_uq" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pages_org_idx" ON "pages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pages_user_idx" ON "pages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pages_org_active_idx" ON "pages" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "pending_conn_user_idx" ON "pending_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_conn_expires_idx" ON "pending_connections" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "posts_org_idx" ON "posts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "posts_user_created_idx" ON "posts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_user_status_published_idx" ON "posts" USING btree ("user_id","status","published_at");--> statement-breakpoint
CREATE INDEX "posts_page_status_created_idx" ON "posts" USING btree ("page_id","status","created_at");--> statement-breakpoint
CREATE INDEX "posts_status_scheduled_idx" ON "posts" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "token_alerts_page_idx" ON "token_alerts" USING btree ("page_id");
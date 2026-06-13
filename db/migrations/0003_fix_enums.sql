ALTER TABLE "comment_suggestions" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."comment_source";--> statement-breakpoint
CREATE TYPE "public"."comment_source" AS ENUM('feed', 'target_profile', 'engagement_reply');--> statement-breakpoint
UPDATE "comment_suggestions" SET "source" = CASE "source" WHEN 'search' THEN 'feed' WHEN 'manual' THEN 'feed' WHEN 'icp' THEN 'engagement_reply' WHEN 'target_profile' THEN 'target_profile' WHEN 'engagement_reply' THEN 'engagement_reply' ELSE 'feed' END;--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "source" SET DATA TYPE "public"."comment_source" USING "source"::"public"."comment_source";--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."comment_status";--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('pending', 'approved', 'posted', 'skipped');--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."comment_status";--> statement-breakpoint
UPDATE "comment_suggestions" SET "status" = CASE "status" WHEN 'rejected' THEN 'skipped' WHEN 'pending' THEN 'pending' WHEN 'approved' THEN 'approved' WHEN 'posted' THEN 'posted' WHEN 'skipped' THEN 'skipped' ELSE 'pending' END;--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DATA TYPE "public"."comment_status" USING "status"::"public"."comment_status";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DEFAULT 'manual'::text;--> statement-breakpoint
DROP TYPE "public"."post_mode";--> statement-breakpoint
CREATE TYPE "public"."post_mode" AS ENUM('manual', 'structured', 'ai', 'blog_repurpose');--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DEFAULT 'manual'::"public"."post_mode";--> statement-breakpoint
UPDATE "posts" SET "mode" = CASE "mode" WHEN 'freeform' THEN 'manual' WHEN 'ai_generated' THEN 'ai' WHEN 'blog' THEN 'blog_repurpose' WHEN 'data_source' THEN 'structured' WHEN 'manual' THEN 'manual' WHEN 'structured' THEN 'structured' WHEN 'ai' THEN 'ai' WHEN 'blog_repurpose' THEN 'blog_repurpose' ELSE 'manual' END;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DATA TYPE "public"."post_mode" USING "mode"::"public"."post_mode";
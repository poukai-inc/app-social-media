ALTER TABLE "comment_suggestions" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."comment_source";--> statement-breakpoint
CREATE TYPE "public"."comment_source" AS ENUM('feed', 'target_profile', 'engagement_reply');--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "source" SET DATA TYPE "public"."comment_source" USING "source"::"public"."comment_source";--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."comment_status";--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('pending', 'approved', 'posted', 'skipped');--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."comment_status";--> statement-breakpoint
ALTER TABLE "comment_suggestions" ALTER COLUMN "status" SET DATA TYPE "public"."comment_status" USING "status"::"public"."comment_status";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DEFAULT 'manual'::text;--> statement-breakpoint
DROP TYPE "public"."post_mode";--> statement-breakpoint
CREATE TYPE "public"."post_mode" AS ENUM('manual', 'structured', 'ai', 'blog_repurpose');--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DEFAULT 'manual'::"public"."post_mode";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "mode" SET DATA TYPE "public"."post_mode" USING "mode"::"public"."post_mode";
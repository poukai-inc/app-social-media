import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import type {
  EngagementStatus,
  ReplyStatus} from '@/lib/models/Engagement';
import {
  EngagementTarget,
  CommentReply,
  EngagementSettings,
  getOrCreateEngagementSettings
} from '@/lib/models/Engagement';
import { 
  engageWithPost, 
  getPostComments, 
  replyToComment 
} from '@/lib/linkedin-engagement';
import { generateComment, generateReply } from '@/lib/openai';
import { withLock, extendLock } from '@/lib/distributed-lock';
import { logger } from '@/lib/logger';

const log = logger.child('cron:engage');

// This API route processes engagement tasks
// Run every 15-30 minutes via cron job
// Handles:
// 1. Auto-engaging with queued posts (from EngagementTarget)
// 2. Auto-replying to comments on user's published posts (CommentReply)

export async function GET(request: Request) {
  // Verify authorization
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  await connectToDatabase();

  // Distributed lock prevents concurrent runs from double-engaging the same
  // queued targets/comments. extendLock (inside the user loop) keeps it alive
  // across long multi-user runs so it never expires mid-flight. (issue #19)
  const lockResult = await withLock('engage', executeEngage, { ttlSeconds: 600 });

  if (lockResult.skipped) {
    return NextResponse.json({
      success: false,
      skipped: true,
      message: 'Another instance is already running engage',
    });
  }

  if (!lockResult.success) {
    return NextResponse.json(
      { error: lockResult.error || 'Engagement cron failed' },
      { status: 500 }
    );
  }

  return NextResponse.json(lockResult.result);
}

async function executeEngage() {
  try {
    const results = {
      engagements: [] as { id: string; status: string; error?: string }[],
      replies: [] as { id: string; status: string; error?: string }[],
      newComments: 0,
    };

    // Debug info
    const debug = {
      settingsFound: 0,
      usersProcessed: 0,
      engagementsQueried: 0,
    };

    // Get ALL users who have pending engagements in their queue
    // This ensures engagements are processed regardless of autoEngageEnabled setting
    const usersWithPendingEngagements = await EngagementTarget.distinct('userId', {
      status: { $in: ['pending', 'approved'] }
    });

    // Also get users who want auto-reply enabled (for comment monitoring)
    const usersWithAutoReply = await EngagementSettings.find({ autoReplyEnabled: true });
    const autoReplyUserIds = new Set(usersWithAutoReply.map(s => s.userId.toString()));

    // Combine: process engagements for all users with pending items
    const allUserIds = new Set([
      ...usersWithPendingEngagements.map(id => id.toString()),
      ...autoReplyUserIds
    ]);

    debug.settingsFound = allUserIds.size;

    // Batch-load users and their settings up front to avoid a per-user
    // User.findById + EngagementSettings.findOne (N+1). (issue #30)
    const userIdList = [...allUserIds];
    const [usersList, settingsList] = await Promise.all([
      User.find({ _id: { $in: userIdList } }),
      EngagementSettings.find({ userId: { $in: userIdList } }),
    ]);
    const userMap = new Map(usersList.map(u => [u._id.toString(), u]));
    const settingsMap = new Map(settingsList.map(s => [s.userId.toString(), s]));

    for (const odUserId of allUserIds) {
      // Keep the distributed lock alive during long multi-user runs so it can
      // never expire mid-flight and let an overlapping run double-engage. (issue #19)
      await extendLock('engage', 600);

      const user = userMap.get(odUserId);
      if (!user || !user.linkedinAccessToken) continue;

      // Use prefetched settings; create defaults only if this user has none.
      const settings = settingsMap.get(user._id.toString()) ?? await getOrCreateEngagementSettings(user._id);
      debug.usersProcessed++;

      // Calculate how many engagements we can do today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // ============================================
      // Part 1: Process Engagement Queue
      // ============================================
      // Always process engagement queue (don't require autoEngageEnabled flag)
      {
        // Count today's engagements
        const todayEngagements = await EngagementTarget.countDocuments({
          userId: user._id,
          status: 'engaged',
          engagedAt: { $gte: todayStart },
        });

        const limit = settings.dailyEngagementLimit || 10;
        const remainingEngagements = limit - todayEngagements;

        if (remainingEngagements > 0) {
          // Get pending engagements (approved or auto-approved based on settings)
          // safe: values are hard-coded EngagementStatus literals, not user input
          const statusFilter: EngagementStatus[] = settings.requireApproval ? ['approved'] : ['pending', 'approved'];
          
          const pendingEngagements = await EngagementTarget.find({
            userId: user._id,
            status: { $in: statusFilter },
            $or: [
              { scheduledFor: { $lte: new Date() } },
              { scheduledFor: null },
              { scheduledFor: { $exists: false } },
            ],
          })
            .sort({ scheduledFor: 1, createdAt: 1 })
            .limit(Math.min(remainingEngagements, 5)); // Max 5 per cron run

          debug.engagementsQueried = pendingEngagements.length;

          for (const engagement of pendingEngagements) {
            if (!engagement.postUrn) {
              engagement.status = 'failed';
              engagement.error = 'No post URN';
              await engagement.save();
              results.engagements.push({ id: engagement._id.toString(), status: 'failed', error: 'No post URN' });
              continue;
            }

            const needsComment = engagement.engagementType === 'comment' || engagement.engagementType === 'both';
            
            // Get existing comment or generate one
            let commentToPost = engagement.userEditedComment || engagement.aiGeneratedComment;
            
            // Generate comment if needed and none exists
            if (needsComment && !commentToPost) {
              try {
                // Use post content if available, otherwise use generic context
                const contentForAI = engagement.postContent || `LinkedIn post from ${engagement.postAuthor || 'a professional'}`;
                commentToPost = await generateComment({
                  postContent: contentForAI,
                  ...(engagement.postAuthor !== undefined && { postAuthor: engagement.postAuthor }),
                  style: settings.engagementStyle || 'professional',
                });
                engagement.aiGeneratedComment = commentToPost;
              } catch (aiErr) {
                log.error('AI comment generation failed', { error: aiErr instanceof Error ? aiErr.message : String(aiErr) });
                engagement.status = 'failed';
                engagement.error = 'Failed to generate AI comment';
                await engagement.save();
                results.engagements.push({ id: engagement._id.toString(), status: 'failed', error: 'AI comment generation failed' });
                continue;
              }
            }

            // Execute engagement
            const result = await engageWithPost(user.email, engagement.postUrn, {
              like: engagement.engagementType === 'like' || engagement.engagementType === 'both',
              ...(needsComment && commentToPost !== undefined && { comment: commentToPost }),
            });

            if (result.success || result.liked || result.commented) {
              engagement.status = 'engaged';
              engagement.engagedAt = new Date();
              if (result.error !== undefined) {
                engagement.error = result.error; // May have partial error
              }
            } else {
              engagement.status = 'failed';
              if (result.error !== undefined) engagement.error = result.error;
            }

            await engagement.save();
            results.engagements.push({
              id: engagement._id.toString(),
              status: engagement.status,
              ...(engagement.error !== undefined && { error: engagement.error }),
            });

            // Add delay between engagements
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      // ============================================
      // Part 2: Check for new comments & auto-reply
      // ============================================
      if (settings.autoReplyEnabled) {
        // Get user's published posts from the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentPosts = await Post.find({
          userId: user._id,
          status: 'published',
          linkedinPostId: { $exists: true, $ne: null },
          publishedAt: { $gte: sevenDaysAgo },
        });

        for (const post of recentPosts) {
          if (!post.linkedinPostId) continue;

          // Fetch comments from LinkedIn
          const commentsResult = await getPostComments(user.email, post.linkedinPostId);
          
          if (!commentsResult.success || !commentsResult.comments) continue;

          // Bulk-check which comments we've already processed (one query per
          // post instead of one findOne per comment). (issue #30)
          const commentUrns = commentsResult.comments.map(c => c.urn);
          const existingReplies = await CommentReply.find({ commentUrn: { $in: commentUrns } })
            .select('commentUrn')
            .lean();
          const processedUrns = new Set(existingReplies.map(r => r.commentUrn));

          for (const comment of commentsResult.comments) {
            // Skip if we've already processed this comment
            if (processedUrns.has(comment.urn)) continue;
            processedUrns.add(comment.urn); // guard against duplicates within this batch

            // Create a new CommentReply record
            let aiReply: string | undefined;
            try {
              aiReply = await generateReply({
                originalPostContent: post.content,
                commentText: comment.message,
                commenterName: comment.actorName,
                style: settings.engagementStyle,
              });
            } catch (aiErr) {
              log.error('AI reply generation failed', { error: aiErr instanceof Error ? aiErr.message : String(aiErr) });
            }

            await CommentReply.create({
              userId: user._id,
              postId: post._id,
              linkedinPostUrn: post.linkedinPostId,
              commentUrn: comment.urn,
              commenterName: comment.actorName,
              ...(comment.actorProfileUrl !== undefined && { commenterProfileUrl: comment.actorProfileUrl }),
              commentText: comment.message,
              ...(aiReply !== undefined && { aiGeneratedReply: aiReply }),
              status: settings.requireApproval ? 'pending' : 'approved',
            });

            results.newComments++;
          }
        }

        // Process approved replies
        const todayReplies = await CommentReply.countDocuments({
          userId: user._id,
          status: 'replied',
          repliedAt: { $gte: todayStart },
        });

        const remainingReplies = settings.dailyReplyLimit - todayReplies;

        if (remainingReplies > 0) {
          // safe: values are hard-coded ReplyStatus literals, not user input
          const statusFilter: ReplyStatus[] = settings.requireApproval ? ['approved'] : ['pending', 'approved'];

          const pendingReplies = await CommentReply.find({
            userId: user._id,
            status: { $in: statusFilter },
          })
            .sort({ createdAt: 1 })
            .limit(Math.min(remainingReplies, 5));

          for (const reply of pendingReplies) {
            const replyText = reply.userEditedReply || reply.aiGeneratedReply;
            
            if (!replyText) {
              reply.status = 'skipped';
              await reply.save();
              continue;
            }

            const result = await replyToComment(
              user.email,
              reply.linkedinPostUrn,
              reply.commentUrn,
              replyText
            );

            if (result.success) {
              reply.status = 'replied';
              reply.repliedAt = new Date();
            } else {
              reply.status = 'failed';
              if (result.error !== undefined) reply.error = result.error;
            }

            await reply.save();
            results.replies.push({
              id: reply._id.toString(),
              status: reply.status,
              ...(reply.error !== undefined && { error: reply.error }),
            });

            // Add delay between replies
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    }

    return {
      success: true,
      engagementsProcessed: results.engagements.length,
      repliesProcessed: results.replies.length,
      newCommentsFound: results.newComments,
      details: results,
      debug,
    };
  } catch (error) {
    log.error('Engagement cron error', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

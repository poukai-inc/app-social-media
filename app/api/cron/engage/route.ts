import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
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

// This API route processes engagement tasks
// Run every 15-30 minutes via cron job
// Handles:
// 1. Auto-engaging with queued posts (from EngagementTarget)
// 2. Auto-replying to comments on user's published posts (CommentReply)

export async function GET(request: Request) {
  try {
    // Verify authorization
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization') ?? '';
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    await connectToDatabase();

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

    for (const odUserId of allUserIds) {
      const user = await User.findById(odUserId);
      if (!user || !user.linkedinAccessToken) continue;
      
      // Get or create settings for this user
      const settings = await getOrCreateEngagementSettings(user._id);
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
          const statusFilter = settings.requireApproval ? ['approved'] : ['pending', 'approved'];
          
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
                  postAuthor: engagement.postAuthor,
                  style: settings.engagementStyle || 'professional',
                });
                engagement.aiGeneratedComment = commentToPost;
              } catch (aiErr) {
                console.error('AI comment generation failed:', aiErr);
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
              comment: needsComment ? commentToPost : undefined,
            });

            if (result.success || result.liked || result.commented) {
              engagement.status = 'engaged';
              engagement.engagedAt = new Date();
              engagement.error = result.error; // May have partial error
            } else {
              engagement.status = 'failed';
              engagement.error = result.error;
            }

            await engagement.save();
            results.engagements.push({
              id: engagement._id.toString(),
              status: engagement.status,
              error: engagement.error,
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

          for (const comment of commentsResult.comments) {
            // Skip if we've already processed this comment
            const existingReply = await CommentReply.findOne({ commentUrn: comment.urn });
            if (existingReply) continue;

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
              console.error('AI reply generation failed:', aiErr);
            }

            await CommentReply.create({
              userId: user._id,
              postId: post._id,
              linkedinPostUrn: post.linkedinPostId,
              commentUrn: comment.urn,
              commenterName: comment.actorName,
              commenterProfileUrl: comment.actorProfileUrl,
              commentText: comment.message,
              aiGeneratedReply: aiReply,
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
          const statusFilter = settings.requireApproval ? ['approved'] : ['pending', 'approved'];
          
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
              reply.error = result.error;
            }

            await reply.save();
            results.replies.push({
              id: reply._id.toString(),
              status: reply.status,
              error: reply.error,
            });

            // Add delay between replies
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      engagementsProcessed: results.engagements.length,
      repliesProcessed: results.replies.length,
      newCommentsFound: results.newComments,
      details: results,
      debug,
    });
  } catch (error) {
    console.error('Engagement cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

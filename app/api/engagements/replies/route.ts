import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Post from '@/lib/models/Post';
import type { ReplyStatus } from '@/lib/models/Engagement';
import { CommentReply } from '@/lib/models/Engagement';
import { getPostComments, replyToComment } from '@/lib/linkedin-engagement';
import { generateReply } from '@/lib/openai';
import { logger } from '@/lib/logger';

const log = logger.child('api:engagements:replies');

// GET /api/engagements/replies - Get comment replies
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const postId = searchParams.get('postId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const ALLOWED_REPLY_STATUSES: ReadonlyArray<ReplyStatus> = ['pending', 'approved', 'replied', 'skipped', 'failed'];
    const query: { userId: typeof user._id; status?: ReplyStatus; postId?: string } = {
      userId: user._id
    };
    // safe: validated against ALLOWED_REPLY_STATUSES before assigning
    if (status && ALLOWED_REPLY_STATUSES.includes(status as ReplyStatus)) {
      query.status = status as ReplyStatus;
    }
    if (postId) query.postId = postId;

    const replies = await CommentReply.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('postId', 'content')
      .lean();

    const serialized = replies.map((r) => ({
      _id: r._id.toString(),
      postId: r.postId?._id?.toString(),
      postContent: (r.postId as unknown as { content?: string })?.content,
      linkedinPostUrn: r.linkedinPostUrn,
      commentUrn: r.commentUrn,
      commenterName: r.commenterName,
      commenterProfileUrl: r.commenterProfileUrl,
      commentText: r.commentText,
      aiGeneratedReply: r.aiGeneratedReply,
      userEditedReply: r.userEditedReply,
      status: r.status,
      repliedAt: r.repliedAt?.toISOString(),
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ replies: serialized });
  } catch (error) {
    log.error('Error fetching replies', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch replies' }, { status: 500 });
  }
}

// POST /api/engagements/replies - Manually fetch new comments from LinkedIn
export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's published posts
    const publishedPosts = await Post.find({
      userId: user._id,
      status: 'published',
      linkedinPostId: { $exists: true, $ne: null },
    }).sort({ publishedAt: -1 }).limit(20);

    let newCommentsFound = 0;
    const errors: string[] = [];

    for (const post of publishedPosts) {
      if (!post.linkedinPostId) continue;

      try {
        const commentsResult = await getPostComments(session.user.email, post.linkedinPostId);

        if (!commentsResult.success || !commentsResult.comments) {
          if (commentsResult.error) {
            errors.push(`Post ${post._id}: ${commentsResult.error}`);
          }
          continue;
        }

        for (const comment of commentsResult.comments) {
          // Skip if we've already processed this comment
          const existingReply = await CommentReply.findOne({ commentUrn: comment.urn });
          if (existingReply) continue;

          // Generate AI reply
          let aiReply: string | undefined;
          try {
            aiReply = await generateReply({
              originalPostContent: post.content,
              commentText: comment.message,
              commenterName: comment.actorName,
              style: 'professional',
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
            status: 'pending',
          });

          newCommentsFound++;
        }
      } catch (postError) {
        errors.push(`Post ${post._id}: ${postError instanceof Error ? postError.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      newCommentsFound,
      postsChecked: publishedPosts.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    log.error('Error fetching comments', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

// PUT /api/engagements/replies - Update a reply
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      replyId,
      status,
      userEditedReply,
      regenerateReply,
      executeNow,
    }: {
      replyId: string;
      status?: ReplyStatus;
      userEditedReply?: string;
      regenerateReply?: boolean;
      executeNow?: boolean;
    } = body;

    if (!replyId) {
      return NextResponse.json({ error: 'Reply ID is required' }, { status: 400 });
    }

    const reply = await CommentReply.findOne({ _id: replyId, userId: user._id });

    if (!reply) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    // Regenerate AI reply if requested
    if (regenerateReply) {
      const post = await Post.findById(reply.postId);
      if (post) {
        try {
          reply.aiGeneratedReply = await generateReply({
            originalPostContent: post.content,
            commentText: reply.commentText,
            commenterName: reply.commenterName,
            style: 'professional',
          });
        } catch (aiErr) {
          log.error('AI reply regeneration failed', { error: aiErr instanceof Error ? aiErr.message : String(aiErr) });
        }
      }
    }

    // Update fields
    if (status) reply.status = status;
    if (userEditedReply !== undefined) reply.userEditedReply = userEditedReply;

    // Execute reply immediately if requested
    if (executeNow && reply.status !== 'replied') {
      const replyText = reply.userEditedReply || reply.aiGeneratedReply;

      if (!replyText) {
        return NextResponse.json({ error: 'No reply text available' }, { status: 400 });
      }

      const result = await replyToComment(
        session.user.email,
        reply.linkedinPostUrn,
        reply.commentUrn,
        replyText
      );

      if (result.success) {
        reply.status = 'replied';
        reply.repliedAt = new Date();
        reply.set('error', undefined);
      } else {
        reply.status = 'failed';
        if (result.error !== undefined) reply.error = result.error;
      }
    }

    await reply.save();

    return NextResponse.json({
      success: true,
      reply: {
        _id: reply._id.toString(),
        status: reply.status,
        aiGeneratedReply: reply.aiGeneratedReply,
        userEditedReply: reply.userEditedReply,
        repliedAt: reply.repliedAt?.toISOString(),
        error: reply.error,
      },
    });
  } catch (error) {
    log.error('Error updating reply', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update reply' }, { status: 500 });
  }
}

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:[id]:performance');

// POST /api/posts/[id]/performance - Update post performance metrics
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const post = await Post.findOne({ _id: id, userId: user._id });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (!post.linkedinPostId) {
      return NextResponse.json({ error: 'Post not published to LinkedIn' }, { status: 400 });
    }

    // Fetch stats from LinkedIn
    // Note: LinkedIn API access for statistics varies by product access
    const accessToken = user.linkedinAccessToken;
    
    try {
      // Try to fetch social actions (reactions, comments, shares)
      const socialActionsUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(post.linkedinPostId)}`;
      const socialResponse = await fetch(socialActionsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      let reactions = 0;
      let comments = 0;

      if (socialResponse.ok) {
        const socialData = await socialResponse.json();
        reactions = socialData.likesSummary?.totalLikes || 0;
        comments = socialData.commentsSummary?.totalFirstLevelComments || 0;
      }

      // Update post performance
      post.performance = {
        ...post.performance,
        reactions,
        comments,
        lastUpdated: new Date(),
      };

      await post.save();

      return NextResponse.json({
        success: true,
        performance: post.performance,
      });
    } catch (linkedinError) {
      log.error('LinkedIn API error', { error: linkedinError instanceof Error ? linkedinError.message : String(linkedinError) });
      return NextResponse.json({
        success: false,
        error: 'Could not fetch LinkedIn stats',
        note: 'Statistics API may require additional permissions',
      });
    }
  } catch (error) {
    log.error('Performance sync error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to sync performance' }, { status: 500 });
  }
}

// GET /api/posts/[id]/performance - Get post performance
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const post = await Post.findOne({ _id: id, userId: user._id });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({
      performance: post.performance || null,
      linkedinPostId: post.linkedinPostId,
      publishedAt: post.publishedAt,
    });
  } catch (error) {
    log.error('Performance fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch performance' }, { status: 500 });
  }
}

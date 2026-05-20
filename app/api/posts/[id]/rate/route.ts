import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:[id]:rate');

// POST /api/posts/[id]/rate - Rate a post outcome for the learning loop
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
    const body = await request.json();
    const { rating } = body;

    if (!rating || !['poor', 'average', 'good', 'excellent'].includes(rating)) {
      return NextResponse.json(
        { error: 'Invalid rating. Must be: poor, average, good, or excellent' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const post = await Post.findOneAndUpdate(
      { _id: id, userId: user._id },
      { outcomeRating: rating },
      { new: true }
    );

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Log for learning loop (this data can be used to improve AI confidence calibration)
    log.info('Learning loop data', {
      postId: post._id,
      aiConfidence: post.aiAnalysis?.confidence,
      riskLevel: post.aiAnalysis?.riskLevel,
      angle: post.aiAnalysis?.angle,
      outcomeRating: rating,
      includesLink: post.includesLink,
      performanceReactions: post.performance?.reactions,
      performanceComments: post.performance?.comments,
    });

    return NextResponse.json({
      success: true,
      post: {
        id: post._id,
        outcomeRating: post.outcomeRating,
      },
    });
  } catch (error) {
    log.error('Rating error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to rate post' }, { status: 500 });
  }
}

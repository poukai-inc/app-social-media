import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import { postToLinkedIn } from '@/lib/linkedin';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:[id]:retry');

// POST /api/posts/[id]/retry - Retry publishing a failed post
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

    if (post.status === 'published') {
      return NextResponse.json({ 
        error: 'Post is already published',
        linkedinPostId: post.linkedinPostId 
      }, { status: 400 });
    }

    // Attempt to publish to LinkedIn
    log.info('Retrying publication for post', { id });
    const result = await postToLinkedIn(
      session.user.email, 
      post.content, 
      post.media || [],
      post.postAs || 'person',
      post.organizationId
    );

    if (result.success) {
      post.status = 'published';
      post.publishedAt = new Date();
      post.linkedinPostId = result.postId;
      post.error = undefined;
      await post.save();

      return NextResponse.json({
        success: true,
        message: 'Post published successfully',
        post: post.toObject(),
      });
    } else {
      post.status = 'failed';
      post.error = result.error;
      await post.save();

      return NextResponse.json({
        success: false,
        error: result.error,
        post: post.toObject(),
      }, { status: 500 });
    }

  } catch (error) {
    log.error('Error retrying post', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

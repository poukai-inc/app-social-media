import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import { postToLinkedIn } from '@/lib/linkedin';
import { findOwnedPage } from '@/lib/page-access';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:[id]');

// GET /api/posts/[id] - Get a specific post
export async function GET(
  _request: NextRequest,
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

    return NextResponse.json(post);
  } catch (error) {
    log.error('Error fetching post', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/posts/[id] - Update a post
export async function PUT(
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
    const { content, scheduledFor, publishNow } = body;

    await connectToDatabase();
    
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const post = await Post.findOne({ _id: id, userId: user._id });
    
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Can only edit draft or scheduled posts
    if (post.status === 'published') {
      return NextResponse.json({ error: 'Cannot edit published posts' }, { status: 400 });
    }

    // If publishing now
    if (publishNow) {
      const result = await postToLinkedIn(
        session.user.email, 
        content || post.content,
        post.media || [],
        post.postAs || 'person',
        post.organizationId
      );
      
      post.content = content || post.content;
      post.status = result.success ? 'published' : 'failed';
      if (result.success) {
        post.publishedAt = new Date();
      } else {
        post.set('publishedAt', undefined);
      }
      if (result.postId !== undefined) post.linkedinPostId = result.postId;
      if (result.error !== undefined) post.error = result.error;
      post.set('scheduledFor', undefined);
      
      await post.save();
      return NextResponse.json(post);
    }

    // Update content and/or schedule
    if (content !== undefined) post.content = content;
    if ('mode' in body) post.mode = body.mode;
    if ('structuredInput' in body) post.structuredInput = body.structuredInput;
    if ('aiPrompt' in body) post.aiPrompt = body.aiPrompt;
    if ('generatedContent' in body) post.generatedContent = body.generatedContent;
    if ('media' in body) post.media = body.media;
    if ('postAs' in body) post.postAs = body.postAs;
    if ('organizationId' in body) post.organizationId = body.organizationId;
    if ('organizationName' in body) post.organizationName = body.organizationName;
    if ('pageId' in body) {
      // Validate the target page belongs to the caller before reassigning, so a
      // post can't be moved into another tenant's page (which would pollute that
      // page's analytics/learning aggregates keyed on pageId). (issue #26)
      if (body.pageId) {
        const ownedPage = await findOwnedPage(session, String(body.pageId));
        if (!ownedPage) {
          return NextResponse.json({ error: 'Invalid pageId' }, { status: 400 });
        }
      }
      post.pageId = body.pageId;
    }
    if ('targetPlatforms' in body) post.targetPlatforms = body.targetPlatforms;
    
    if (scheduledFor) {
      // Reject invalid/past dates so the publish cron does not fire immediately. (review L4)
      const when = new Date(scheduledFor);
      if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: 'scheduledFor must be a valid future date' },
          { status: 400 }
        );
      }
      post.scheduledFor = when;
      // Only change status to scheduled if it's currently draft
      if (post.status === 'draft') {
        post.status = 'scheduled';
      }
    } else if (scheduledFor === null) {
      post.set('scheduledFor', undefined);
      // Only change to draft if it's currently scheduled
      if (post.status === 'scheduled') {
        post.status = 'draft';
      }
    }

    await post.save();
    return NextResponse.json(post);
  } catch (error) {
    log.error('Error updating post', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Delete a post
export async function DELETE(
  _request: NextRequest,
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

    const post = await Post.findOneAndDelete({ _id: id, userId: user._id });
    
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error) {
    log.error('Error deleting post', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

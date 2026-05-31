import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import type { PostMode, StructuredInput, MediaItem } from '@/lib/models/Post';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import { postToLinkedIn } from '@/lib/linkedin';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts');

// GET /api/posts - Get the current user's posts (paginated)
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

    // Bound the result set so it cannot grow without limit per tenant. (issue #29)
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const posts = await Post.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    return NextResponse.json(posts);
  } catch (error) {
    log.error('Error fetching posts', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreatePostBody {
  mode?: PostMode;
  content: string;
  generatedContent?: string;
  structuredInput?: StructuredInput;
  aiPrompt?: string;
  media?: MediaItem[];
  scheduledFor?: string;
  publishNow?: boolean;
  postAs?: 'person' | 'organization';
  organizationId?: string;
  organizationName?: string;
}

// POST /api/posts - Create a new post
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreatePostBody = await request.json();
    const { 
      mode = 'manual', 
      content, 
      generatedContent,
      structuredInput,
      aiPrompt,
      media = [],
      scheduledFor, 
      publishNow,
      postAs = 'person',
      organizationId,
      organizationName,
    } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (content.length > 3000) {
      return NextResponse.json({ error: 'Content exceeds 3000 characters' }, { status: 400 });
    }

    await connectToDatabase();
    
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If publishing now, post directly to LinkedIn
    if (publishNow) {
      const result = await postToLinkedIn(session.user.email, content, media, postAs, organizationId);
      
      const post = await Post.create({
        userId: user._id,
        mode,
        content,
        generatedContent,
        structuredInput,
        aiPrompt,
        media,
        status: result.success ? 'published' : 'failed',
        publishedAt: result.success ? new Date() : undefined,
        linkedinPostId: result.postId,
        error: result.error,
        postAs,
        organizationId,
        organizationName,
      });

      return NextResponse.json(post, { status: 201 });
    }

    // Create scheduled or draft post
    const post = await Post.create({
      userId: user._id,
      mode,
      content,
      generatedContent,
      structuredInput,
      aiPrompt,
      media,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      status: scheduledFor ? 'scheduled' : 'draft',
      postAs,
      organizationId,
      organizationName,
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    log.error('Error creating post', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

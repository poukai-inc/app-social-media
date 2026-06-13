import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:posts');

// GET /api/pages/[id]/posts - Get posts for a specific page
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

    const page = await Page.findOne({ _id: id, userId: user._id });
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const ALLOWED_STATUSES = [
      'draft',
      'pending_approval',
      'scheduled',
      'published',
      'partially_published',
      'failed',
      'rejected',
    ];
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    // Clamp limit to a sane max so a client cannot dump the collection. (review M2)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
    const skip = Math.max(parseInt(searchParams.get('skip') || '0', 10) || 0, 0);

    const query: Record<string, unknown> = { pageId: page._id };
    // Allowlist status (defense-in-depth against unexpected filter values). (review H2)
    if (status && ALLOWED_STATUSES.includes(status)) {
      query.status = status;
    }

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(query),
    ]);

    // Get status counts
    const statusCounts = await Post.aggregate([
      { $match: { pageId: page._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const counts = statusCounts.reduce(
      (acc, { _id, count }) => ({ ...acc, [_id]: count }),
      {} as Record<string, number>
    );

    return NextResponse.json({
      posts,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + posts.length < total,
      },
      statusCounts: counts,
    });
  } catch (error) {
    log.error('Page posts fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

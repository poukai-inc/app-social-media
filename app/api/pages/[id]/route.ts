import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]');

// GET /api/pages/[id] - Get a single page with full details
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

    const page = await Page.findOne({ _id: id, userId: user._id }).lean();
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Get post statistics
    const [postStats, performanceStats] = await Promise.all([
      Post.aggregate([
        { $match: { pageId: page._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Post.aggregate([
        { $match: { pageId: page._id, status: 'published' } },
        {
          $group: {
            _id: null,
            totalImpressions: { $sum: '$performance.impressions' },
            totalReactions: { $sum: '$performance.reactions' },
            totalComments: { $sum: '$performance.comments' },
            totalShares: { $sum: '$performance.shares' },
            postCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts = postStats.reduce(
      (acc, { _id, count }) => ({ ...acc, [_id]: count }),
      {} as Record<string, number>
    );

    const performance = performanceStats[0] || {
      totalImpressions: 0,
      totalReactions: 0,
      totalComments: 0,
      totalShares: 0,
      postCount: 0,
    };

    // Sanitize connections to remove sensitive tokens
    const sanitizedConnections = (page.connections || []).map((conn: {
      platform: string;
      platformId: string;
      platformUsername: string;
      isActive: boolean;
      connectedAt: Date;
      tokenExpiresAt?: Date;
      metadata?: Record<string, unknown>;
    }) => ({
      platform: conn.platform,
      platformId: conn.platformId,
      platformUsername: conn.platformUsername,
      isActive: conn.isActive,
      connectedAt: conn.connectedAt,
      tokenExpiresAt: conn.tokenExpiresAt,
      metadata: conn.metadata,
    }));

    return NextResponse.json({
      page: {
        ...page,
        connections: sanitizedConnections,
      },
      stats: {
        posts: statusCounts,
        performance,
      },
    });
  } catch (error) {
    log.error('Page fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch page' }, { status: 500 });
  }
}

// PATCH /api/pages/[id] - Update a page
export async function PATCH(
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

    const body = await request.json();
    const {
      name,
      description,
      avatar,
      contentStrategy,
      contentSources,
      schedule,
      isActive,
    } = body;

    // Update fields if provided
    if (name !== undefined) page.name = name;
    if (description !== undefined) page.description = description;
    if (avatar !== undefined) page.avatar = avatar;
    if (isActive !== undefined) page.isActive = isActive;

    // Update nested objects
    if (contentStrategy) {
      page.contentStrategy = {
        ...page.contentStrategy,
        ...contentStrategy,
      };
    }

    if (contentSources) {
      page.contentSources = {
        ...page.contentSources,
        ...contentSources,
      };
    }

    if (schedule) {
      page.schedule = {
        ...page.schedule,
        ...schedule,
      };
    }

    await page.save();

    return NextResponse.json({ page });
  } catch (error) {
    log.error('Page update error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update page' }, { status: 500 });
  }
}

// DELETE /api/pages/[id] - Delete a page
export async function DELETE(
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

    // Check if there are posts associated with this page
    const postCount = await Post.countDocuments({ pageId: page._id });

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    if (postCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `This page has ${postCount} posts. Use ?force=true to delete anyway.`,
          postCount,
        },
        { status: 409 }
      );
    }

    // If force delete, also remove posts (optional: could keep them orphaned)
    if (force && postCount > 0) {
      await Post.updateMany({ pageId: page._id }, { $unset: { pageId: 1 } });
    }

    await Page.deleteOne({ _id: page._id });

    return NextResponse.json({ success: true, deletedPostLinks: force ? postCount : 0 });
  } catch (error) {
    log.error('Page delete error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 });
  }
}

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages');

// GET /api/pages - Get all pages for the current user
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
    const includeStats = searchParams.get('includeStats') === 'true';

    const pages = await Page.find({ userId: user._id }).sort({ createdAt: -1 }).lean();

    // If stats requested, fetch post counts for each page
    if (includeStats) {
      const pagesWithStats = await Promise.all(
        pages.map(async (page: typeof pages[number]) => {
          const [postStats, recentPosts] = await Promise.all([
            Post.aggregate([
              { $match: { pageId: page._id } },
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                },
              },
            ]),
            Post.find({ pageId: page._id })
              .sort({ createdAt: -1 })
              .limit(3)
              .select('content status scheduledFor publishedAt')
              .lean(),
          ]);

          const statusCounts = postStats.reduce(
            (acc, { _id, count }) => ({ ...acc, [_id]: count }),
            {} as Record<string, number>
          );

          return {
            ...page,
            postStats: statusCounts,
            recentPosts,
          };
        })
      );
      return NextResponse.json({ pages: pagesWithStats });
    }

    return NextResponse.json({ pages });
  } catch (error) {
    log.error('Pages fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
  }
}

// POST /api/pages - Create a new page
export async function POST(request: NextRequest) {
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
      type,
      linkedinId,
      organizationId,
      name,
      description,
      avatar,
      vanityName,
      contentStrategy,
      contentSources,
      schedule,
      isManual,  // Flag for manually created pages
    } = body;

    // Validate required fields - name is always required
    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // For non-manual pages, type and linkedinId are required
    if (!isManual && (!type || !linkedinId)) {
      return NextResponse.json(
        { error: 'type and linkedinId are required for connected pages' },
        { status: 400 }
      );
    }

    // Validate type if provided
    if (type && !['personal', 'organization', 'manual'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "personal", "organization", or "manual"' },
        { status: 400 }
      );
    }

    // Check if page already exists (only for LinkedIn-connected pages)
    if (linkedinId) {
      const existingPage = await Page.findOne({ linkedinId });
      if (existingPage) {
        return NextResponse.json(
          { error: 'A page with this LinkedIn ID already exists' },
          { status: 409 }
        );
      }
    }

    // Validate content strategy
    if (!contentStrategy?.persona || !contentStrategy?.tone || !contentStrategy?.targetAudience) {
      return NextResponse.json(
        { error: 'contentStrategy must include persona, tone, and targetAudience' },
        { status: 400 }
      );
    }

    // Create the page
    const page = await Page.create({
      userId: user._id,
      type: isManual ? 'manual' : type,
      linkedinId: isManual ? undefined : linkedinId,
      organizationId: type === 'organization' ? organizationId : undefined,
      name,
      description,
      avatar,
      vanityName,
      isManual: isManual || false,
      contentStrategy: {
        persona: contentStrategy.persona,
        topics: contentStrategy.topics || [],
        tone: contentStrategy.tone,
        targetAudience: contentStrategy.targetAudience,
        postingFrequency: contentStrategy.postingFrequency || 3,
        preferredAngles: contentStrategy.preferredAngles || ['insight', 'war_story'],
        avoidTopics: contentStrategy.avoidTopics || [],
        customInstructions: contentStrategy.customInstructions,
      },
      contentSources: contentSources || {},
      schedule: schedule || {
        timezone: 'UTC',
        preferredDays: [1, 2, 3, 4, 5],
        preferredTimes: ['09:00', '17:00'],
        autoGenerate: false,
        autoApprove: false,
        minConfidenceForAutoApprove: 0.8,
      },
      isActive: true,
      isSetupComplete: true,
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    log.error('Page creation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create page' }, { status: 500 });
  }
}

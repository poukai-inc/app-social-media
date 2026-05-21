import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import type {
  EngagementType,
  EngagementStatus
} from '@/lib/models/Engagement';
import {
  EngagementTarget,
} from '@/lib/models/Engagement';
import { extractPostUrn, getPostDetails, scrapeLinkedInPost } from '@/lib/linkedin-engagement';
import { generateComment } from '@/lib/openai';
import { logger } from '@/lib/logger';

const log = logger.child('api:engagements');

// GET /api/engagements - List engagement targets
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
    const limit = parseInt(searchParams.get('limit') || '50');

    const ALLOWED_ENGAGEMENT_STATUSES: ReadonlyArray<EngagementStatus> = ['pending', 'approved', 'engaged', 'failed', 'skipped'];
    const query: { userId: typeof user._id; status?: EngagementStatus } = { userId: user._id };
    // safe: validated against ALLOWED_ENGAGEMENT_STATUSES before assigning
    if (status && ALLOWED_ENGAGEMENT_STATUSES.includes(status as EngagementStatus)) {
      query.status = status as EngagementStatus;
    }

    const engagements = await EngagementTarget.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const serialized = engagements.map((e) => ({
      _id: e._id.toString(),
      postUrl: e.postUrl,
      postUrn: e.postUrn,
      postAuthor: e.postAuthor,
      postContent: e.postContent,
      engagementType: e.engagementType,
      aiGeneratedComment: e.aiGeneratedComment,
      userEditedComment: e.userEditedComment,
      status: e.status,
      scheduledFor: e.scheduledFor?.toISOString(),
      engagedAt: e.engagedAt?.toISOString(),
      error: e.error,
      createdAt: e.createdAt.toISOString(),
    }));

    return NextResponse.json({ engagements: serialized });
  } catch (error) {
    log.error('Error fetching engagements', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch engagements' }, { status: 500 });
  }
}

// POST /api/engagements - Create new engagement target
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
      postUrl, 
      postContent: providedContent,  // User can optionally provide content
      engagementType = 'both',
      generateAIComment = true,
      scheduledFor,
    }: {
      postUrl: string;
      postContent?: string;
      engagementType?: EngagementType;
      generateAIComment?: boolean;
      scheduledFor?: string;
    } = body;

    if (!postUrl) {
      return NextResponse.json({ error: 'Post URL is required' }, { status: 400 });
    }

    // Extract post URN from URL
    const postUrn = extractPostUrn(postUrl);
    if (!postUrn) {
      return NextResponse.json({ 
        error: 'Could not extract post URN from URL. Please use a valid LinkedIn post URL.' 
      }, { status: 400 });
    }

    // Check for duplicate
    const existing = await EngagementTarget.findOne({ 
      userId: user._id, 
      postUrn,
      status: { $in: ['pending', 'approved'] }
    });

    if (existing) {
      return NextResponse.json({ 
        error: 'This post is already in your engagement queue' 
      }, { status: 409 });
    }

    // Try to fetch post details
    let postContent: string | undefined = providedContent;
    let postAuthor: string | undefined;
    let postAuthorName: string | undefined;

    // Extract author from URL if possible (e.g., /posts/username_...)
    const authorMatch = postUrl.match(/linkedin\.com\/posts\/([^_\/]+)/);
    if (authorMatch) {
      postAuthor = authorMatch[1];
    }

    // First try scraping the public page (works without API auth)
    if (!postContent) {
      const scraped = await scrapeLinkedInPost(postUrl);
      if (scraped.success && scraped.data) {
        postContent = scraped.data.content;
        postAuthor = postAuthor || scraped.data.author;
        postAuthorName = scraped.data.authorName;
      }
    }

    // Fallback: Try LinkedIn API (only works for your own posts)
    if (!postContent) {
      const postDetails = await getPostDetails(session.user.email, postUrn);
      if (postDetails.success && postDetails.post) {
        postContent = postDetails.post.content;
        postAuthor = postAuthor || postDetails.post.author;
      }
    }

    // Use author name if available, otherwise username
    const authorForAI = postAuthorName || postAuthor;

    // Generate AI comment if requested
    let aiGeneratedComment: string | undefined;
    if (generateAIComment && (engagementType === 'comment' || engagementType === 'both')) {
      try {
        if (postContent) {
          aiGeneratedComment = await generateComment({
            postContent,
            postAuthor: authorForAI,
            style: 'professional',
          });
        }
      } catch (aiError) {
        log.error('AI comment generation failed', { error: aiError instanceof Error ? aiError.message : String(aiError) });
        // Continue without AI comment
      }
    }

    const engagement = await EngagementTarget.create({
      userId: user._id,
      postUrl,
      postUrn,
      postAuthor: authorForAI || postAuthor,
      postContent,
      engagementType,
      aiGeneratedComment,
      status: 'pending',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
    });

    return NextResponse.json({
      success: true,
      engagement: {
        _id: engagement._id.toString(),
        postUrl: engagement.postUrl,
        postUrn: engagement.postUrn,
        postAuthor: engagement.postAuthor,
        postContent: engagement.postContent,
        engagementType: engagement.engagementType,
        aiGeneratedComment: engagement.aiGeneratedComment,
        status: engagement.status,
        scheduledFor: engagement.scheduledFor?.toISOString(),
        createdAt: engagement.createdAt.toISOString(),
      },
    });
  } catch (error) {
    log.error('Error creating engagement', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create engagement' }, { status: 500 });
  }
}

// POST /api/engagements/bulk - Create multiple engagement targets
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
      postUrls,
      engagementType = 'both',
    }: {
      postUrls: string[];
      engagementType?: EngagementType;
    } = body;

    if (!postUrls || !Array.isArray(postUrls) || postUrls.length === 0) {
      return NextResponse.json({ error: 'Post URLs array is required' }, { status: 400 });
    }

    const results: { url: string; success: boolean; error?: string }[] = [];

    for (const postUrl of postUrls.slice(0, 20)) { // Limit to 20 at a time
      const postUrn = extractPostUrn(postUrl);
      
      if (!postUrn) {
        results.push({ url: postUrl, success: false, error: 'Invalid URL format' });
        continue;
      }

      // Check for duplicate
      const existing = await EngagementTarget.findOne({ 
        userId: user._id, 
        postUrn,
        status: { $in: ['pending', 'approved'] }
      });

      if (existing) {
        results.push({ url: postUrl, success: false, error: 'Already in queue' });
        continue;
      }

      // Extract author from URL if possible
      let postAuthor: string | undefined;
      let postAuthorName: string | undefined;
      const authorMatch = postUrl.match(/linkedin\.com\/posts\/([^_\/]+)/);
      if (authorMatch) {
        postAuthor = authorMatch[1];
      }

      // Try scraping the public page first
      let postContent: string | undefined;
      try {
        const scraped = await scrapeLinkedInPost(postUrl);
        if (scraped.success && scraped.data) {
          postContent = scraped.data.content;
          postAuthor = postAuthor || scraped.data.author;
          postAuthorName = scraped.data.authorName;
        }
      } catch {
        // Ignore scraping errors
      }

      // Fallback: Try LinkedIn API (only works for own posts)
      if (!postContent) {
        try {
          const postDetails = await getPostDetails(session.user.email, postUrn);
          if (postDetails.success && postDetails.post) {
            postContent = postDetails.post.content;
            postAuthor = postAuthor || postDetails.post.author;
          }
        } catch {
          // Ignore - we'll generate generic comments
        }
      }

      // Generate AI comment if we have content and engagement type needs comment
      let aiGeneratedComment: string | undefined;
      if (postContent && (engagementType === 'comment' || engagementType === 'both')) {
        try {
          aiGeneratedComment = await generateComment({
            postContent,
            postAuthor: postAuthorName || postAuthor,
            style: 'professional',
          });
        } catch {
          // Continue without AI comment - can be generated later
        }
      }

      try {
        await EngagementTarget.create({
          userId: user._id,
          postUrl,
          postUrn,
          postAuthor: postAuthorName || postAuthor,
          postContent,
          engagementType,
          aiGeneratedComment,
          status: 'pending',
        });
        results.push({ url: postUrl, success: true });
      } catch {
        results.push({ url: postUrl, success: false, error: 'Failed to create' });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Added ${successful} posts to engagement queue${failed > 0 ? `, ${failed} failed` : ''}`,
      results,
    });
  } catch (error) {
    log.error('Error bulk creating engagements', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create engagements' }, { status: 500 });
  }
}

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:[id]:analytics');

interface SocialMetadataResponse {
  reactionSummaries?: Record<string, { reactionType: string; count: number }>;
  commentSummary?: { count: number; topLevelCount: number };
  commentsState?: string;
  entity?: string;
}

interface OrgShareStatisticsResponse {
  elements?: Array<{
    totalShareStatistics?: {
      shareCount?: number;
      clickCount?: number;
      engagement?: number;
      likeCount?: number;
      impressionCount?: number;
      commentCount?: number;
      uniqueImpressionsCount?: number;
    };
  }>;
}

// GET /api/posts/[id]/analytics - Get analytics for a published post
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
    if (!user || !user.linkedinAccessToken) {
      return NextResponse.json({ error: 'LinkedIn not connected' }, { status: 400 });
    }

    const post = await Post.findOne({ _id: id, userId: user._id });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.status !== 'published' || !post.linkedinPostId) {
      return NextResponse.json({ error: 'Post not published yet' }, { status: 400 });
    }

    // Build the activity URN from the post ID
    // LinkedIn post IDs are typically in format: urn:li:share:123456 or urn:li:ugcPost:123456
    const postUrn = post.linkedinPostId;
    const activityUrn = postUrn.replace('urn:li:share:', 'urn:li:activity:')
                               .replace('urn:li:ugcPost:', 'urn:li:activity:');
    const encodedUrn = encodeURIComponent(activityUrn);

    const analytics: {
      reactions: Record<string, number>;
      totalReactions: number;
      comments: number;
      shares?: number;
      impressions?: number;
      uniqueImpressions?: number;
      clicks?: number;
      engagement?: number;
      postAs: string;
      organizationName?: string;
    } = {
      reactions: {},
      totalReactions: 0,
      comments: 0,
      postAs: post.postAs || 'person',
      ...(post.organizationName !== undefined && { organizationName: post.organizationName }),
    };

    // Fetch social metadata (reactions and comments) - available for all posts
    try {
      const socialMetadataResponse = await fetch(
        `https://api.linkedin.com/v2/socialMetadata/${encodedUrn}`,
        {
          headers: {
            'Authorization': `Bearer ${user.linkedinAccessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      if (socialMetadataResponse.ok) {
        const socialData: SocialMetadataResponse = await socialMetadataResponse.json();
        
        // Process reactions
        if (socialData.reactionSummaries) {
          for (const [type, data] of Object.entries(socialData.reactionSummaries)) {
            analytics.reactions[type.toLowerCase()] = data.count;
            analytics.totalReactions += data.count;
          }
        }
        
        // Process comments
        if (socialData.commentSummary) {
          analytics.comments = socialData.commentSummary.count || 0;
        }
      }
    } catch (err) {
      log.error('Error fetching social metadata', { error: err instanceof Error ? err.message : String(err) });
    }

    // For organization posts, fetch additional share statistics (impressions, clicks, etc.)
    if (post.postAs === 'organization' && post.organizationId) {
      try {
        // Organization Share Statistics API
        const orgStatsResponse = await fetch(
          `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${post.organizationId}&shares=List(${encodedUrn})`,
          {
            headers: {
              'Authorization': `Bearer ${user.linkedinAccessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          }
        );

        if (orgStatsResponse.ok) {
          const statsData: OrgShareStatisticsResponse = await orgStatsResponse.json();
          const shareStats = statsData.elements?.[0]?.totalShareStatistics;
          
          if (shareStats) {
            if (shareStats.impressionCount !== undefined) analytics.impressions = shareStats.impressionCount;
            if (shareStats.uniqueImpressionsCount !== undefined) analytics.uniqueImpressions = shareStats.uniqueImpressionsCount;
            if (shareStats.clickCount !== undefined) analytics.clicks = shareStats.clickCount;
            if (shareStats.shareCount !== undefined) analytics.shares = shareStats.shareCount;
            if (shareStats.engagement !== undefined) analytics.engagement = shareStats.engagement;
          }
        } else {
          const errorText = await orgStatsResponse.text();
          log.error('Org stats error', { status: orgStatsResponse.status, error: errorText });
        }
      } catch (err) {
        log.error('Error fetching organization share statistics', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      postId: post._id,
      linkedinPostId: post.linkedinPostId,
      publishedAt: post.publishedAt,
      analytics,
    });
  } catch (error) {
    log.error('Error fetching post analytics', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

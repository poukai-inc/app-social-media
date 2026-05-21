import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import type { PlatformType } from '@/lib/platforms/types';
import type {
  EngagementDataPoint} from '@/lib/platforms/schedule-optimizer';
import {
  analyzeAndRecommendSchedule,
  quickAnalyzeSchedule,
  getDefaultTimingRecommendations
} from '@/lib/platforms/schedule-optimizer';
import { logger } from '@/lib/logger';

const log = logger.child('api:schedule:optimize');

/**
 * GET /api/schedule/optimize
 * Analyze engagement data across platforms and recommend optimal posting times
 * 
 * Query params:
 * - pageId: (optional) Specific page to analyze
 * - quick: (optional) If true, skip AI analysis for faster response
 * - platforms: (optional) Comma-separated list of platforms to analyze
 */
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
    const pageId = searchParams.get('pageId');
    const quick = searchParams.get('quick') === 'true';
    const platformsParam = searchParams.get('platforms');

    // Build query for posts
    const postQuery: Record<string, unknown> = {
      userId: user._id,
      status: 'published',
      publishedAt: { $exists: true },
    };

    if (pageId) {
      postQuery.pageId = pageId;
    }

    // Get all published posts with their metrics
    const posts = await Post.find(postQuery)
      .select('publishedAt platformResults performance targetPlatforms content media')
      .sort({ publishedAt: -1 })
      .limit(500) // Analyze up to 500 recent posts
      .lean();

    // Determine which platforms to analyze
    let platformsToAnalyze: PlatformType[];
    
    if (platformsParam) {
      platformsToAnalyze = platformsParam.split(',') as PlatformType[];
    } else if (pageId) {
      // Get platforms from page connections
      const page = await Page.findById(pageId);
      platformsToAnalyze = page?.connections
        ?.filter((c: { isActive: boolean }) => c.isActive)
        ?.map((c: { platform: PlatformType }) => c.platform) || ['linkedin'];
    } else {
      // Get all unique platforms from posts
      const allPlatforms = new Set<PlatformType>();
      for (const post of posts) {
        if (post.platformResults) {
          for (const result of post.platformResults) {
            if (result.status === 'published') {
              allPlatforms.add(result.platform);
            }
          }
        }
        // Legacy posts
        if (post.targetPlatforms) {
          for (const p of post.targetPlatforms) {
            allPlatforms.add(p);
          }
        }
      }
      platformsToAnalyze = allPlatforms.size > 0 
        ? Array.from(allPlatforms) 
        : ['linkedin', 'facebook', 'twitter'];
    }

    // Convert posts to engagement data points
    const engagementData: EngagementDataPoint[] = [];

    for (const post of posts) {
      if (!post.publishedAt) continue;

      const publishDate = new Date(post.publishedAt);
      const dayOfWeek = publishDate.getDay();
      const hourOfDay = publishDate.getHours();

      // Check if post has media
      const hasImage = post.media?.some((m: { type: string }) => m.type === 'image');
      const hasVideo = post.media?.some((m: { type: string }) => m.type === 'video');
      const contentType = hasVideo ? 'video' : hasImage ? 'image' : 'text';

      // Process platform results (new format)
      if (post.platformResults && post.platformResults.length > 0) {
        for (const result of post.platformResults) {
          if (result.status !== 'published' || !result.metrics) continue;

          const metrics = result.metrics;
          const impressions = metrics.impressions || 1;
          const totalEngagement = (metrics.reactions || 0) + (metrics.comments || 0) + (metrics.shares || 0);
          const engagementRate = totalEngagement / impressions;

          engagementData.push({
            platform: result.platform,
            postId: result.postId || post._id.toString(),
            publishedAt: publishDate,
            dayOfWeek,
            hourOfDay,
            impressions,
            reactions: metrics.reactions || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            clicks: metrics.clicks,
            engagementRate,
            contentType,
            contentLength: post.content?.length,
          });
        }
      }
      // Legacy format (performance field)
      else if (post.performance) {
        const metrics = post.performance;
        const impressions = metrics.impressions || 1;
        const totalEngagement = (metrics.reactions || 0) + (metrics.comments || 0) + (metrics.shares || 0);
        const engagementRate = totalEngagement / impressions;

        engagementData.push({
          platform: 'linkedin', // Legacy posts were LinkedIn only
          postId: post._id.toString(),
          publishedAt: publishDate,
          dayOfWeek,
          hourOfDay,
          impressions,
          reactions: metrics.reactions || 0,
          comments: metrics.comments || 0,
          shares: metrics.shares || 0,
          clicks: metrics.clicks,
          engagementRate,
          contentType,
          contentLength: post.content?.length,
        });
      }
    }

    // If no data, return defaults
    if (engagementData.length < 5) {
      return NextResponse.json({
        success: true,
        dataPoints: engagementData.length,
        message: 'Insufficient data for personalized recommendations. Using industry defaults.',
        recommendations: getDefaultTimingRecommendations(platformsToAnalyze),
        suggestedWeeklySchedule: null,
        globalInsights: [
          'Post more content to get personalized scheduling recommendations',
          'We need at least 5 published posts with metrics to analyze patterns',
        ],
      });
    }

    // Analyze and generate recommendations
    let result;
    
    if (quick) {
      result = quickAnalyzeSchedule(engagementData, platformsToAnalyze);
      return NextResponse.json({
        success: true,
        dataPoints: engagementData.length,
        ...result,
      });
    } else {
      result = await analyzeAndRecommendSchedule(engagementData, platformsToAnalyze);
      return NextResponse.json({
        success: true,
        dataPoints: engagementData.length,
        ...result,
      });
    }
  } catch (error) {
    log.error('Schedule optimization error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to analyze schedule' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedule/optimize
 * Apply recommended schedule to a page
 */
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
    const { pageId, schedule } = body;

    if (!pageId || !schedule) {
      return NextResponse.json(
        { error: 'pageId and schedule are required' },
        { status: 400 }
      );
    }

    // Find the page
    const page = await Page.findOne({ _id: pageId, userId: user._id });
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Update page schedule
    // Convert the weekly schedule format to the page's schedule format
    type DaySchedule = { day: string; posts: { time: string }[] };
    
    // Map day names to day numbers (0 = Sunday, 1 = Monday, etc.)
    const dayNameToNumber: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    
    const dayNumbers: number[] = [];
    (schedule as DaySchedule[]).forEach((day: DaySchedule) => {
      if (day.posts.length > 0) {
        const num = dayNameToNumber[day.day];
        if (num !== undefined && !dayNumbers.includes(num)) {
          dayNumbers.push(num);
        }
      }
    });
    const preferredDays: number[] = dayNumbers.sort((a, b) => a - b);

    const timeSet = new Set<string>();
    (schedule as DaySchedule[]).forEach((day: DaySchedule) => {
      day.posts.forEach((p: { time: string }) => {
        // Convert "9:00 AM" to "09:00"
        const match = p.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (match) {
          let hour = parseInt(match[1]);
          if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
          if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
          timeSet.add(`${hour.toString().padStart(2, '0')}:${match[2]}`);
        } else {
          timeSet.add(p.time);
        }
      });
    });
    const preferredTimes: string[] = Array.from(timeSet).sort();

    page.schedule.preferredDays = preferredDays;
    page.schedule.preferredTimes = preferredTimes;
    await page.save();

    return NextResponse.json({
      success: true,
      message: 'Schedule updated successfully',
      schedule: {
        preferredDays,
        preferredTimes,
      },
    });
  } catch (error) {
    log.error('Schedule apply error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to apply schedule' },
      { status: 500 }
    );
  }
}

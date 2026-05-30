/**
 * ICP Engagement API Route
 * 
 * Endpoints:
 * - POST: Run the ICP engagement agent for a page
 * - GET: Get engagement stats and history
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { findOwnedPage, userOwnsPage } from '@/lib/page-access';
import ICPEngagement from '@/lib/models/ICPEngagement';
import type { AgentConfig } from '@/lib/engagement/icp-engagement-agent';
import { runICPEngagementAgent } from '@/lib/engagement/icp-engagement-agent';
import { analyzePageICP } from '@/lib/engagement/icp-analyzer';
import mongoose from 'mongoose';
import { logger } from '@/lib/logger';

const log = logger.child('api:icp-engagement');

/**
 * POST /api/icp-engagement
 * Run the ICP engagement agent
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const body = await request.json();
    const { pageId, dryRun = true, config: configOverrides } = body;

    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }

    // Verify the caller owns this page (prevents cross-tenant agent runs /
    // AI-spend abuse on another tenant's page). (issue #17)
    const page = await findOwnedPage(session, pageId);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Check for Twitter connection
    const hasTwitter = page.connections?.some(
      (c: { platform: string; isActive: boolean }) => c.platform === 'twitter' && c.isActive
    );
    if (!hasTwitter) {
      return NextResponse.json(
        { error: 'No active Twitter connection found. Connect Twitter first.' },
        { status: 400 }
      );
    }

    // Build agent config
    const agentConfig: Partial<AgentConfig> = {
      dryRun,
      ...configOverrides,
    };

    log.info('Running ICP engagement agent', { pageId, dryRun });

    // Run the agent
    const result = await runICPEngagementAgent(pageId, agentConfig);

    return NextResponse.json({
      success: result.success,
      summary: {
        queriesExecuted: result.queriesExecuted,
        tweetsFound: result.tweetsFound,
        tweetsEvaluated: result.tweetsEvaluated,
        repliesSent: result.repliesSent,
        repliesSuccessful: result.repliesSuccessful,
        dryRun,
      },
      engagements: result.engagements.map(e => ({
        tweetId: e.tweet.id,
        tweetText: e.tweet.text.slice(0, 100) + '...',
        author: e.tweet.author?.username,
        reply: e.reply,
        replyUrl: e.replyUrl,
        success: e.success,
        error: e.error,
      })),
      icpProfile: result.icpProfile ? {
        targetAudience: result.icpProfile.targetAudience,
        painPoints: result.icpProfile.painPoints.length,
        searchQueries: result.icpProfile.searchQueries.length,
      } : null,
      errors: result.errors,
      duration: new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime(),
    });
  } catch (error) {
    log.error('ICP engagement error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/icp-engagement?pageId=xxx
 * Get engagement stats and recent activity
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const action = searchParams.get('action');

    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }

    // Authorization: only the page owner may read its ICP engagement data.
    // Also guards against malformed ids reaching the ObjectId cast. (issue #17)
    if (!(await userOwnsPage(session, pageId))) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const pageObjectId = new mongoose.Types.ObjectId(pageId);

    // Action: analyze ICP
    if (action === 'analyze') {
      const result = await analyzePageICP({
        pageId,
        includeDataSources: true,
        includeHistoricalPosts: true,
      });

      return NextResponse.json(result);
    }

    // Default: get stats and recent engagements
    const stats = await ICPEngagement.getEngagementStats(pageObjectId, 30);

    const recentEngagements = await ICPEngagement.find({ pageId: pageObjectId })
      .sort({ engagedAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({
      stats,
      recentEngagements: recentEngagements.map(e => ({
        id: e._id,
        platform: e.platform,
        targetUser: e.targetUser,
        targetPost: {
          id: e.targetPost.id,
          content: e.targetPost.content.slice(0, 150) + '...',
          url: e.targetPost.url,
        },
        ourReply: e.ourReply,
        relevanceScore: e.icpMatch.relevanceScore,
        status: e.status,
        followUp: e.followUp,
        engagedAt: e.engagedAt,
      })),
    });
  } catch (error) {
    log.error('Get ICP engagement error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

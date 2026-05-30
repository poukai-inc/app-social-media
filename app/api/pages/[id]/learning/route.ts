import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { findOwnedPage } from '@/lib/page-access';
import {
  getPlatformInsights, 
  comparePlatformPerformance,
  getEngagementDataForOptimizer 
} from '@/lib/learning';
import { analyzeAndRecommendSchedule, getDefaultTimingRecommendations } from '@/lib/platforms/schedule-optimizer';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:learning');
import type { PlatformType } from '@/lib/platforms/types';

/**
 * GET /api/pages/[id]/learning
 * 
 * Get learning insights for a page:
 * - Per-platform performance analysis
 * - Optimal timing recommendations
 * - Top performing content patterns
 * - AI generation recommendations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: pageId } = await params;
    await connectToDatabase();

    // Authorization: only the page owner may read its learning insights.
    // findOwnedPage returns null for missing/foreign pages → 404. (issue #17)
    const page = await findOwnedPage(session, pageId);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Get platforms this page is connected to
    const connectedPlatforms = page.connections
      ?.filter((c: { isActive: boolean }) => c.isActive)
      .map((c: { platform: PlatformType }) => c.platform) || ['linkedin'];

    // Get insights for each platform
    const platformInsights = await Promise.all(
      connectedPlatforms.map(async (platform: PlatformType) => {
        const insights = await getPlatformInsights(pageId, platform);
        return insights;
      })
    );

    // Get cross-platform comparison
    const platformComparison = await comparePlatformPerformance(pageId, connectedPlatforms);

    // Get schedule recommendations
    let scheduleRecommendations;
    
    // Gather engagement data for all platforms
    const allEngagementData = [];
    for (const platform of connectedPlatforms) {
      const data = await getEngagementDataForOptimizer(pageId, platform);
      allEngagementData.push(...data);
    }

    if (allEngagementData.length >= 10) {
      // Enough data for AI-powered recommendations
      scheduleRecommendations = await analyzeAndRecommendSchedule(
        allEngagementData,
        connectedPlatforms,
        page.contentStrategy?.postingFrequency || 3
      );
    } else {
      // Use default recommendations
      scheduleRecommendations = {
        recommendations: getDefaultTimingRecommendations(connectedPlatforms),
        globalInsights: [
          'Not enough historical data for personalized recommendations yet',
          `Currently have ${allEngagementData.length} data points, need at least 10 for learning`,
          'Recommendations will improve as more posts are published and analyzed',
        ],
        suggestedWeeklySchedule: [],
        conflictResolution: [],
      };
    }

    // Summary stats
    const summary = {
      totalDataPoints: allEngagementData.length,
      hasEnoughDataForLearning: allEngagementData.length >= 10,
      platformsAnalyzed: connectedPlatforms.length,
      bestOverallPlatform: platformComparison.platforms.reduce(
        (best, p) => p.avgPerformanceScore > (best?.avgPerformanceScore || 0) ? p : best,
        null as typeof platformComparison.platforms[0] | null
      )?.platform || connectedPlatforms[0],
    };

    return NextResponse.json({
      success: true,
      pageId,
      pageName: page.name,
      summary,
      platformInsights,
      platformComparison,
      scheduleRecommendations,
    });

  } catch (error) {
    log.error('Learning insights error', { error: error instanceof Error ? error.message : String(error) });
    // Do not leak internal error detail to the client. (issue #45)
    return NextResponse.json(
      { error: 'Failed to get learning insights' },
      { status: 500 }
    );
  }
}

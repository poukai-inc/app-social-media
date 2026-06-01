import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import type Page from '@/lib/models/Page';
import type { PlatformEngagement, MetricSnapshot } from '@/lib/models/EngagementHistory';
import EngagementHistory from '@/lib/models/EngagementHistory';
import { platformRegistry } from '@/lib/platforms';
import type { PlatformType, PlatformConnection } from '@/lib/platforms/types';
import type { IPlatformConnection } from '@/lib/models/Page';
import { logger } from '@/lib/logger';

const log = logger.child('cron:collect-metrics');

/**
 * Metrics Collection Cron Job
 * 
 * This job runs periodically to:
 * 1. Fetch current metrics for all published posts from each platform
 * 2. Store metric snapshots in EngagementHistory for trend analysis
 * 3. Calculate performance scores per platform
 * 4. Update aggregate statistics
 * 
 * Recommended schedule: Every 6 hours
 */

interface CollectionResult {
  postId: string;
  platform: PlatformType;
  status: 'success' | 'failed' | 'skipped';
  metrics?: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
  };
  error?: string;
}

/**
 * Calculate performance score based on engagement metrics
 * Score is normalized 0-100 based on historical averages for the page/platform
 */
function calculatePerformanceScore(
  metrics: { impressions: number; likes: number; comments: number; shares: number; engagementRate: number },
  platformAverages: { avgEngagementRate: number; avgImpressions: number } | null
): number {
  if (!platformAverages || platformAverages.avgEngagementRate === 0) {
    // No baseline yet, use absolute metrics
    const baseScore = Math.min(
      (metrics.impressions / 1000) * 20 +
      (metrics.likes / 50) * 30 +
      (metrics.comments / 10) * 30 +
      (metrics.shares / 5) * 20,
      100
    );
    return Math.round(baseScore);
  }
  
  // Compare to historical averages
  const engagementRatio = metrics.engagementRate / platformAverages.avgEngagementRate;
  const impressionRatio = metrics.impressions / Math.max(platformAverages.avgImpressions, 1);
  
  // Weighted score: 60% engagement rate, 40% impressions
  const score = (engagementRatio * 60 + impressionRatio * 40);
  
  // Normalize to 0-100
  return Math.min(Math.round(score), 100);
}

/**
 * Determine performance tier based on score
 */
function getPerformanceTier(score: number): 'top' | 'above_average' | 'average' | 'below_average' | 'poor' {
  if (score >= 80) return 'top';
  if (score >= 60) return 'above_average';
  if (score >= 40) return 'average';
  if (score >= 20) return 'below_average';
  return 'poor';
}

/**
 * Get historical averages for a page on a specific platform
 */
async function getPlatformAverages(
  pageId: string,
  platform: PlatformType
): Promise<{ avgEngagementRate: number; avgImpressions: number } | null> {
  const result = await EngagementHistory.aggregate([
    {
      $match: {
        // pageId is an ObjectId field; the caller passes a string. Cast so the
        // match actually hits (and uses the {pageId, platforms.platform} index)
        // instead of silently returning 0 and disabling historical scoring. (issue #23)
        pageId: new mongoose.Types.ObjectId(pageId),
        'platforms.platform': platform,
      },
    },
    {
      $unwind: '$platforms',
    },
    {
      $match: {
        'platforms.platform': platform,
      },
    },
    {
      $group: {
        _id: null,
        avgEngagementRate: { $avg: '$platforms.currentMetrics.engagementRate' },
        avgImpressions: { $avg: '$platforms.currentMetrics.impressions' },
        count: { $sum: 1 },
      },
    },
  ]);
  
  if (result.length === 0 || result[0].count < 5) {
    return null; // Not enough data
  }
  
  return {
    avgEngagementRate: result[0].avgEngagementRate,
    avgImpressions: result[0].avgImpressions,
  };
}

/**
 * Extract hashtags from content
 */
function extractHashtags(content: string): string[] {
  const matches = content.match(/#\w+/g);
  return matches ? matches.map(h => h.toLowerCase()) : [];
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization') ?? '';
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    await connectToDatabase();

    const results: CollectionResult[] = [];
    
    // Find all published posts from the last 30 days that need metric updates
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Bound the scan so one run cannot grow without limit as total post volume
    // grows; oldest-updated first so every post is eventually refreshed. (issue #23)
    const MAX_POSTS_PER_RUN = 500;
    const publishedPosts = await Post.find({
      status: 'published',
      publishedAt: { $gte: thirtyDaysAgo },
    })
      .sort({ updatedAt: 1 })
      .limit(MAX_POSTS_PER_RUN)
      .populate('pageId');

    if (publishedPosts.length === MAX_POSTS_PER_RUN) {
      log.warn('Metrics run hit the per-run post cap; remaining posts roll to the next run', { cap: MAX_POSTS_PER_RUN });
    }
    log.info('Processing published posts for metrics collection', { count: publishedPosts.length });

    // Memoize historical averages per (pageId, platform) for this run so the
    // aggregate runs once per pair instead of once per platform per post. (issue #23)
    const averagesCache = new Map<string, { avgEngagementRate: number; avgImpressions: number } | null>();
    const getCachedPlatformAverages = async (pageId: string, platform: PlatformType) => {
      const key = `${pageId}:${platform}`;
      const hit = averagesCache.get(key);
      if (hit !== undefined) return hit;
      const value = await getPlatformAverages(pageId, platform);
      averagesCache.set(key, value);
      return value;
    };

    for (const post of publishedPosts) {
      const page = post.pageId as typeof Page.prototype;
      if (!page || !page.connections) continue;

      // Get or create engagement history document
      let engagementHistory = await EngagementHistory.findOne({ postId: post._id });
      
      if (!engagementHistory) {
        // Create new engagement history
        engagementHistory = new EngagementHistory({
          postId: post._id,
          pageId: page._id,
          userId: post.userId,
          contentMetadata: {
            angle: post.aiAnalysis?.angle || 'unknown',
            topic: post.sourceContent?.title || 'general',
            contentLength: post.content.length,
            hasMedia: post.media && post.media.length > 0,
            mediaType: post.media && post.media.length > 0 ? (post.media[0]?.type ?? 'none') : 'none',
            hashtags: extractHashtags(post.content),
          },
          platforms: [],
          aggregateStats: {
            totalImpressions: 0,
            totalReactions: 0,
            totalComments: 0,
            totalShares: 0,
            avgEngagementRate: 0,
          },
        });
      }

      // Process each platform this post was published to
      const platformResults = post.platformResults || [];
      
      for (const platformResult of platformResults) {
        if (platformResult.status !== 'published' || !platformResult.postId) continue;
        
        const platform = platformResult.platform as PlatformType;
        const connection = page.connections.find(
          (c: IPlatformConnection) => c.platform === platform && c.isActive
        );
        
        if (!connection) {
          results.push({
            postId: post._id.toString(),
            platform,
            status: 'skipped',
            error: 'No active connection',
          });
          continue;
        }

        // Check if token is expired
        if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
          results.push({
            postId: post._id.toString(),
            platform,
            status: 'skipped',
            error: 'Token expired',
          });
          continue;
        }

        const adapter = platformRegistry.getAdapter(platform);
        if (!adapter || !adapter.fetchMetrics) {
          results.push({
            postId: post._id.toString(),
            platform,
            status: 'skipped',
            error: 'No metrics adapter',
          });
          continue;
        }

        try {
          // Fetch metrics from platform
          const metrics = await adapter.fetchMetrics(
            connection as unknown as PlatformConnection,
            platformResult.postId
          );

          const engagementRate = metrics.impressions && metrics.impressions > 0
            ? ((metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0)) / metrics.impressions
            : 0;

          // Get platform averages for scoring (memoized per pageId+platform)
          const platformAverages = await getCachedPlatformAverages(page._id.toString(), platform);
          
          const currentMetrics = {
            impressions: metrics.impressions || 0,
            reach: metrics.reach || 0,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            clicks: metrics.clicks || 0,
            engagementRate,
          };

          const performanceScore = calculatePerformanceScore(
            { ...currentMetrics, engagementRate },
            platformAverages
          );

          // Create metric snapshot
          const snapshot: MetricSnapshot = {
            timestamp: new Date(),
            ...currentMetrics,
          };

          // Find or create platform engagement entry
          let platformEngagement = engagementHistory.platforms.find(
            (p: PlatformEngagement) => p.platform === platform
          );

          const publishedAt = platformResult.publishedAt || post.publishedAt || new Date();
          const publishedDate = new Date(publishedAt);

          if (!platformEngagement) {
            platformEngagement = {
              platform,
              platformPostId: platformResult.postId,
              ...(platformResult.postUrl !== undefined && { platformPostUrl: platformResult.postUrl }),
              publishedAt: publishedDate,
              currentMetrics,
              metricHistory: [snapshot],
              timing: {
                dayOfWeek: publishedDate.getDay(),
                hourOfDay: publishedDate.getHours(),
                timezone: page.schedule?.timezone || 'UTC',
              },
              performanceScore,
              performanceTier: getPerformanceTier(performanceScore),
              lastUpdated: new Date(),
            };
            engagementHistory.platforms.push(platformEngagement);
          } else {
            // Update existing
            platformEngagement.currentMetrics = currentMetrics;
            platformEngagement.metricHistory.push(snapshot);
            
            // Keep only last 30 snapshots (about 7.5 days at 6-hour intervals)
            if (platformEngagement.metricHistory.length > 30) {
              platformEngagement.metricHistory = platformEngagement.metricHistory.slice(-30);
            }
            
            platformEngagement.performanceScore = performanceScore;
            platformEngagement.performanceTier = getPerformanceTier(performanceScore);
            platformEngagement.lastUpdated = new Date();
          }

          results.push({
            postId: post._id.toString(),
            platform,
            status: 'success',
            metrics: {
              impressions: currentMetrics.impressions,
              likes: currentMetrics.likes,
              comments: currentMetrics.comments,
              shares: currentMetrics.shares,
            },
          });

        } catch (error) {
          log.error('Failed to fetch metrics for post', { postId: post._id, platform, error: error instanceof Error ? error.message : String(error) });
          results.push({
            postId: post._id.toString(),
            platform,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update aggregate stats
      if (engagementHistory.platforms.length > 0) {
        const totals = engagementHistory.platforms.reduce(
          (acc: { impressions: number; reactions: number; comments: number; shares: number; engagementSum: number }, p: PlatformEngagement) => ({
            impressions: acc.impressions + p.currentMetrics.impressions,
            reactions: acc.reactions + p.currentMetrics.likes,
            comments: acc.comments + p.currentMetrics.comments,
            shares: acc.shares + p.currentMetrics.shares,
            engagementSum: acc.engagementSum + p.currentMetrics.engagementRate,
          }),
          { impressions: 0, reactions: 0, comments: 0, shares: 0, engagementSum: 0 }
        );

        const bestPlatform = engagementHistory.platforms.reduce(
          (best: PlatformEngagement | null, p: PlatformEngagement) =>
            !best || p.performanceScore > best.performanceScore ? p : best,
          null
        );
        engagementHistory.aggregateStats = {
          totalImpressions: totals.impressions,
          totalReactions: totals.reactions,
          totalComments: totals.comments,
          totalShares: totals.shares,
          avgEngagementRate: totals.engagementSum / engagementHistory.platforms.length,
          ...(bestPlatform !== null && { bestPerformingPlatform: bestPlatform.platform }),
        };
      }

      await engagementHistory.save();
    }

    // Summary
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      success: true,
      summary: {
        totalPosts: publishedPosts.length,
        metricsCollected: successCount,
        failed: failedCount,
        skipped: skippedCount,
      },
      results,
    });

  } catch (error) {
    log.error('Metrics collection cron error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    );
  }
}

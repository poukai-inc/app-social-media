import mongoose from 'mongoose';
import type { PlatformEngagement } from '../models/EngagementHistory';
import EngagementHistory from '../models/EngagementHistory';
import type { PlatformType } from '../platforms/types';
import type { EngagementDataPoint } from '../platforms/schedule-optimizer';
import { logger } from '@/lib/logger';

const log = logger.child('learning:platform-learning');
import type {
  PostAnalysis,
  PostMetrics
} from './stats-reviewer';
import { 
  analyzePostMetrics, 
  generateLearningPrompt, 
  comparePosts as comparePostMetrics,
  getPlatformMetricGuide
} from './stats-reviewer';

/**
 * Platform Learning Service
 * 
 * Provides per-platform insights by analyzing historical engagement data:
 * - Optimal posting times per platform
 * - Top-performing content patterns per platform
 * - Content recommendations based on what works on each platform
 */

// ============================================
// Types
// ============================================

export interface PlatformInsights {
  platform: PlatformType;
  sampleSize: number;
  
  // Timing insights
  bestDays: { day: number; dayName: string; avgEngagement: number; postCount: number }[];
  bestHours: { hour: number; hourFormatted: string; avgEngagement: number; postCount: number }[];
  optimalSlots: { day: number; hour: number; score: number; confidence: number }[];
  
  // Content insights
  topPerformingAngles: { angle: string; avgScore: number; count: number }[];
  optimalContentLength: { min: number; max: number; avg: number };
  hashtagPerformance: { hashtag: string; avgEngagement: number; count: number }[];
  mediaPerformance: {
    withMedia: { avgScore: number; count: number };
    withoutMedia: { avgScore: number; count: number };
    bestMediaType: 'image' | 'video' | 'none';
  };
  
  // Top examples for AI learning
  topPosts: {
    postId: string;
    content?: string;
    angle: string;
    performanceScore: number;
    metrics: {
      impressions: number;
      likes: number;
      comments: number;
      shares: number;
    };
  }[];
}

export interface CrossPlatformComparison {
  pageId: string;
  platforms: {
    platform: PlatformType;
    avgPerformanceScore: number;
    postCount: number;
    bestTimingOverlap: boolean;
  }[];
  recommendations: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
}

// ============================================
// Core Learning Functions
// ============================================

/**
 * Validate ObjectId string
 */
function isValidObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

/**
 * Get platform-specific insights for a page
 */
export async function getPlatformInsights(
  pageId: string,
  platform: PlatformType,
  lookbackDays: number = 90
): Promise<PlatformInsights> {
  // Validate inputs
  if (!isValidObjectId(pageId)) {
    log.error('Invalid pageId format', { pageId });
    return getEmptyInsights(platform);
  }
  
  if (lookbackDays < 1 || lookbackDays > 365) {
    lookbackDays = 90; // Reset to default
  }
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  try {
    // Fetch all engagement history for this page and platform
    const histories = await EngagementHistory.find({
      pageId: new mongoose.Types.ObjectId(pageId),
      'platforms.platform': platform,
      createdAt: { $gte: cutoffDate },
    }).populate('postId', 'content');

    const platformData: (PlatformEngagement & { content?: string; postId: string })[] = [];
    
    for (const history of histories) {
      const platformEngagement = history.platforms.find(
        (p: PlatformEngagement) => p.platform === platform
      );
      if (platformEngagement) {
      platformData.push({
        ...platformEngagement,
        content: (history.postId as unknown as { content?: string })?.content,
        postId: history.postId.toString(),
      });
    }
  }

  if (platformData.length === 0) {
    return getEmptyInsights(platform);
  }

  // Analyze timing patterns
  const byDay = new Map<number, { total: number; count: number }>();
  const byHour = new Map<number, { total: number; count: number }>();
  const byDayHour = new Map<string, { total: number; count: number }>();

  for (const data of platformData) {
    const day = data.timing.dayOfWeek;
    const hour = data.timing.hourOfDay;
    const score = data.performanceScore;

    // By day
    const dayData = byDay.get(day) || { total: 0, count: 0 };
    dayData.total += score;
    dayData.count += 1;
    byDay.set(day, dayData);

    // By hour
    const hourData = byHour.get(hour) || { total: 0, count: 0 };
    hourData.total += score;
    hourData.count += 1;
    byHour.set(hour, hourData);

    // By day+hour
    const key = `${day}-${hour}`;
    const dhData = byDayHour.get(key) || { total: 0, count: 0 };
    dhData.total += score;
    dhData.count += 1;
    byDayHour.set(key, dhData);
  }

  // Best days
  const bestDays = Array.from(byDay.entries())
    .map(([day, stats]) => ({
      day,
      dayName: DAY_NAMES[day],
      avgEngagement: stats.total / stats.count,
      postCount: stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  // Best hours
  const bestHours = Array.from(byHour.entries())
    .map(([hour, stats]) => ({
      hour,
      hourFormatted: formatHour(hour),
      avgEngagement: stats.total / stats.count,
      postCount: stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  // Optimal slots (day + hour combos)
  const optimalSlots = Array.from(byDayHour.entries())
    .map(([key, stats]) => {
      const [day, hour] = key.split('-').map(Number);
      return {
        day,
        hour,
        score: stats.total / stats.count,
        confidence: Math.min(stats.count / 5, 1), // Higher confidence with more data
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Analyze content patterns
  const angleStats = new Map<string, { total: number; count: number }>();
  const hashtagStats = new Map<string, { total: number; count: number }>();
  let withMediaTotal = 0, withMediaCount = 0;
  let withoutMediaTotal = 0, withoutMediaCount = 0;
  const mediaTypeStats = new Map<string, { total: number; count: number }>();
  const contentLengths: number[] = [];

  for (const history of histories) {
    const platformEngagement = history.platforms.find(
      (p: PlatformEngagement) => p.platform === platform
    );
    if (!platformEngagement) continue;

    const score = platformEngagement.performanceScore;
    const metadata = history.contentMetadata;

    // Angle stats
    if (metadata.angle) {
      const angleData = angleStats.get(metadata.angle) || { total: 0, count: 0 };
      angleData.total += score;
      angleData.count += 1;
      angleStats.set(metadata.angle, angleData);
    }

    // Hashtag stats
    for (const hashtag of metadata.hashtags) {
      const hashtagData = hashtagStats.get(hashtag) || { total: 0, count: 0 };
      hashtagData.total += score;
      hashtagData.count += 1;
      hashtagStats.set(hashtag, hashtagData);
    }

    // Media stats
    if (metadata.hasMedia) {
      withMediaTotal += score;
      withMediaCount += 1;
      if (metadata.mediaType) {
        const mtData = mediaTypeStats.get(metadata.mediaType) || { total: 0, count: 0 };
        mtData.total += score;
        mtData.count += 1;
        mediaTypeStats.set(metadata.mediaType, mtData);
      }
    } else {
      withoutMediaTotal += score;
      withoutMediaCount += 1;
    }

    // Content length
    contentLengths.push(metadata.contentLength);
  }

  // Top performing angles
  const topPerformingAngles = Array.from(angleStats.entries())
    .map(([angle, stats]) => ({
      angle,
      avgScore: stats.total / stats.count,
      count: stats.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Hashtag performance
  const hashtagPerformance = Array.from(hashtagStats.entries())
    .filter(([, stats]) => stats.count >= 2) // Only hashtags used at least twice
    .map(([hashtag, stats]) => ({
      hashtag,
      avgEngagement: stats.total / stats.count,
      count: stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 20);

  // Best media type
  let bestMediaType: 'image' | 'video' | 'none' = 'none';
  let bestMediaScore = 0;
  for (const [type, stats] of mediaTypeStats.entries()) {
    const avg = stats.total / stats.count;
    if (avg > bestMediaScore) {
      bestMediaScore = avg;
      bestMediaType = type as 'image' | 'video' | 'none';
    }
  }

  // Content length stats
  const sortedLengths = contentLengths.sort((a, b) => a - b);
  const optimalContentLength = {
    min: sortedLengths[Math.floor(sortedLengths.length * 0.25)] || 500,
    max: sortedLengths[Math.floor(sortedLengths.length * 0.75)] || 1500,
    avg: sortedLengths.reduce((a, b) => a + b, 0) / sortedLengths.length || 1000,
  };

  // Top posts for AI learning
  const topPosts = platformData
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, 5)
    .map(p => ({
      postId: p.postId,
      content: p.content,
      angle: histories.find(h => h.postId.toString() === p.postId)?.contentMetadata.angle || 'unknown',
      performanceScore: p.performanceScore,
      metrics: {
        impressions: p.currentMetrics.impressions,
        likes: p.currentMetrics.likes,
        comments: p.currentMetrics.comments,
        shares: p.currentMetrics.shares,
      },
    }));

  return {
    platform,
    sampleSize: platformData.length,
    bestDays,
    bestHours: bestHours.slice(0, 6),
    optimalSlots,
    topPerformingAngles,
    optimalContentLength,
    hashtagPerformance,
    mediaPerformance: {
      withMedia: { avgScore: withMediaCount > 0 ? withMediaTotal / withMediaCount : 0, count: withMediaCount },
      withoutMedia: { avgScore: withoutMediaCount > 0 ? withoutMediaTotal / withoutMediaCount : 0, count: withoutMediaCount },
      bestMediaType,
    },
    topPosts,
  };
  } catch (error) {
    log.error('Error getting platform insights', { platform, error: error instanceof Error ? error.message : String(error) });
    return getEmptyInsights(platform);
  }
}

/**
 * Get empty insights when no data available
 */
function getEmptyInsights(platform: PlatformType): PlatformInsights {
  return {
    platform,
    sampleSize: 0,
    bestDays: [],
    bestHours: [],
    optimalSlots: [],
    topPerformingAngles: [],
    optimalContentLength: { min: 500, max: 1500, avg: 1000 },
    hashtagPerformance: [],
    mediaPerformance: {
      withMedia: { avgScore: 0, count: 0 },
      withoutMedia: { avgScore: 0, count: 0 },
      bestMediaType: 'none',
    },
    topPosts: [],
  };
}

/**
 * Get optimal posting time for a specific platform
 */
export async function getOptimalPostingTime(
  pageId: string,
  platform: PlatformType,
  preferredDays?: number[]
): Promise<{ day: number; hour: number; confidence: number } | null> {
  const insights = await getPlatformInsights(pageId, platform);
  
  if (insights.sampleSize < 5) {
    return null; // Not enough data
  }

  // Filter by preferred days if specified
  let slots = insights.optimalSlots;
  if (preferredDays && preferredDays.length > 0) {
    slots = slots.filter(s => preferredDays.includes(s.day));
  }

  if (slots.length === 0) {
    return null;
  }

  // Return the best slot
  return {
    day: slots[0].day,
    hour: slots[0].hour,
    confidence: slots[0].confidence,
  };
}

/**
 * Convert engagement history to EngagementDataPoint format for schedule-optimizer
 */
export async function getEngagementDataForOptimizer(
  pageId: string,
  platform: PlatformType,
  lookbackDays: number = 90
): Promise<EngagementDataPoint[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  const histories = await EngagementHistory.find({
    pageId: new mongoose.Types.ObjectId(pageId),
    'platforms.platform': platform,
    createdAt: { $gte: cutoffDate },
  });

  const dataPoints: EngagementDataPoint[] = [];

  for (const history of histories) {
    const platformEngagement = history.platforms.find(
      (p: PlatformEngagement) => p.platform === platform
    );
    if (!platformEngagement) continue;

    dataPoints.push({
      platform,
      postId: history.postId.toString(),
      publishedAt: platformEngagement.publishedAt,
      dayOfWeek: platformEngagement.timing.dayOfWeek,
      hourOfDay: platformEngagement.timing.hourOfDay,
      impressions: platformEngagement.currentMetrics.impressions,
      reactions: platformEngagement.currentMetrics.likes,
      comments: platformEngagement.currentMetrics.comments,
      shares: platformEngagement.currentMetrics.shares,
      clicks: platformEngagement.currentMetrics.clicks,
      engagementRate: platformEngagement.currentMetrics.engagementRate,
      contentType: history.contentMetadata.hasMedia 
        ? (history.contentMetadata.mediaType as 'image' | 'video') 
        : 'text',
      hashtags: history.contentMetadata.hashtags,
      contentLength: history.contentMetadata.contentLength,
    });
  }

  return dataPoints;
}

/**
 * Get top performing posts for AI learning prompt injection
 */
export async function getTopPostsForLearning(
  pageId: string,
  platform: PlatformType,
  limit: number = 3
): Promise<{ content: string; angle: string; score: number }[]> {
  const insights = await getPlatformInsights(pageId, platform);
  
  return insights.topPosts
    .filter(p => p.content) // Only posts with content
    .slice(0, limit)
    .map(p => ({
      content: p.content!,
      angle: p.angle,
      score: p.performanceScore,
    }));
}

/**
 * Compare performance across platforms for a page
 */
export async function comparePlatformPerformance(
  pageId: string,
  platforms: PlatformType[]
): Promise<CrossPlatformComparison> {
  const platformStats = await Promise.all(
    platforms.map(async platform => {
      const insights = await getPlatformInsights(pageId, platform);
      const avgScore = insights.topPosts.length > 0
        ? insights.topPosts.reduce((sum, p) => sum + p.performanceScore, 0) / insights.topPosts.length
        : 0;
      
      return {
        platform,
        avgPerformanceScore: avgScore,
        postCount: insights.sampleSize,
        bestTimingOverlap: false, // Will calculate below
      };
    })
  );

  // Check for timing overlap
  const allInsights = await Promise.all(
    platforms.map(p => getPlatformInsights(pageId, p))
  );
  
  // Find if best times overlap between platforms
  for (let i = 0; i < allInsights.length; i++) {
    for (let j = i + 1; j < allInsights.length; j++) {
      const insight1 = allInsights[i];
      const insight2 = allInsights[j];
      
      if (insight1.bestHours.length > 0 && insight2.bestHours.length > 0) {
        const overlap = insight1.bestHours.some(h1 =>
          insight2.bestHours.some(h2 => Math.abs(h1.hour - h2.hour) <= 1)
        );
        if (overlap) {
          platformStats[i].bestTimingOverlap = true;
          platformStats[j].bestTimingOverlap = true;
        }
      }
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  
  const bestPlatform = platformStats.reduce((best, p) => 
    p.avgPerformanceScore > best.avgPerformanceScore ? p : best
  );
  
  if (bestPlatform.avgPerformanceScore > 0) {
    recommendations.push(
      `${bestPlatform.platform} is your best performing platform with ${Math.round(bestPlatform.avgPerformanceScore)} avg score`
    );
  }

  const overlappingPlatforms = platformStats.filter(p => p.bestTimingOverlap);
  if (overlappingPlatforms.length > 1) {
    recommendations.push(
      `Stagger posts between ${overlappingPlatforms.map(p => p.platform).join(' and ')} by 30-60 minutes to avoid audience fatigue`
    );
  }

  const lowDataPlatforms = platformStats.filter(p => p.postCount < 10);
  if (lowDataPlatforms.length > 0) {
    recommendations.push(
      `Post more on ${lowDataPlatforms.map(p => p.platform).join(', ')} to improve timing recommendations`
    );
  }

  return {
    pageId,
    platforms: platformStats,
    recommendations,
  };
}
// ============================================
// Stats Reviewer Integration Functions
// ============================================

/**
 * Analyze a specific post's metrics and get detailed interpretation
 */
export async function analyzePostPerformance(
  postId: string,
  platform: PlatformType
): Promise<PostAnalysis | null> {
  try {
    const history = await EngagementHistory.findOne({
      postId: new mongoose.Types.ObjectId(postId),
      'platforms.platform': platform,
    }).populate('postId', 'content');

    if (!history) {
      return null;
    }

    const platformEngagement = history.platforms.find(
      (p: PlatformEngagement) => p.platform === platform
    );

    if (!platformEngagement) {
      return null;
    }

    const metrics: PostMetrics = {
      impressions: platformEngagement.currentMetrics.impressions,
      reach: platformEngagement.currentMetrics.reach,
      likes: platformEngagement.currentMetrics.likes,
      comments: platformEngagement.currentMetrics.comments,
      shares: platformEngagement.currentMetrics.shares,
      clicks: platformEngagement.currentMetrics.clicks,
      engagementRate: platformEngagement.currentMetrics.engagementRate,
    };

    const content = (history.postId as unknown as { content?: string })?.content;

    return analyzePostMetrics(platform, metrics, undefined, content);
  } catch (error) {
    log.error('Error analyzing post performance', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Get learning insights from recent posts for AI prompt injection
 */
export async function getPerformanceInsightsForAI(
  pageId: string,
  platform: PlatformType,
  lookbackDays: number = 30
): Promise<string> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  try {
    const histories = await EngagementHistory.find({
      pageId: new mongoose.Types.ObjectId(pageId),
      'platforms.platform': platform,
      createdAt: { $gte: cutoffDate },
    }).populate('postId', 'content');

    if (histories.length === 0) {
      return getPlatformMetricGuide(platform);
    }

    const posts: Array<{ content: string; metrics: PostMetrics }> = [];

    for (const history of histories) {
      const platformEngagement = history.platforms.find(
        (p: PlatformEngagement) => p.platform === platform
      );
      if (!platformEngagement) continue;

      const content = (history.postId as unknown as { content?: string })?.content;
      if (!content) continue;

      posts.push({
        content,
        metrics: {
          impressions: platformEngagement.currentMetrics.impressions,
          reach: platformEngagement.currentMetrics.reach,
          likes: platformEngagement.currentMetrics.likes,
          comments: platformEngagement.currentMetrics.comments,
          shares: platformEngagement.currentMetrics.shares,
          clicks: platformEngagement.currentMetrics.clicks,
          engagementRate: platformEngagement.currentMetrics.engagementRate,
        },
      });
    }

    if (posts.length < 2) {
      return getPlatformMetricGuide(platform);
    }

    // Compare posts to find patterns
    const comparison = comparePostMetrics(platform, posts);
    
    // Generate learning prompt from best performer
    const bestAnalysis = comparison.bestPerformer.analysis;
    const learningPrompt = generateLearningPrompt(bestAnalysis);

    // Build comprehensive insights
    const lines: string[] = [];
    
    lines.push(`## Performance Insights for ${platform.toUpperCase()}`);
    lines.push('');
    lines.push(`Based on analysis of ${posts.length} recent posts:`);
    lines.push('');
    
    lines.push('### Best Performing Post Characteristics:');
    lines.push(learningPrompt);
    lines.push('');
    
    if (comparison.commonSuccessFactors.length > 0) {
      lines.push('### What Works on Your Account:');
      for (const factor of comparison.commonSuccessFactors) {
        lines.push(`- ${factor}`);
      }
      lines.push('');
    }
    
    if (comparison.commonFailureFactors.length > 0) {
      lines.push('### What to Avoid:');
      for (const factor of comparison.commonFailureFactors) {
        lines.push(`- ${factor}`);
      }
      lines.push('');
    }

    // Add platform guide
    lines.push('### Platform-Specific Guidance:');
    lines.push(getPlatformMetricGuide(platform));

    return lines.join('\n');
  } catch (error) {
    log.error('Error getting performance insights', { error: error instanceof Error ? error.message : String(error) });
    return getPlatformMetricGuide(platform);
  }
}

/**
 * Get a summary of what's working and not working across all posts
 */
export async function getContentStrategyReport(
  pageId: string,
  platform: PlatformType,
  lookbackDays: number = 90
): Promise<{
  summary: string;
  topPatterns: string[];
  weaknesses: string[];
  recommendations: string[];
  benchmarkComparison: {
    metric: string;
    yourAvg: number;
    benchmark: number;
    status: string;
  }[];
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  try {
    const histories = await EngagementHistory.find({
      pageId: new mongoose.Types.ObjectId(pageId),
      'platforms.platform': platform,
      createdAt: { $gte: cutoffDate },
    });

    if (histories.length === 0) {
      return {
        summary: 'Not enough data to generate strategy report.',
        topPatterns: [],
        weaknesses: [],
        recommendations: ['Post more content to build performance data.'],
        benchmarkComparison: [],
      };
    }

    // Analyze all posts
    const allAnalyses: PostAnalysis[] = [];
    const patternCounts = new Map<string, number>();
    const weaknessCounts = new Map<string, number>();
    let totalEngagementRate = 0;
    let totalCommentRatio = 0;
    let totalShareRatio = 0;

    for (const history of histories) {
      const platformEngagement = history.platforms.find(
        (p: PlatformEngagement) => p.platform === platform
      );
      if (!platformEngagement) continue;

      const metrics: PostMetrics = {
        impressions: platformEngagement.currentMetrics.impressions,
        likes: platformEngagement.currentMetrics.likes,
        comments: platformEngagement.currentMetrics.comments,
        shares: platformEngagement.currentMetrics.shares,
        clicks: platformEngagement.currentMetrics.clicks,
        engagementRate: platformEngagement.currentMetrics.engagementRate,
      };

      const analysis = analyzePostMetrics(platform, metrics);
      allAnalyses.push(analysis);

      // Track patterns
      for (const pattern of analysis.patterns) {
        patternCounts.set(pattern.pattern, (patternCounts.get(pattern.pattern) || 0) + 1);
      }

      // Track weaknesses
      for (const weakness of analysis.contentCharacteristics.weaknesses) {
        weaknessCounts.set(weakness, (weaknessCounts.get(weakness) || 0) + 1);
      }

      // Accumulate metrics
      totalEngagementRate += metrics.engagementRate;
      const totalEng = metrics.likes + metrics.comments + metrics.shares;
      if (totalEng > 0) {
        totalCommentRatio += metrics.comments / totalEng;
        totalShareRatio += metrics.shares / totalEng;
      }
    }

    const postCount = allAnalyses.length;
    const avgEngagementRate = totalEngagementRate / postCount;
    const avgCommentRatio = totalCommentRatio / postCount;
    const avgShareRatio = totalShareRatio / postCount;

    // Sort patterns by frequency
    const topPatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => `${pattern} (seen in ${count}/${postCount} posts)`);

    // Sort weaknesses by frequency
    const weaknesses = Array.from(weaknessCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([weakness, count]) => `${weakness} is weak in ${count}/${postCount} posts`);

    // Generate recommendations based on weaknesses
    const recommendations: string[] = [];
    if (weaknessCounts.has('comments')) {
      recommendations.push('Add open-ended questions to posts to drive more comments.');
    }
    if (weaknessCounts.has('shares')) {
      recommendations.push('Create more shareable content: frameworks, insights, or quotable lines.');
    }
    if (weaknessCounts.has('engagementRate')) {
      recommendations.push('Strengthen hooks and add clearer calls-to-action.');
    }

    // Benchmark comparisons
    const benchmarks: { [key: string]: number } = {
      linkedin: 2.0,
      facebook: 0.09,
      twitter: 2.15,
      instagram: 1.5,
    };

    const benchmarkComparison = [
      {
        metric: 'Engagement Rate',
        yourAvg: Math.round(avgEngagementRate * 100) / 100,
        benchmark: benchmarks[platform] || 1.5,
        status: avgEngagementRate >= (benchmarks[platform] || 1.5) ? 'Above average' : 'Below average',
      },
      {
        metric: 'Comment Ratio',
        yourAvg: Math.round(avgCommentRatio * 100),
        benchmark: 30,
        status: avgCommentRatio * 100 >= 30 ? 'Good conversation' : 'Needs more discussion',
      },
      {
        metric: 'Share Ratio',
        yourAvg: Math.round(avgShareRatio * 100),
        benchmark: 20,
        status: avgShareRatio * 100 >= 20 ? 'Good shareability' : 'Improve shareable value',
      },
    ];

    // Generate summary
    const avgScore = allAnalyses.reduce((sum, a) => sum + a.performanceScore, 0) / postCount;
    let summary = `Analyzed ${postCount} posts from the last ${lookbackDays} days. `;
    summary += `Average performance score: ${Math.round(avgScore)}/100. `;
    
    if (avgScore >= 70) {
      summary += 'Your content strategy is performing well!';
    } else if (avgScore >= 50) {
      summary += 'Your content is solid but has room for improvement.';
    } else {
      summary += 'Content strategy needs significant optimization.';
    }

    return {
      summary,
      topPatterns,
      weaknesses,
      recommendations,
      benchmarkComparison,
    };
  } catch (error) {
    log.error('Error generating content strategy report', { error: error instanceof Error ? error.message : String(error) });
    return {
      summary: 'Error generating report.',
      topPatterns: [],
      weaknesses: [],
      recommendations: [],
      benchmarkComparison: [],
    };
  }
}

// Re-export stats reviewer functions for convenience
export { 
  analyzePostMetrics, 
  generateLearningPrompt, 
  getPlatformMetricGuide,
};
export type {
  PostAnalysis,
  PostMetrics,
};
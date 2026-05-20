import { createChatCompletion } from '@/lib/ai-client';
import type { PlatformType} from './types';
import { PLATFORM_CONFIGS } from './types';
import { logger } from '@/lib/logger';

const log = logger.child('platform:schedule-optimizer');

/**
 * Engagement data point for analysis
 */
export interface EngagementDataPoint {
  platform: PlatformType;
  postId: string;
  publishedAt: Date;
  dayOfWeek: number; // 0-6, Sunday = 0
  hourOfDay: number; // 0-23
  impressions: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks?: number;
  engagementRate: number;
  contentType?: 'text' | 'image' | 'video' | 'link';
  hashtags?: string[];
  contentLength?: number;
}

/**
 * Platform-specific timing recommendation
 */
export interface PlatformTimingRecommendation {
  platform: PlatformType;
  bestDays: {
    day: number;
    dayName: string;
    score: number;
    avgEngagement: number;
  }[];
  bestHours: {
    hour: number;
    hourFormatted: string;
    score: number;
    avgEngagement: number;
  }[];
  optimalSlots: {
    day: number;
    dayName: string;
    hour: number;
    hourFormatted: string;
    predictedEngagement: number;
    confidence: number;
  }[];
  insights: string[];
  sampleSize: number;
}

/**
 * Cross-platform scheduling recommendation
 */
export interface CrossPlatformSchedule {
  recommendations: PlatformTimingRecommendation[];
  globalInsights: string[];
  suggestedWeeklySchedule: {
    day: number;
    dayName: string;
    posts: {
      platform: PlatformType;
      time: string;
      priority: 'high' | 'medium' | 'low';
      reason: string;
    }[];
  }[];
  conflictResolution: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Format hour to 12-hour format
 */
function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
}

/**
 * Analyze engagement data to find patterns
 */
function analyzeEngagementPatterns(
  data: EngagementDataPoint[],
  platform: PlatformType
): {
  byDay: Map<number, { total: number; count: number; avgEngagement: number }>;
  byHour: Map<number, { total: number; count: number; avgEngagement: number }>;
  byDayHour: Map<string, { total: number; count: number; avgEngagement: number }>;
} {
  const platformData = data.filter(d => d.platform === platform);
  
  const byDay = new Map<number, { total: number; count: number; avgEngagement: number }>();
  const byHour = new Map<number, { total: number; count: number; avgEngagement: number }>();
  const byDayHour = new Map<string, { total: number; count: number; avgEngagement: number }>();
  
  for (const point of platformData) {
    // By day
    const dayData = byDay.get(point.dayOfWeek) || { total: 0, count: 0, avgEngagement: 0 };
    dayData.total += point.engagementRate;
    dayData.count += 1;
    dayData.avgEngagement = dayData.total / dayData.count;
    byDay.set(point.dayOfWeek, dayData);
    
    // By hour
    const hourData = byHour.get(point.hourOfDay) || { total: 0, count: 0, avgEngagement: 0 };
    hourData.total += point.engagementRate;
    hourData.count += 1;
    hourData.avgEngagement = hourData.total / hourData.count;
    byHour.set(point.hourOfDay, hourData);
    
    // By day+hour combination
    const key = `${point.dayOfWeek}-${point.hourOfDay}`;
    const dhData = byDayHour.get(key) || { total: 0, count: 0, avgEngagement: 0 };
    dhData.total += point.engagementRate;
    dhData.count += 1;
    dhData.avgEngagement = dhData.total / dhData.count;
    byDayHour.set(key, dhData);
  }
  
  return { byDay, byHour, byDayHour };
}

/**
 * Generate platform-specific timing recommendation
 */
function generatePlatformRecommendation(
  data: EngagementDataPoint[],
  platform: PlatformType
): PlatformTimingRecommendation {
  const platformData = data.filter(d => d.platform === platform);
  const { byDay, byHour, byDayHour } = analyzeEngagementPatterns(data, platform);
  
  // Sort days by engagement
  const bestDays = Array.from(byDay.entries())
    .map(([day, stats]) => ({
      day,
      dayName: DAY_NAMES[day],
      score: stats.avgEngagement,
      avgEngagement: stats.avgEngagement,
    }))
    .sort((a, b) => b.score - a.score);
  
  // Sort hours by engagement
  const bestHours = Array.from(byHour.entries())
    .map(([hour, stats]) => ({
      hour,
      hourFormatted: formatHour(hour),
      score: stats.avgEngagement,
      avgEngagement: stats.avgEngagement,
    }))
    .sort((a, b) => b.score - a.score);
  
  // Find optimal day+hour slots
  const optimalSlots = Array.from(byDayHour.entries())
    .map(([key, stats]) => {
      const [day, hour] = key.split('-').map(Number);
      return {
        day,
        dayName: DAY_NAMES[day],
        hour,
        hourFormatted: formatHour(hour),
        predictedEngagement: stats.avgEngagement,
        confidence: Math.min(stats.count / 5, 1), // Higher confidence with more data points
      };
    })
    .sort((a, b) => b.predictedEngagement - a.predictedEngagement)
    .slice(0, 10);
  
  // Generate insights
  const insights: string[] = [];
  
  if (bestDays.length > 0) {
    insights.push(`Best performing day is ${bestDays[0].dayName} with ${(bestDays[0].avgEngagement * 100).toFixed(1)}% avg engagement`);
  }
  
  if (bestHours.length > 0) {
    insights.push(`Peak engagement hour is ${bestHours[0].hourFormatted}`);
  }
  
  // Platform-specific insights based on config
  const config = PLATFORM_CONFIGS[platform];
  if (config.tonePreference === 'professional') {
    insights.push(`${config.name} audience responds best to professional content during business hours`);
  }
  
  return {
    platform,
    bestDays,
    bestHours: bestHours.slice(0, 6), // Top 6 hours
    optimalSlots,
    insights,
    sampleSize: platformData.length,
  };
}

/**
 * Use AI to generate cross-platform scheduling insights
 */
async function generateAIInsights(
  recommendations: PlatformTimingRecommendation[]
): Promise<{ globalInsights: string[]; conflictResolution: string[] }> {
  const platformSummaries = recommendations.map(r => {
    const topDays = r.bestDays.slice(0, 3).map(d => d.dayName).join(', ');
    const topHours = r.bestHours.slice(0, 3).map(h => h.hourFormatted).join(', ');
    return `${PLATFORM_CONFIGS[r.platform].name}: Best days are ${topDays}. Best times are ${topHours}. Sample size: ${r.sampleSize} posts.`;
  }).join('\n');

  const prompt = `Analyze these social media engagement patterns across platforms and provide strategic insights:

${platformSummaries}

Provide:
1. 3-4 global insights about optimal cross-platform posting strategy
2. 2-3 suggestions for resolving posting time conflicts when multiple platforms have similar optimal times

Format your response as JSON:
{
  "globalInsights": ["insight1", "insight2", ...],
  "conflictResolution": ["suggestion1", "suggestion2", ...]
}`;

  try {
    const result = await createChatCompletion({
      messages: [
        { 
          role: 'system', 
          content: 'You are a social media analytics expert. Analyze engagement data and provide actionable scheduling recommendations. Always respond with valid JSON.' 
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 500,
      preferFast: true,
    });

    const content = result.content || '{}';
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        globalInsights: parsed.globalInsights || [],
        conflictResolution: parsed.conflictResolution || [],
      };
    }
  } catch (error) {
    log.error('AI insights generation failed', { error: error instanceof Error ? error.message : String(error) });
  }
  
  return {
    globalInsights: [
      'Analyze more data to improve recommendations',
      'Consider your audience timezone when scheduling',
    ],
    conflictResolution: [
      'Stagger posts by 30-60 minutes when optimal times overlap',
      'Prioritize the platform with your highest engagement rate',
    ],
  };
}

/**
 * Generate a weekly posting schedule across all platforms
 */
function generateWeeklySchedule(
  recommendations: PlatformTimingRecommendation[],
  postsPerPlatformPerWeek: number = 3
): CrossPlatformSchedule['suggestedWeeklySchedule'] {
  const schedule: CrossPlatformSchedule['suggestedWeeklySchedule'] = [];
  
  // Initialize all days
  for (let i = 0; i < 7; i++) {
    schedule.push({
      day: i,
      dayName: DAY_NAMES[i],
      posts: [],
    });
  }
  
  // For each platform, distribute posts across their best days/times
  for (const rec of recommendations) {
    const slotsToUse = rec.optimalSlots.slice(0, postsPerPlatformPerWeek);
    
    for (const slot of slotsToUse) {
      const daySchedule = schedule.find(s => s.day === slot.day);
      if (daySchedule) {
        // Check for conflicts
        const existingAtTime = daySchedule.posts.filter(
          p => p.time === slot.hourFormatted
        );
        
        let time = slot.hourFormatted;
        let priority: 'high' | 'medium' | 'low' = 'high';
        let reason = `Optimal time based on ${rec.sampleSize} posts analyzed`;
        
        // If conflict, offset by 30 mins
        if (existingAtTime.length > 0) {
          const hour = slot.hour;
          time = `${hour % 12 || 12}:30 ${hour >= 12 ? 'PM' : 'AM'}`;
          priority = 'medium';
          reason = 'Offset from conflicting platform optimal time';
        }
        
        daySchedule.posts.push({
          platform: rec.platform,
          time,
          priority,
          reason,
        });
      }
    }
  }
  
  // Sort posts within each day by time
  for (const day of schedule) {
    day.posts.sort((a, b) => {
      const timeA = parseInt(a.time);
      const timeB = parseInt(b.time);
      return timeA - timeB;
    });
  }
  
  return schedule;
}

/**
 * Main function: Analyze stats and generate cross-platform scheduling recommendations
 */
export async function analyzeAndRecommendSchedule(
  engagementData: EngagementDataPoint[],
  platforms: PlatformType[],
  postsPerPlatformPerWeek: number = 3
): Promise<CrossPlatformSchedule> {
  // Generate recommendations for each platform
  const recommendations = platforms.map(platform => 
    generatePlatformRecommendation(engagementData, platform)
  );
  
  // Get AI-generated insights
  const { globalInsights, conflictResolution } = await generateAIInsights(recommendations);
  
  // Generate weekly schedule
  const suggestedWeeklySchedule = generateWeeklySchedule(recommendations, postsPerPlatformPerWeek);
  
  return {
    recommendations,
    globalInsights,
    suggestedWeeklySchedule,
    conflictResolution,
  };
}

/**
 * Quick analysis without AI (for real-time use)
 */
export function quickAnalyzeSchedule(
  engagementData: EngagementDataPoint[],
  platforms: PlatformType[]
): {
  recommendations: PlatformTimingRecommendation[];
  suggestedWeeklySchedule: CrossPlatformSchedule['suggestedWeeklySchedule'];
} {
  const recommendations = platforms.map(platform => 
    generatePlatformRecommendation(engagementData, platform)
  );
  
  const suggestedWeeklySchedule = generateWeeklySchedule(recommendations);
  
  return {
    recommendations,
    suggestedWeeklySchedule,
  };
}

/**
 * Get default timing recommendations when no data is available
 * Based on industry research and platform best practices
 */
export function getDefaultTimingRecommendations(
  platforms: PlatformType[]
): PlatformTimingRecommendation[] {
  const defaults: Record<PlatformType, { bestDays: number[]; bestHours: number[] }> = {
    linkedin: {
      bestDays: [2, 3, 4], // Tue, Wed, Thu
      bestHours: [8, 10, 12, 17], // 8am, 10am, 12pm, 5pm
    },
    facebook: {
      bestDays: [3, 4, 5], // Wed, Thu, Fri
      bestHours: [9, 13, 16, 19], // 9am, 1pm, 4pm, 7pm
    },
    twitter: {
      bestDays: [1, 2, 3, 4], // Mon-Thu
      bestHours: [8, 12, 17, 21], // 8am, 12pm, 5pm, 9pm
    },
    instagram: {
      bestDays: [1, 3, 5], // Mon, Wed, Fri
      bestHours: [11, 14, 19, 21], // 11am, 2pm, 7pm, 9pm
    },
  };
  
  return platforms.map(platform => {
    const config = defaults[platform];
    
    return {
      platform,
      bestDays: config.bestDays.map((day, i) => ({
        day,
        dayName: DAY_NAMES[day],
        score: 1 - (i * 0.1), // Decreasing score
        avgEngagement: 0,
      })),
      bestHours: config.bestHours.map((hour, i) => ({
        hour,
        hourFormatted: formatHour(hour),
        score: 1 - (i * 0.1),
        avgEngagement: 0,
      })),
      optimalSlots: config.bestDays.flatMap((day, dayIdx) =>
        config.bestHours.slice(0, 2).map((hour, hourIdx) => ({
          day,
          dayName: DAY_NAMES[day],
          hour,
          hourFormatted: formatHour(hour),
          predictedEngagement: 0,
          confidence: 0, // No data confidence
        }))
      ).slice(0, 6),
      insights: [
        `Default ${PLATFORM_CONFIGS[platform].name} timing based on industry research`,
        'Collect more engagement data to get personalized recommendations',
      ],
      sampleSize: 0,
    };
  });
}

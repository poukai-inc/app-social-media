import type { PlatformType } from '../platforms/types';
import type { PlatformInsights } from './platform-learning';
import { getPlatformInsights, getTopPostsForLearning } from './platform-learning';
import type { PageContentStrategy } from '../openai';

/**
 * AI Content Learning Service
 * 
 * Generates AI prompts that incorporate learning from past performance:
 * - Injects top-performing post examples
 * - Adjusts recommendations based on what works per platform
 * - Provides platform-specific content guidance
 */

export interface PlatformLearningContext {
  platform: PlatformType;
  hasEnoughData: boolean;
  
  // Timing recommendations
  recommendedDay?: number;
  recommendedHour?: number;
  timingConfidence: number;
  
  // Content recommendations
  topAngles: string[];
  recommendedHashtags: string[];
  optimalLengthRange: { min: number; max: number };
  shouldIncludeMedia: boolean;
  recommendedMediaType?: 'image' | 'video';
  
  // Example posts for few-shot learning
  topPostExamples: {
    content: string;
    angle: string;
    whyItWorked: string;
  }[];
  
  // Platform-specific tips
  platformTips: string[];
}

/**
 * Platform-specific content guidelines
 */
const PLATFORM_CONTENT_GUIDELINES: Record<PlatformType, string[]> = {
  linkedin: [
    'Professional tone, but authentic and personal',
    'Share insights and lessons learned',
    'Use line breaks for readability',
    'End with a thoughtful question',
    'Hashtags at the end, 3-5 max',
  ],
  twitter: [
    'Concise and punchy - every word counts',
    'Lead with the hook in first line',
    'Use threads for longer content',
    'Hashtags can be inline or at end, 1-3 max',
    'Emojis can help but don\'t overdo it',
  ],
  facebook: [
    'More conversational and casual',
    'Stories and personal experiences work well',
    'Can be longer than Twitter',
    'Questions drive engagement',
    'Media significantly boosts reach',
  ],
  instagram: [
    'Visual-first - image/video is crucial',
    'Caption should complement the visual',
    'Use more hashtags (5-15 is okay)',
    'Stories and emotional content perform well',
    'Call-to-actions in bio link references work',
  ],
};

/**
 * Get learning context for a specific platform
 */
export async function getPlatformLearningContext(
  pageId: string,
  platform: PlatformType
): Promise<PlatformLearningContext> {
  const insights = await getPlatformInsights(pageId, platform);
  const topPosts = await getTopPostsForLearning(pageId, platform, 3);
  
  const hasEnoughData = insights.sampleSize >= 10;
  
  // Determine timing recommendations
  let recommendedDay: number | undefined;
  let recommendedHour: number | undefined;
  let timingConfidence = 0;
  
  if (insights.optimalSlots && insights.optimalSlots.length > 0) {
    const bestSlot = insights.optimalSlots[0];
    recommendedDay = bestSlot.day;
    recommendedHour = bestSlot.hour;
    timingConfidence = bestSlot.confidence;
  }
  
  // Top angles that work (with null safety)
  const topAngles = (insights.topPerformingAngles || [])
    .slice(0, 3)
    .map(a => a.angle);
  
  // Recommended hashtags (with null safety)
  const recommendedHashtags = (insights.hashtagPerformance || [])
    .slice(0, 10)
    .map(h => h.hashtag);
  
  // Media recommendation
  const shouldIncludeMedia = 
    insights.mediaPerformance.withMedia.avgScore > 
    insights.mediaPerformance.withoutMedia.avgScore * 1.2; // 20% better
  
  // Build example posts with analysis
  const topPostExamples = topPosts.map(post => ({
    content: post.content,
    angle: post.angle,
    whyItWorked: analyzeWhyPostWorked(post, insights),
  }));
  
  return {
    platform,
    hasEnoughData,
    recommendedDay,
    recommendedHour,
    timingConfidence,
    topAngles,
    recommendedHashtags,
    optimalLengthRange: {
      min: insights.optimalContentLength.min,
      max: insights.optimalContentLength.max,
    },
    shouldIncludeMedia,
    recommendedMediaType: shouldIncludeMedia && insights.mediaPerformance.bestMediaType !== 'none' 
      ? insights.mediaPerformance.bestMediaType as 'image' | 'video'
      : undefined,
    topPostExamples,
    platformTips: PLATFORM_CONTENT_GUIDELINES[platform],
  };
}

/**
 * Analyze why a post performed well
 */
function analyzeWhyPostWorked(
  post: { content: string; angle: string; score: number },
  insights: PlatformInsights
): string {
  const reasons: string[] = [];
  
  // Check if angle is top performing
  const angleRank = insights.topPerformingAngles.findIndex(a => a.angle === post.angle);
  if (angleRank === 0) {
    reasons.push(`Uses "${post.angle}" angle which is your top performer`);
  } else if (angleRank > 0 && angleRank < 3) {
    reasons.push(`Uses "${post.angle}" angle which performs well`);
  }
  
  // Check content length
  const length = post.content.length;
  if (length >= insights.optimalContentLength.min && length <= insights.optimalContentLength.max) {
    reasons.push('Content length is in the optimal range');
  }
  
  // Check hashtags
  const postHashtags = post.content.match(/#\w+/g) || [];
  const goodHashtags = postHashtags.filter(h => 
    insights.hashtagPerformance.some(hp => hp.hashtag === h.toLowerCase())
  );
  if (goodHashtags.length > 0) {
    reasons.push(`Uses proven hashtags: ${goodHashtags.slice(0, 3).join(', ')}`);
  }
  
  // Check hook
  const firstLine = post.content.split('\n')[0];
  if (firstLine.length < 100 && (firstLine.includes('?') || !firstLine.endsWith('.'))) {
    reasons.push('Strong hook that grabs attention');
  }
  
  if (reasons.length === 0) {
    reasons.push('Strong engagement metrics suggest resonance with audience');
  }
  
  return reasons.join('. ') + '.';
}

/**
 * Generate platform-specific AI prompt additions based on learning
 */
export function generateLearningPromptAdditions(
  context: PlatformLearningContext
): string {
  const parts: string[] = [];
  
  // Safely access arrays with defaults
  const topAngles = context.topAngles || [];
  const recommendedHashtags = context.recommendedHashtags || [];
  const topPostExamples = context.topPostExamples || [];
  const platformTips = context.platformTips || [];
  
  if (!context.hasEnoughData) {
    parts.push(`\n## Platform: ${context.platform.toUpperCase()}`);
    parts.push('Note: Limited historical data available. Using industry best practices.');
    parts.push('');
    parts.push('## Platform Guidelines:');
    platformTips.forEach(tip => parts.push(`- ${tip}`));
    return parts.join('\n');
  }
  
  parts.push(`\n## Platform: ${context.platform.toUpperCase()} (Optimized based on your performance data)`);
  parts.push('');
  
  // Top performing angles
  if (topAngles.length > 0) {
    parts.push('## Your Best Performing Content Angles:');
    topAngles.forEach((angle, i) => {
      parts.push(`${i + 1}. ${angle}`);
    });
    parts.push('Consider using one of these angles as they perform well with your audience.');
    parts.push('');
  }
  
  // Content length recommendation
  parts.push('## Optimal Content Length:');
  parts.push(`Aim for ${context.optimalLengthRange?.min || 500}-${context.optimalLengthRange?.max || 1500} characters based on your top performers.`);
  parts.push('');
  
  // Hashtag recommendations
  if (recommendedHashtags.length > 0) {
    parts.push('## Your High-Performing Hashtags:');
    parts.push(`Consider using: ${recommendedHashtags.slice(0, 5).join(', ')}`);
    parts.push('');
  }
  
  // Media recommendation
  if (context.shouldIncludeMedia && context.recommendedMediaType) {
    parts.push('## Media Recommendation:');
    parts.push(`Posts with ${context.recommendedMediaType}s perform 20%+ better for your account.`);
    parts.push('');
  }
  
  // Top post examples (few-shot learning)
  if (topPostExamples.length > 0) {
    parts.push('## Your Top Performing Posts (Learn from these patterns):');
    parts.push('');
    
    topPostExamples.forEach((example, i) => {
      parts.push(`### Example ${i + 1} (${example.angle} angle):`);
      parts.push('```');
      const content = example.content || '';
      parts.push(content.slice(0, 500) + (content.length > 500 ? '...' : ''));
      parts.push('```');
      parts.push(`Why it worked: ${example.whyItWorked}`);
      parts.push('');
    });
  }
  
  // Platform tips
  parts.push('## Platform Best Practices:');
  platformTips.forEach(tip => parts.push(`- ${tip}`));
  
  return parts.join('\n');
}

/**
 * Generate a complete content strategy prompt with learning for a specific platform
 */
export async function generatePlatformOptimizedPrompt(
  pageId: string,
  platform: PlatformType,
  baseStrategy: PageContentStrategy,
  topic?: string,
  inspiration?: string
): Promise<string> {
  const learningContext = await getPlatformLearningContext(pageId, platform);
  
  const parts: string[] = [];
  
  // Base strategy
  parts.push('## Your Voice & Persona:');
  parts.push(baseStrategy.persona);
  parts.push('');
  parts.push('## Target Audience:');
  parts.push(baseStrategy.targetAudience);
  parts.push('');
  parts.push('## Tone:');
  parts.push(baseStrategy.tone);
  parts.push('');
  
  if (topic) {
    parts.push('## Topic for this post:');
    parts.push(topic);
    parts.push('');
  }
  
  if (inspiration) {
    parts.push('## Source Material/Inspiration:');
    parts.push(inspiration);
    parts.push('');
  }
  
  // Add learning-based additions
  parts.push(generateLearningPromptAdditions(learningContext));
  
  if (baseStrategy.avoidTopics && baseStrategy.avoidTopics.length > 0) {
    parts.push('');
    parts.push('## Topics to AVOID:');
    parts.push(baseStrategy.avoidTopics.join(', '));
  }
  
  if (baseStrategy.customInstructions) {
    parts.push('');
    parts.push('## Additional Instructions:');
    parts.push(baseStrategy.customInstructions);
  }
  
  // Final requirements
  parts.push('');
  parts.push('## Requirements:');
  parts.push(`- Keep between ${learningContext.optimalLengthRange.min}-${learningContext.optimalLengthRange.max} characters`);
  parts.push('- Write authentically in the persona described above');
  parts.push('- Match the tone exactly');
  
  if (learningContext.topAngles.length > 0) {
    parts.push(`- Consider using one of your top angles: ${learningContext.topAngles.join(', ')}`);
  }
  
  parts.push('- End with a specific question that invites discussion');
  parts.push('- NEVER use em dashes (—). Use commas or periods instead');
  parts.push('- Use contractions naturally (don\'t, it\'s, that\'s)');
  parts.push('- Vary sentence length');
  
  return parts.join('\n');
}

/**
 * Get the best angle to use for a platform based on learning
 */
export async function getRecommendedAngle(
  pageId: string,
  platform: PlatformType,
  availableAngles: string[]
): Promise<string> {
  // Ensure we have valid angles to work with
  const angles = availableAngles && availableAngles.length > 0 
    ? availableAngles 
    : ['insight', 'war_story', 'how_to'];
  
  const context = await getPlatformLearningContext(pageId, platform);
  
  if (!context.hasEnoughData || !context.topAngles || context.topAngles.length === 0) {
    // Random from available
    return angles[Math.floor(Math.random() * angles.length)];
  }
  
  // Find the best performing angle that's in available angles
  for (const topAngle of context.topAngles) {
    if (angles.includes(topAngle)) {
      return topAngle;
    }
  }
  
  // Fallback to random
  return angles[Math.floor(Math.random() * angles.length)];
}

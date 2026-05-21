/**
 * Stats Reviewer Service
 * 
 * Interprets what engagement metrics MEAN on each platform and provides
 * actionable insights for the AI to learn from.
 * 
 * This service understands the MEANING behind metrics:
 * - High impressions + low engagement = content not resonating
 * - High comments + high shares = content sparking conversation
 * - High saves (IG) = valuable reference content
 * - etc.
 */

import type { PlatformType } from '../platforms/types';

// ============================================
// Types
// ============================================

export interface PostMetrics {
  impressions: number;
  reach?: number;
  likes: number;
  comments: number;
  shares: number;
  clicks?: number;
  saves?: number;
  engagementRate: number;
}

export interface MetricInterpretation {
  metric: string;
  value: number;
  benchmark: number;
  status: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
  meaning: string;
  actionable: string;
}

export interface EngagementPattern {
  pattern: string;
  detected: boolean;
  significance: string;
  recommendation: string;
}

export interface PostAnalysis {
  platform: PlatformType;
  overallPerformance: 'viral' | 'high_performing' | 'solid' | 'underperforming' | 'poor';
  performanceScore: number; // 0-100
  
  // What the metrics TELL us
  interpretations: MetricInterpretation[];
  
  // Detected patterns
  patterns: EngagementPattern[];
  
  // What we learned
  keyInsights: string[];
  
  // What to do differently
  recommendations: string[];
  
  // For AI learning
  contentCharacteristics: {
    resonatedWithAudience: boolean;
    sparkedConversation: boolean;
    droveAction: boolean;
    worthReplicating: boolean;
    weaknesses: string[];
  };
}

// ============================================
// Platform-Specific Benchmarks
// ============================================

interface PlatformBenchmark {
  engagementRate: number;
  impressionsToFollowers: number;
  commentRate: number;
  shareRate: number;
  clickRate: number;
  saveRate?: number;
  reactionMultiplier: {
    like: number;
    comment: number;
    share: number;
    click: number;
    save?: number;
    reply?: number;
    retweet?: number;
  };
}

/**
 * Industry benchmarks by platform (based on research)
 * These represent typical/good performance for each metric
 */
const BENCHMARKS: Record<string, PlatformBenchmark> = {
  linkedin: {
    engagementRate: 2.0,  // 2% is good on LinkedIn
    impressionsToFollowers: 0.15, // Typical reach is ~15% of followers
    commentRate: 0.5,     // Comments as % of total engagements
    shareRate: 0.3,       // Shares (reposts) as % of total engagements
    clickRate: 0.1,       // CTR around 0.1% is good
    reactionMultiplier: { // How much each action signals to algorithm
      like: 1,
      comment: 4,         // Comments worth 4x a like
      share: 6,           // Shares worth 6x a like
      click: 2,
    },
  },
  facebook: {
    engagementRate: 0.09, // Facebook avg is very low (~0.09%)
    impressionsToFollowers: 0.052, // Organic reach is ~5.2% of followers
    commentRate: 0.3,
    shareRate: 0.2,
    clickRate: 0.05,
    reactionMultiplier: {
      like: 1,
      comment: 3,
      share: 5,
      click: 2,
    },
  },
  twitter: {
    engagementRate: 2.15, // Median is ~2.15%
    impressionsToFollowers: 0.3, // Twitter has better organic reach
    commentRate: 0.5,     // Replies (comments) as % of engagements
    shareRate: 0.3,       // Retweets as % of engagements
    clickRate: 0.15,
    reactionMultiplier: {
      like: 1,
      comment: 3,         // Replies drive algorithm
      share: 4,           // Retweets = reach multiplier
      click: 2,
      reply: 3,
      retweet: 4,
    },
  },
  instagram: {
    engagementRate: 1.5,  // Good Instagram engagement ~1-3%
    impressionsToFollowers: 0.2, // ~20% of followers see content
    saveRate: 0.08,       // Saves indicate high-value content (8% is good)
    shareRate: 0.2,       // DM shares
    commentRate: 0.3,
    clickRate: 0.05,
    reactionMultiplier: {
      like: 1,
      comment: 4,
      save: 5,            // Saves are HUGE signal for algorithm
      share: 6,
      click: 2,
    },
  },
};

// ============================================
// Metric Interpretation Functions
// ============================================

/**
 * Get the meaning of a specific metric value on a platform
 */
function interpretMetric(
  platform: PlatformType,
  metric: keyof PostMetrics,
  value: number,
  totalEngagements: number,
  followers?: number
): MetricInterpretation {
  const benchmarks = BENCHMARKS[platform] || BENCHMARKS.linkedin;
  
  switch (metric) {
    case 'engagementRate':
      return interpretEngagementRate(platform, value, benchmarks.engagementRate);
    
    case 'impressions':
      return interpretImpressions(platform, value, followers);
    
    case 'likes':
      return interpretLikes(platform, value, totalEngagements);
    
    case 'comments':
      return interpretComments(platform, value, totalEngagements);
    
    case 'shares':
      return interpretShares(platform, value, totalEngagements);
    
    case 'clicks':
      return interpretClicks(platform, value || 0, totalEngagements);
    
    case 'saves':
      return interpretSaves(platform, value || 0, totalEngagements);
    
    default:
      return {
        metric,
        value,
        benchmark: 0,
        status: 'average',
        meaning: 'Unknown metric',
        actionable: 'No action available',
      };
  }
}

function interpretEngagementRate(
  platform: PlatformType,
  rate: number,
  benchmark: number
): MetricInterpretation {
  const ratio = rate / benchmark;
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (ratio >= 3) {
    status = 'excellent';
    meaning = `Engagement rate of ${rate.toFixed(2)}% is 3x+ above average. Content is highly resonating.`;
    actionable = 'Study this content format and topic for replication.';
  } else if (ratio >= 1.5) {
    status = 'good';
    meaning = `Engagement rate of ${rate.toFixed(2)}% is significantly above average.`;
    actionable = 'Content is performing well. Identify what made it work.';
  } else if (ratio >= 0.8) {
    status = 'average';
    meaning = `Engagement rate of ${rate.toFixed(2)}% is around average for ${platform}.`;
    actionable = 'Content is acceptable but could be more engaging.';
  } else if (ratio >= 0.4) {
    status = 'below_average';
    meaning = `Engagement rate of ${rate.toFixed(2)}% is below average. Content may not be resonating.`;
    actionable = 'Review hook strength and content relevance.';
  } else {
    status = 'poor';
    meaning = `Engagement rate of ${rate.toFixed(2)}% is significantly below average.`;
    actionable = 'Major content strategy review needed.';
  }
  
  return {
    metric: 'engagementRate',
    value: rate,
    benchmark,
    status,
    meaning,
    actionable,
  };
}

function interpretImpressions(
  platform: PlatformType,
  impressions: number,
  followers?: number
): MetricInterpretation {
  const benchmarks = BENCHMARKS[platform] || BENCHMARKS.linkedin;
  const expectedReach = followers ? followers * (benchmarks.impressionsToFollowers || 0.15) : null;
  
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (!followers || !expectedReach) {
    // Can't compare to followers, use absolute benchmarks
    meaning = `${impressions.toLocaleString()} impressions recorded.`;
    status = 'average';
    actionable = 'Track follower count to get better impression analysis.';
  } else {
    const ratio = impressions / expectedReach;
    
    if (ratio >= 3) {
      status = 'excellent';
      meaning = `Impressions are 3x+ expected reach. Content went viral or was boosted by algorithm.`;
      actionable = 'Content broke through to non-followers. Study what triggered viral spread.';
    } else if (ratio >= 1.5) {
      status = 'good';
      meaning = `Impressions exceeded expected reach. Algorithm favoring this content.`;
      actionable = 'Good reach indicates early engagement was strong.';
    } else if (ratio >= 0.7) {
      status = 'average';
      meaning = `Impressions are around expected for your follower count.`;
      actionable = 'Reach is typical. Focus on improving engagement quality.';
    } else if (ratio >= 0.3) {
      status = 'below_average';
      meaning = `Impressions are below expected. Algorithm may not be favoring content.`;
      actionable = 'May need stronger hook or better posting time.';
    } else {
      status = 'poor';
      meaning = `Very low reach. Content is being suppressed or ignored by algorithm.`;
      actionable = 'Check for posting issues or content policy flags.';
    }
  }
  
  return {
    metric: 'impressions',
    value: impressions,
    benchmark: expectedReach || 0,
    status,
    meaning,
    actionable,
  };
}

function interpretLikes(
  platform: PlatformType,
  likes: number,
  totalEngagements: number
): MetricInterpretation {
  const likeRatio = totalEngagements > 0 ? (likes / totalEngagements) * 100 : 0;
  
  // Likes are the "easiest" engagement - high like ratio with low other engagement is passive
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (likeRatio >= 90) {
    status = 'below_average';
    meaning = `${likeRatio.toFixed(0)}% of engagement is just likes. Content is getting passive acknowledgment but not driving action.`;
    actionable = 'Add CTAs, questions, or controversial takes to spark deeper engagement.';
  } else if (likeRatio >= 70) {
    status = 'average';
    meaning = `Likes make up ${likeRatio.toFixed(0)}% of engagement. Typical distribution.`;
    actionable = 'Try adding discussion prompts to shift more engagement to comments.';
  } else if (likeRatio >= 50) {
    status = 'good';
    meaning = `Healthy engagement mix with ${likeRatio.toFixed(0)}% likes. Content driving action.`;
    actionable = 'Good balance. Continue this approach.';
  } else {
    status = 'excellent';
    meaning = `Low like ratio (${likeRatio.toFixed(0)}%) means most engagement is high-value (comments/shares).`;
    actionable = 'Excellent! Content is driving conversation and sharing.';
  }
  
  return {
    metric: 'likes',
    value: likes,
    benchmark: totalEngagements * 0.7, // 70% is typical
    status,
    meaning,
    actionable,
  };
}

function interpretComments(
  platform: PlatformType,
  comments: number,
  totalEngagements: number
): MetricInterpretation {
  const commentRatio = totalEngagements > 0 ? (comments / totalEngagements) * 100 : 0;
  const benchmarks = BENCHMARKS[platform] || BENCHMARKS.linkedin;
  const expectedRatio = (benchmarks.commentRate || 0.3) * 100;
  
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (commentRatio >= expectedRatio * 3) {
    status = 'excellent';
    meaning = `${commentRatio.toFixed(1)}% comment ratio is exceptional. Content sparked real conversation.`;
    actionable = 'This type of content builds community. Double down on this approach.';
  } else if (commentRatio >= expectedRatio * 1.5) {
    status = 'good';
    meaning = `${commentRatio.toFixed(1)}% comment ratio is above average. People want to engage.`;
    actionable = 'Strong conversation starter. What question or opinion triggered this?';
  } else if (commentRatio >= expectedRatio * 0.5) {
    status = 'average';
    meaning = `${commentRatio.toFixed(1)}% comment ratio is typical for ${platform}.`;
    actionable = 'Add open-ended questions or controversial takes to boost comments.';
  } else if (comments > 0) {
    status = 'below_average';
    meaning = `Low comment ratio (${commentRatio.toFixed(1)}%). Content not sparking discussion.`;
    actionable = 'End posts with questions. Share opinions people can debate.';
  } else {
    status = 'poor';
    meaning = 'No comments. Content failed to start any conversation.';
    actionable = 'Review if content was too generic or lacked a clear opinion.';
  }
  
  // Platform-specific adjustments
  if (platform === 'linkedin') {
    meaning += ' Comments are a strong algorithm signal on LinkedIn.';
  } else if (platform === 'instagram') {
    meaning += ' Instagram prioritizes content that drives comments.';
  }
  
  return {
    metric: 'comments',
    value: comments,
    benchmark: totalEngagements * (benchmarks.commentRate || 0.3),
    status,
    meaning,
    actionable,
  };
}

function interpretShares(
  platform: PlatformType,
  shares: number,
  totalEngagements: number
): MetricInterpretation {
  const shareRatio = totalEngagements > 0 ? (shares / totalEngagements) * 100 : 0;
  const benchmarks = BENCHMARKS[platform] || BENCHMARKS.linkedin;
  const expectedRatio = (benchmarks.shareRate || 0.2) * 100;
  
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (shareRatio >= expectedRatio * 4) {
    status = 'excellent';
    meaning = `${shareRatio.toFixed(1)}% share ratio is exceptional. Content is highly shareable/valuable.`;
    actionable = 'This content has viral DNA. Create more content in this style.';
  } else if (shareRatio >= expectedRatio * 2) {
    status = 'good';
    meaning = `${shareRatio.toFixed(1)}% share ratio is strong. People want to spread this.`;
    actionable = 'Identify what made this worth sharing - insight, humor, or utility?';
  } else if (shareRatio >= expectedRatio * 0.5) {
    status = 'average';
    meaning = `${shareRatio.toFixed(1)}% share ratio is typical.`;
    actionable = 'Add more shareable elements: frameworks, stats, or quotable lines.';
  } else if (shares > 0) {
    status = 'below_average';
    meaning = `Low share ratio (${shareRatio.toFixed(1)}%). Content not perceived as share-worthy.`;
    actionable = 'Content may be too personal/niche to share. Add universal value.';
  } else {
    status = 'poor';
    meaning = 'No shares. Content has no viral potential.';
    actionable = 'Ask: Would I share this? Add frameworks, insights, or utility.';
  }
  
  // Platform-specific context
  if (platform === 'linkedin') {
    meaning += ' Shares (reposts) on LinkedIn extend reach exponentially.';
  } else if (platform === 'twitter') {
    meaning += ' Retweets are how content goes viral on Twitter.';
  } else if (platform === 'facebook') {
    meaning += ' Shares on Facebook trigger algorithm boost.';
  }
  
  return {
    metric: 'shares',
    value: shares,
    benchmark: totalEngagements * (benchmarks.shareRate || 0.2),
    status,
    meaning,
    actionable,
  };
}

function interpretClicks(
  platform: PlatformType,
  clicks: number,
  totalEngagements: number
): MetricInterpretation {
  const clickRatio = totalEngagements > 0 ? (clicks / totalEngagements) * 100 : 0;
  
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (clickRatio >= 20) {
    status = 'excellent';
    meaning = `${clickRatio.toFixed(1)}% click rate shows high intent. Content driving real action.`;
    actionable = 'Hook and CTA are working perfectly. Study this format.';
  } else if (clickRatio >= 10) {
    status = 'good';
    meaning = `${clickRatio.toFixed(1)}% click rate is strong. Content creating curiosity.`;
    actionable = 'Good click-through. Clear value proposition is working.';
  } else if (clickRatio >= 5) {
    status = 'average';
    meaning = `${clickRatio.toFixed(1)}% click rate is typical.`;
    actionable = 'Strengthen the CTA or make the value of clicking clearer.';
  } else if (clicks > 0) {
    status = 'below_average';
    meaning = `Low click rate (${clickRatio.toFixed(1)}%). CTA may be weak or unclear.`;
    actionable = 'Review CTA placement and wording. Is the value proposition clear?';
  } else {
    status = 'poor';
    meaning = 'No clicks. Either no link/CTA or it was completely ignored.';
    actionable = 'Add clear CTAs or remove links if they are hurting engagement.';
  }
  
  return {
    metric: 'clicks',
    value: clicks,
    benchmark: totalEngagements * 0.1,
    status,
    meaning,
    actionable,
  };
}

function interpretSaves(
  platform: PlatformType,
  saves: number,
  totalEngagements: number
): MetricInterpretation {
  // Saves are mainly Instagram-relevant but can apply to bookmarks on other platforms
  const saveRatio = totalEngagements > 0 ? (saves / totalEngagements) * 100 : 0;
  
  let status: MetricInterpretation['status'];
  let meaning: string;
  let actionable: string;
  
  if (platform !== 'instagram') {
    return {
      metric: 'saves',
      value: saves,
      benchmark: 0,
      status: 'average',
      meaning: 'Saves/bookmarks not a primary metric on this platform.',
      actionable: 'Focus on other engagement metrics.',
    };
  }
  
  if (saveRatio >= 15) {
    status = 'excellent';
    meaning = `${saveRatio.toFixed(1)}% save ratio is exceptional. Content is highly valuable/educational.`;
    actionable = 'This is reference-worthy content. Create more educational/actionable posts.';
  } else if (saveRatio >= 8) {
    status = 'good';
    meaning = `${saveRatio.toFixed(1)}% save ratio is strong. People want to return to this.`;
    actionable = 'Good utility content. What made this save-worthy?';
  } else if (saveRatio >= 3) {
    status = 'average';
    meaning = `${saveRatio.toFixed(1)}% save ratio is typical.`;
    actionable = 'Add more actionable tips, frameworks, or resources to boost saves.';
  } else if (saves > 0) {
    status = 'below_average';
    meaning = `Low save ratio (${saveRatio.toFixed(1)}%). Content not perceived as reference material.`;
    actionable = 'Make content more actionable or educational.';
  } else {
    status = 'poor';
    meaning = 'No saves. Content is entertaining but not valuable enough to save.';
    actionable = 'Add lists, tips, frameworks, or resources people want to reference.';
  }
  
  // Instagram-specific: Saves are HUGE for the algorithm
  meaning += ' Saves are the strongest algorithm signal on Instagram.';
  
  return {
    metric: 'saves',
    value: saves,
    benchmark: totalEngagements * 0.08,
    status,
    meaning,
    actionable,
  };
}

// ============================================
// Pattern Detection Functions
// ============================================

function detectEngagementPatterns(
  platform: PlatformType,
  metrics: PostMetrics
): EngagementPattern[] {
  const patterns: EngagementPattern[] = [];
  const totalEngagements = metrics.likes + metrics.comments + metrics.shares + (metrics.saves || 0);
  
  // Pattern 1: High Impressions, Low Engagement (Clickbait/Weak Content)
  const engagementPerImpression = totalEngagements / (metrics.impressions || 1);
  if (metrics.impressions > 1000 && engagementPerImpression < 0.01) {
    patterns.push({
      pattern: 'high_reach_low_engagement',
      detected: true,
      significance: 'Content is reaching people but not resonating. Hook may be working but content disappoints.',
      recommendation: 'Improve content substance. Hook is creating expectation that content isn\'t meeting.',
    });
  }
  
  // Pattern 2: Conversation Starter (High Comment Ratio)
  const commentRatio = totalEngagements > 0 ? metrics.comments / totalEngagements : 0;
  if (commentRatio > 0.3 && metrics.comments >= 5) {
    patterns.push({
      pattern: 'conversation_starter',
      detected: true,
      significance: 'Content sparked meaningful discussion. This builds community and algorithmic favor.',
      recommendation: 'Identify what opinion, question, or topic drove discussion. Replicate this approach.',
    });
  }
  
  // Pattern 3: Viral Potential (High Share Ratio)
  const shareRatio = totalEngagements > 0 ? metrics.shares / totalEngagements : 0;
  if (shareRatio > 0.25 && metrics.shares >= 3) {
    patterns.push({
      pattern: 'viral_potential',
      detected: true,
      significance: 'Content is being shared. This indicates universal value or strong emotions.',
      recommendation: 'Content has shareable DNA. Create more with this format/topic.',
    });
  }
  
  // Pattern 4: Passive Engagement (Like-heavy)
  const likeRatio = totalEngagements > 0 ? metrics.likes / totalEngagements : 0;
  if (likeRatio > 0.9 && totalEngagements >= 10) {
    patterns.push({
      pattern: 'passive_engagement',
      detected: true,
      significance: 'People liked but didn\'t act further. Content is "nice" but not compelling.',
      recommendation: 'Add stronger CTAs, questions, or opinions to drive deeper engagement.',
    });
  }
  
  // Pattern 5: Action Driver (High Clicks)
  if (metrics.clicks && metrics.clicks > 10) {
    const clickRate = metrics.clicks / (metrics.impressions || 1);
    if (clickRate > 0.02) {
      patterns.push({
        pattern: 'action_driver',
        detected: true,
        significance: 'Content is driving clicks/actions. Strong value proposition and CTA.',
        recommendation: 'This hook + CTA combo works. Document and reuse.',
      });
    }
  }
  
  // Pattern 6: Save-worthy (Instagram)
  if (platform === 'instagram' && metrics.saves && metrics.saves > 5) {
    const saveRatio = totalEngagements > 0 ? metrics.saves / totalEngagements : 0;
    if (saveRatio > 0.1) {
      patterns.push({
        pattern: 'reference_content',
        detected: true,
        significance: 'High saves indicate valuable, educational, or actionable content.',
        recommendation: 'This content format is perfect for Instagram. Create more educational content.',
      });
    }
  }
  
  // Pattern 7: Ghost Content (No Engagement)
  if (totalEngagements === 0 && metrics.impressions > 100) {
    patterns.push({
      pattern: 'ghost_content',
      detected: true,
      significance: 'Content was seen but completely ignored. Something is fundamentally wrong.',
      recommendation: 'Review timing, hook, relevance, and format. Consider if this topic resonates with audience.',
    });
  }
  
  // Pattern 8: Algorithm Boost (Impressions >> Followers)
  if (metrics.reach && metrics.impressions > metrics.reach * 1.5) {
    patterns.push({
      pattern: 'algorithm_boost',
      detected: true,
      significance: 'Content is being re-served by algorithm. Early engagement was strong.',
      recommendation: 'First-hour engagement likely triggered this. Study what made people engage quickly.',
    });
  }
  
  return patterns;
}

// ============================================
// Main Analysis Function
// ============================================

/**
 * Analyze post metrics and provide comprehensive interpretation
 */
export function analyzePostMetrics(
  platform: PlatformType,
  metrics: PostMetrics,
  followers?: number,
  _content?: string
): PostAnalysis {
  const totalEngagements = metrics.likes + metrics.comments + metrics.shares + (metrics.saves || 0);
  
  // Get interpretations for each metric
  const interpretations: MetricInterpretation[] = [
    interpretMetric(platform, 'engagementRate', metrics.engagementRate, totalEngagements, followers),
    interpretMetric(platform, 'impressions', metrics.impressions, totalEngagements, followers),
    interpretMetric(platform, 'likes', metrics.likes, totalEngagements, followers),
    interpretMetric(platform, 'comments', metrics.comments, totalEngagements, followers),
    interpretMetric(platform, 'shares', metrics.shares, totalEngagements, followers),
  ];
  
  if (metrics.clicks !== undefined) {
    interpretations.push(interpretMetric(platform, 'clicks', metrics.clicks, totalEngagements, followers));
  }
  
  if (platform === 'instagram' && metrics.saves !== undefined) {
    interpretations.push(interpretMetric(platform, 'saves', metrics.saves, totalEngagements, followers));
  }
  
  // Detect patterns
  const patterns = detectEngagementPatterns(platform, metrics);
  
  // Calculate overall performance score
  const statusScores = { excellent: 100, good: 75, average: 50, below_average: 25, poor: 0 };
  const avgScore = interpretations.reduce((sum, i) => sum + statusScores[i.status], 0) / interpretations.length;
  
  // Determine overall performance category
  let overallPerformance: PostAnalysis['overallPerformance'];
  if (avgScore >= 90) {
    overallPerformance = 'viral';
  } else if (avgScore >= 70) {
    overallPerformance = 'high_performing';
  } else if (avgScore >= 50) {
    overallPerformance = 'solid';
  } else if (avgScore >= 30) {
    overallPerformance = 'underperforming';
  } else {
    overallPerformance = 'poor';
  }
  
  // Generate key insights
  const keyInsights: string[] = [];
  
  // Add insight from best/worst performing metrics
  const sortedInterp = [...interpretations].sort((a, b) => 
    statusScores[b.status] - statusScores[a.status]
  );
  
  if (sortedInterp[0].status === 'excellent' || sortedInterp[0].status === 'good') {
    keyInsights.push(`Strongest metric: ${sortedInterp[0].metric} - ${sortedInterp[0].meaning}`);
  }
  
  const worst = sortedInterp[sortedInterp.length - 1];
  if (worst.status === 'poor' || worst.status === 'below_average') {
    keyInsights.push(`Weakest metric: ${worst.metric} - ${worst.meaning}`);
  }
  
  // Add pattern insights
  for (const pattern of patterns) {
    keyInsights.push(`Pattern detected: ${pattern.significance}`);
  }
  
  // Platform-specific insights
  if (platform === 'linkedin') {
    const commentScore = statusScores[interpretations.find(i => i.metric === 'comments')?.status || 'average'];
    if (commentScore >= 75) {
      keyInsights.push('Comments are driving LinkedIn algorithm favor. This post is building your authority.');
    }
  }
  
  if (platform === 'instagram') {
    const saveInterp = interpretations.find(i => i.metric === 'saves');
    if (saveInterp && statusScores[saveInterp.status] >= 75) {
      keyInsights.push('High saves are boosting Instagram algorithm distribution significantly.');
    }
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  // Add recommendations from poor/below_average metrics
  for (const interp of interpretations) {
    if (interp.status === 'poor' || interp.status === 'below_average') {
      recommendations.push(interp.actionable);
    }
  }
  
  // Add pattern recommendations
  for (const pattern of patterns) {
    recommendations.push(pattern.recommendation);
  }
  
  // Determine content characteristics for AI learning
  const contentCharacteristics = {
    resonatedWithAudience: avgScore >= 50,
    sparkedConversation: (interpretations.find(i => i.metric === 'comments')?.status || '') === 'excellent' ||
                        (interpretations.find(i => i.metric === 'comments')?.status || '') === 'good',
    droveAction: (metrics.clicks && metrics.clicks > totalEngagements * 0.1) ||
                 (metrics.shares > totalEngagements * 0.2),
    worthReplicating: avgScore >= 70,
    weaknesses: interpretations
      .filter(i => i.status === 'poor' || i.status === 'below_average')
      .map(i => i.metric),
  };
  
  return {
    platform,
    overallPerformance,
    performanceScore: Math.round(avgScore),
    interpretations,
    patterns,
    keyInsights,
    recommendations,
    contentCharacteristics,
  };
}

/**
 * Generate a learning summary for AI to improve content generation
 */
export function generateLearningPrompt(analysis: PostAnalysis): string {
  const lines: string[] = [];
  
  lines.push(`## Post Performance Analysis for ${analysis.platform.toUpperCase()}`);
  lines.push(`Overall: ${analysis.overallPerformance.toUpperCase()} (Score: ${analysis.performanceScore}/100)`);
  lines.push('');
  
  lines.push('### What the Metrics Tell Us:');
  for (const interp of analysis.interpretations) {
    if (interp.status !== 'average') {
      lines.push(`- **${interp.metric}** (${interp.status}): ${interp.meaning}`);
    }
  }
  lines.push('');
  
  if (analysis.patterns.length > 0) {
    lines.push('### Detected Patterns:');
    for (const pattern of analysis.patterns) {
      lines.push(`- **${pattern.pattern}**: ${pattern.significance}`);
    }
    lines.push('');
  }
  
  lines.push('### Key Learnings:');
  for (const insight of analysis.keyInsights) {
    lines.push(`- ${insight}`);
  }
  lines.push('');
  
  if (analysis.recommendations.length > 0) {
    lines.push('### Recommendations for Future Content:');
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Compare multiple posts to identify what works
 */
export function comparePosts(
  platform: PlatformType,
  posts: Array<{ content: string; metrics: PostMetrics }>
): {
  bestPerformer: { content: string; analysis: PostAnalysis };
  worstPerformer: { content: string; analysis: PostAnalysis };
  commonSuccessFactors: string[];
  commonFailureFactors: string[];
} {
  const analyses = posts.map(p => ({
    content: p.content,
    analysis: analyzePostMetrics(platform, p.metrics, undefined, p.content),
  }));
  
  // Sort by performance score
  analyses.sort((a, b) => b.analysis.performanceScore - a.analysis.performanceScore);
  
  const bestPerformer = analyses[0];
  const worstPerformer = analyses[analyses.length - 1];
  
  // Find common success factors from top performers
  const topPerformers = analyses.slice(0, Math.ceil(analyses.length / 3));
  const commonSuccessFactors: string[] = [];
  
  // Count pattern frequencies in top performers
  const patternCounts = new Map<string, number>();
  for (const a of topPerformers) {
    for (const pattern of a.analysis.patterns) {
      patternCounts.set(pattern.pattern, (patternCounts.get(pattern.pattern) || 0) + 1);
    }
  }
  
  for (const [pattern, count] of patternCounts) {
    if (count >= topPerformers.length / 2) {
      commonSuccessFactors.push(`Pattern "${pattern}" appears in most top performers`);
    }
  }
  
  // Find common failure factors from bottom performers
  const bottomPerformers = analyses.slice(-Math.ceil(analyses.length / 3));
  const commonFailureFactors: string[] = [];
  
  const weaknessCounts = new Map<string, number>();
  for (const a of bottomPerformers) {
    for (const weakness of a.analysis.contentCharacteristics.weaknesses) {
      weaknessCounts.set(weakness, (weaknessCounts.get(weakness) || 0) + 1);
    }
  }
  
  for (const [weakness, count] of weaknessCounts) {
    if (count >= bottomPerformers.length / 2) {
      commonFailureFactors.push(`Weak "${weakness}" appears in most poor performers`);
    }
  }
  
  return {
    bestPerformer,
    worstPerformer,
    commonSuccessFactors,
    commonFailureFactors,
  };
}

// ============================================
// Platform-Specific Guidance
// ============================================

/**
 * Get platform-specific metric guidance
 */
export function getPlatformMetricGuide(platform: PlatformType): string {
  switch (platform) {
    case 'linkedin':
      return `
## LinkedIn Metrics Interpretation Guide

**What Each Metric Means on LinkedIn:**

1. **Impressions**: How many times your post appeared in feeds
   - Average reach is ~15% of followers
   - Higher impressions = algorithm is pushing your content
   - First-hour engagement determines algorithm boost

2. **Reactions (Likes)**: Basic acknowledgment
   - Least valuable engagement type
   - High likes + low comments = passive content
   - Different reaction types (celebrate, support) signal more intent

3. **Comments**: MOST IMPORTANT for LinkedIn
   - Comments are weighted 4x more than likes by the algorithm
   - Drive comment threads to boost visibility
   - Quality of comments matters (length, questions)

4. **Reposts**: Exponential reach multiplier
   - Weighted 6x more than likes
   - Indicates highly valuable or shareable content
   - Each repost shows to a new network

5. **Clicks**: Shows intent and interest
   - CTR of 0.1%+ is good
   - High clicks = strong hook and clear value proposition
   - Profile clicks indicate authority building

**What High-Performing LinkedIn Content Does:**
- Starts with a hook that stops scrolling
- Includes personal stories or specific examples
- Ends with a question to drive comments
- Has a clear opinion or stance
- Provides actionable value
`;

    case 'facebook':
      return `
## Facebook Metrics Interpretation Guide

**What Each Metric Means on Facebook:**

1. **Reach**: How many unique users saw your post
   - Organic reach is only ~5.2% of followers (very low)
   - High reach indicates algorithm favor
   - Content type affects reach (video > photos > text)

2. **Impressions**: Total views (including repeat views)
   - Multiple impressions per user = engaging content
   - Compare impressions to reach for "stickiness"

3. **Reactions**: Facebook has multiple types
   - Love/Wow/Haha signal more emotion than Like
   - Algorithm weights emotional reactions higher
   - High reaction diversity = emotionally resonant content

4. **Comments**: Community building metric
   - Comments trigger notifications to other commenters
   - Starting conversations builds community
   - Reply to comments to boost post visibility

5. **Shares**: Viral potential indicator
   - Most valuable engagement type
   - Shares reach entirely new networks
   - High shares = universally valuable content

**What High-Performing Facebook Content Does:**
- Uses visual content (images/video)
- Triggers emotional response
- Encourages discussion with questions
- Provides entertainment or utility value
- Posts at high-activity times
`;

    case 'twitter':
      return `
## Twitter/X Metrics Interpretation Guide

**What Each Metric Means on Twitter:**

1. **Impressions**: Times tweet appeared in feeds
   - Twitter has better organic reach than Facebook
   - Impressions spike when content gets retweeted
   - Compare to follower count for reach %

2. **Engagements**: Total of all interactions
   - Engagement rate of 2.15% is median
   - Higher engagement = algorithm boost
   - Engagement rate = engagements / impressions

3. **Likes**: Quick acknowledgment
   - Lowest-value engagement
   - High likes alone means content is "nice" but not compelling
   - Likes don't significantly boost reach

4. **Retweets/Reposts**: Viral mechanism
   - MOST IMPORTANT metric for reach
   - Each retweet exposes to new network
   - Quote tweets (with comment) indicate stronger resonance

5. **Replies**: Conversation indicator
   - Replies signal strong engagement
   - Algorithm favors content that generates discussion
   - Thread engagement builds community

6. **Link Clicks**: Intent indicator
   - High clicks = strong value proposition
   - Click-through rate indicates content-to-CTA alignment
   - Profile clicks show authority building

**What High-Performing Twitter Content Does:**
- First line is a hook (curiosity, controversy, value)
- Uses threads for depth (algorithm likes threads)
- Includes visual elements when relevant
- Rides trending topics strategically
- Posts at high-activity times (9am-11am weekdays)
`;

    case 'instagram':
      return `
## Instagram Metrics Interpretation Guide

**What Each Metric Means on Instagram:**

1. **Reach**: Unique accounts that saw your post
   - ~20% of followers see feed posts
   - Reels have higher reach potential
   - Non-follower reach indicates discovery

2. **Impressions**: Total times content was viewed
   - Multiple impressions = content is sticky
   - High impressions / reach = people viewing multiple times

3. **Likes**: Basic engagement
   - Lowest-value engagement type
   - Like-heavy engagement = passive audience
   - Reels tend to get more likes than feed posts

4. **Comments**: Community building
   - Weighted 4x more than likes
   - Comment threads boost post visibility
   - Quality matters (not just emojis)

5. **Shares**: Viral potential
   - DM shares indicate personal recommendations
   - Share to Story extends reach
   - High shares = universally resonant content

6. **Saves**: MOST IMPORTANT for Instagram
   - Saves are weighted 5x+ more than likes
   - Algorithm prioritizes saved content
   - Indicates educational/actionable value
   - Save rate > 8% is excellent

7. **Watch Time (for video)**: Algorithm signal
   - Average watch time matters more than views
   - High completion rate = engaging content
   - Instagram head recommends prioritizing watch time

**What High-Performing Instagram Content Does:**
- Creates save-worthy content (tips, frameworks, tutorials)
- Uses carousel posts for educational content
- Has strong visual hook in first frame
- Includes call-to-action for saves/comments
- Uses relevant hashtags (3-5, not 30)
- Posts Reels for discovery
`;

    default:
      return 'Platform-specific guidance not available.';
  }
}

// Re-export BENCHMARKS constant
export { BENCHMARKS };


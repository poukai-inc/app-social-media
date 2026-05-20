/**
 * AI Content Reviewer
 * 
 * This service acts as an autonomous AI editor that reviews generated content
 * and makes publish/reject decisions. It evaluates:
 * - Content quality and clarity
 * - Brand voice alignment
 * - Risk assessment (controversial, offensive, factually questionable)
 * - Engagement potential
 * - Platform appropriateness
 * - Timing recommendations
 */

import { PageContentStrategy } from '@/lib/openai';
import { PlatformType } from '@/lib/platforms/types';
import { createChatCompletion } from '@/lib/ai-client';

export interface ReviewCriteria {
  authenticity: {
    score: number; // 0-10 - THE MOST IMPORTANT
    feedback: string;
    aiRedFlagsFound?: string[];
  };
  hookQuality: {
    score: number; // 0-10
    feedback: string;
  };
  contentQuality: {
    score: number; // 0-10
    feedback: string;
  };
  brandAlignment: {
    score: number; // 0-10
    feedback: string;
  };
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    concerns: string[];
  };
  engagementPotential: {
    score: number; // 0-10
    reasoning: string;
  };
  platformFit: {
    score: number; // 0-10
    feedback: string;
  };
  overallScore: number; // 0-100
}

export interface ReviewDecision {
  approved: boolean;
  decision: 'publish' | 'needs_revision' | 'reject';
  criteria: ReviewCriteria;
  reasoning: string;
  suggestedRevisions?: string[];
  recommendedScheduleTime?: {
    reason: string;
    urgency: 'immediate' | 'optimal_time' | 'flexible';
  };
  confidence: number; // 0-1, how confident the AI is in its decision
}

export interface ReviewContext {
  content: string;
  platform: PlatformType;
  strategy?: PageContentStrategy;
  topic?: string;
  angle?: string;
  sourceContent?: {
    title?: string;
    summary?: string;
  };
  recentPerformance?: {
    avgEngagement: number;
    topPerformingAngles: string[];
    audiencePreferences: string[];
  };
}

/**
 * AI reviews generated content and makes a publish decision
 */
export async function reviewContentForPublishing(
  context: ReviewContext
): Promise<ReviewDecision> {
  const { content, platform, strategy, topic, angle, sourceContent, recentPerformance } = context;

  // Determine if this is organization or personal voice
  const pageType = strategy?.pageType || 'personal';
  const isOrganization = pageType === 'organization';
  
  const voiceGuidance = isOrganization 
    ? `This is an ORGANIZATION page using "We" voice. Adjust expectations:
- "We've seen..." is acceptable for organizations (not a red flag)
- Case studies and client stories are natural for companies
- Focus on SPECIFIC examples, not that it uses "We"
- Judge authenticity by specificity of details, not pronouns`
    : `This is a PERSONAL page using "I" voice. Standard authenticity rules apply.`;

  const systemPrompt = `You are a social media editor. You review posts and output a JSON decision.

OUTPUT RULES:
1. Output ONLY valid JSON. No text before or after. No markdown code blocks.
2. No <think> tags. No reasoning outside the JSON.
3. Start your response with { and end with }.

${voiceGuidance}

SCORING GUIDE:

AUTHENTICITY (0-10) - most important:
- Score 0-3: Fabricated stats, fake client names, generic AI-sounding copy
- Score 4-6: Real lessons but formulaic or impersonal
- Score 7-10: Genuine insight, strong opinion, sounds human

HOOK QUALITY (0-10):
- Score 0-3: Generic openers like "In today's world...", "We've seen many..."
- Score 8-10: Specific, surprising, creates curiosity

AI RED FLAGS (list any you find):
- Em dashes, "Moreover/Furthermore/Additionally", "not just X but Y"
- "Game-changing", "revolutionary", "leverage", "utilize", "seamlessly"
- "prioritize X over Y", "It's worth noting", "The truth is"
- "What are your thoughts?" (weak closing)
- Fabricated percentages or metrics without real context
- 3+ red flags = reject

DECISIONS:
- PUBLISH: authenticity >= 7, hook >= 6, 0-1 red flags, overall >= 70
- NEEDS_REVISION: authenticity 5-6, or weak hook but good story, or 2 fixable red flags
- REJECT: authenticity < 5, or hook < 4, or 3+ red flags, or all generic, or fabricated stats`;

  const userPrompt = `Review this ${platform} post. Output JSON only.

POST:
${content}

${platform === 'twitter' ? `TWITTER NOTES: Tweets are max 280 chars. Don't penalize brevity. Reward punchiness and strong opinions. A sharp 200-char take is better than a generic 260-char tweet.` : ''}
${strategy ? `BRAND: ${strategy.persona || 'Professional'}. Audience: ${strategy.targetAudience || 'Professionals'}.` : ''}
${topic ? `Topic: ${topic}.` : ''} ${angle ? `Angle: ${angle}.` : ''}

QUICK CHECKS (reject if any are true):
1. Contains fabricated stats or percentages without real context?
2. Contains 3+ AI red flag phrases?
3. Completely generic with no personal insight?
4. Contains made-up client names or companies?

NOTE: Educational posts sharing real principles ARE good. A strong opinion without fake stats is GOOD. Don't reject authentic content just because it's simple.

If rejecting, suggestedRevisions MUST say exactly WHAT to fix. Not "be more authentic" but "Replace '40% faster' with a real lesson like 'We rebuilt it from scratch. Took 6 weeks.'"

Respond with this exact JSON structure:
{
  "approved": true or false,
  "decision": "publish" or "needs_revision" or "reject",
  "criteria": {
    "authenticity": { "score": 0-10, "feedback": "why", "aiRedFlagsFound": [] },
    "hookQuality": { "score": 0-10, "feedback": "why" },
    "contentQuality": { "score": 0-10, "feedback": "why" },
    "brandAlignment": { "score": 0-10, "feedback": "why" },
    "riskAssessment": { "level": "low", "concerns": [] },
    "engagementPotential": { "score": 0-10, "reasoning": "why" },
    "platformFit": { "score": 0-10, "feedback": "why" },
    "overallScore": 0-100
  },
  "reasoning": "one sentence explaining your decision",
  "suggestedRevisions": ["specific fix 1", "specific fix 2"],
  "recommendedScheduleTime": { "reason": "why", "urgency": "flexible" },
  "confidence": 0.0-1.0
}`;

  try {
    // Note: For JSON mode, we use the raw groqClient since createChatCompletion doesn't support response_format yet
    const result = await createChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent reviews
      maxTokens: 2000,
    });

    const resultContent = result.content;
    if (!resultContent) {
      throw new Error('No response from AI reviewer');
    }

    // Extract JSON from response (handle markdown code blocks)
    // First strip markdown code block wrappers if present
    let jsonStr = resultContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    // Try to find the outermost JSON object by matching balanced braces
    let braceCount = 0;
    let jsonStart = -1;
    let jsonEnd = -1;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') {
        if (braceCount === 0) jsonStart = i;
        braceCount++;
      } else if (jsonStr[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }
    
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON found in response');
    }
    
    let extractedJson = jsonStr.substring(jsonStart, jsonEnd + 1);
    
    let decision: ReviewDecision;
    try {
      decision = JSON.parse(extractedJson) as ReviewDecision;
    } catch (parseError) {
      // Try cleaning common issues: trailing commas, unescaped newlines in strings
      extractedJson = extractedJson
        .replace(/,\s*([}\]])/g, '$1')  // Remove trailing commas
        .replace(/[\r\n]+/g, ' ')       // Flatten newlines
        .replace(/\\'/g, "'");          // Fix escaped single quotes
      try {
        decision = JSON.parse(extractedJson) as ReviewDecision;
      } catch (retryParseError) {
        throw new Error(`Failed to parse review JSON: ${(retryParseError as Error).message}`);
      }
    }
    
    // Validate the decision
    if (typeof decision.approved !== 'boolean' || !decision.decision || !decision.criteria) {
      throw new Error('Invalid review response structure');
    }

    // Ensure decision matches approved status
    decision.approved = decision.decision === 'publish';

    return decision;

  } catch (error) {
    console.error('AI review failed:', error);
    
    // Fail-safe: if AI review fails, don't auto-publish
    return {
      approved: false,
      decision: 'needs_revision',
      criteria: {
        authenticity: { score: 0, feedback: 'Review failed', aiRedFlagsFound: [] },
        hookQuality: { score: 0, feedback: 'Review failed' },
        contentQuality: { score: 0, feedback: 'Review failed' },
        brandAlignment: { score: 0, feedback: 'Review failed' },
        riskAssessment: { level: 'high', concerns: ['AI review system error - requires human review'] },
        engagementPotential: { score: 0, reasoning: 'Review failed' },
        platformFit: { score: 0, feedback: 'Review failed' },
        overallScore: 0,
      },
      reasoning: `AI review failed: ${error instanceof Error ? error.message : 'Unknown error'}. Flagged for human review.`,
      confidence: 0,
    };
  }
}

/**
 * Batch review multiple pieces of content
 */
export async function reviewMultipleContents(
  contents: ReviewContext[]
): Promise<Map<string, ReviewDecision>> {
  const results = new Map<string, ReviewDecision>();
  
  // Review in parallel with rate limiting
  const batchSize = 3;
  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const reviews = await Promise.all(
      batch.map(ctx => reviewContentForPublishing(ctx))
    );
    
    batch.forEach((ctx, idx) => {
      results.set(ctx.content.slice(0, 50), reviews[idx]);
    });
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < contents.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

/**
 * Quick quality check - faster but less thorough
 * Use for pre-screening before full review
 */
export async function quickQualityCheck(
  content: string,
  platform: PlatformType
): Promise<{ passesQuickCheck: boolean; concerns: string[] }> {
  const systemPrompt = `You are a quick content screener. Check for obvious issues that would disqualify content from publishing. Be fast and decisive.

Check for:
1. Offensive or inappropriate language
2. Obvious factual errors
3. Spam-like or promotional overload
4. Incomplete or broken content
5. Wrong platform format

Respond with JSON: { "passesQuickCheck": boolean, "concerns": ["string"] }`;

  try {
    const result = await createChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Platform: ${platform}\n\nContent:\n${content}` },
      ],
      temperature: 0.1,
      maxTokens: 300,
      preferFast: true,
    });

    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] || '{}');
    return {
      passesQuickCheck: parsed.passesQuickCheck ?? false,
      concerns: parsed.concerns || [],
    };
  } catch {
    return { passesQuickCheck: false, concerns: ['Quick check failed'] };
  }
}

/**
 * Get minimum quality thresholds for auto-publishing
 * These can be customized per page/user
 */
export function getAutoPublishThresholds() {
  return {
    minOverallScore: 60,    // Lowered from 70
    minAuthenticity: 5,      // Lowered from 7 (was too strict)
    minHookQuality: 5,       // Lowered from 6
    minContentQuality: 5,    // Lowered from 6
    minBrandAlignment: 5,    // Lowered from 6
    minEngagementPotential: 4, // Lowered from 5
    minPlatformFit: 5,       // Lowered from 6
    maxRiskLevel: 'medium' as const,
    minConfidence: 0.6,      // Lowered from 0.7
    maxAiRedFlags: 2,        // Increased from 1 (more lenient)
  };
}

/**
 * Check if a review decision meets auto-publish thresholds
 */
export function meetsAutoPublishCriteria(
  decision: ReviewDecision,
  customThresholds?: Partial<ReturnType<typeof getAutoPublishThresholds>>
): boolean {
  const thresholds = { ...getAutoPublishThresholds(), ...customThresholds };
  const { criteria, confidence } = decision;
  
  // Must be explicitly approved
  if (!decision.approved || decision.decision !== 'publish') {
    return false;
  }
  
  // Check all thresholds
  if (criteria.overallScore < thresholds.minOverallScore) return false;
  if (criteria.authenticity?.score < thresholds.minAuthenticity) return false; // Critical check
  if (criteria.hookQuality?.score < thresholds.minHookQuality) return false;
  if (criteria.contentQuality.score < thresholds.minContentQuality) return false;
  if (criteria.brandAlignment.score < thresholds.minBrandAlignment) return false;
  if (criteria.engagementPotential.score < thresholds.minEngagementPotential) return false;
  if (criteria.platformFit.score < thresholds.minPlatformFit) return false;
  if (confidence < thresholds.minConfidence) return false;
  
  // Check AI red flags
  const aiRedFlagsCount = criteria.authenticity?.aiRedFlagsFound?.length || 0;
  if (aiRedFlagsCount > thresholds.maxAiRedFlags) return false;
  
  // Risk level check
  const riskLevels = ['low', 'medium', 'high', 'critical'];
  const maxRiskIndex = riskLevels.indexOf(thresholds.maxRiskLevel);
  const actualRiskIndex = riskLevels.indexOf(criteria.riskAssessment.level);
  if (actualRiskIndex > maxRiskIndex) return false;
  
  return true;
}

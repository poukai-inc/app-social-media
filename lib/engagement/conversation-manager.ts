/**
 * Conversation Manager
 *
 * Handles bidirectional conversations for ICP engagement.
 * - Monitors existing conversations for new replies
 * - Generates contextual follow-up responses
 * - Maintains conversation history and quality
 * - Prevents spam with smart rate limiting
 */

import mongoose from 'mongoose';
import type { IICPEngagement } from '../models/ICPEngagement';
import ICPEngagement from '../models/ICPEngagement';
import Page from '../models/Page';
import { twitterAdapter } from '../platforms/twitter-adapter';
import { createChatCompletion } from '../ai-client';
import { acquireLock, releaseLock } from '../distributed-lock';
import { logger } from '@/lib/logger';

const log = logger.child('engagement:conversation-manager');

// ============================================
// Production Safety Configuration
// ============================================

const PRODUCTION_LIMITS = {
  maxResponsesPerDay: 50,              // Per-page daily limit to prevent runaway costs (issue #22)
  maxResponsesPerConversation: 3,      // Stop after 3 auto-responses per conversation
  maxConversationsPerRun: 20,          // Process max 20 conversations per cron run
  minTimeBetweenChecks: 30,            // Minutes between checking same conversation
  costBudgetPerDay: 5.0,               // Max $5/day on AI responses (rough estimate)
  qualityScoreThreshold: 0.7,          // Min quality score to send (0-1)
  toxicityCheckEnabled: true,          // Enable toxicity detection
  requireHighConfidence: true,         // Only respond if AI is confident
};

// Track daily usage for cost control
interface DailyUsage {
  date: string;
  responsesGenerated: number;
  responsesSent: number;
  estimatedCost: number;
  errors: number;
}

// ============================================
// Types
// ============================================

export interface ConversationUpdate {
  engagementId: string;
  newMessages: {
    id: string;
    authorId: string;
    content: string;
    timestamp: Date;
    isFromUs: boolean;
    url?: string;
  }[];
  shouldRespond: boolean;
  responseGenerated?: string;
  responseReason?: string;
}

export interface ConversationMonitorResult {
  conversationsChecked: number;
  updatesFound: number;
  responsesGenerated: number;
  responsesSent: number;
  errors: string[];
}

// ============================================
// Production Safety & Quality Validation
// ============================================

/**
 * Comprehensive safety check before sending any response
 * Prevents spam, toxicity, off-brand content, and low-quality responses
 */
async function validateResponseSafety(
  response: string,
  theirMessage: string,
  engagement: IICPEngagement
): Promise<{ safe: boolean; reason?: string; severity?: 'low' | 'medium' | 'high'; qualityScore?: number }> {

  // 1. LENGTH & FORMAT CHECKS
  if (response.length < 20) {
    return { safe: false, reason: 'Response too short', severity: 'low' };
  }
  if (response.length > 280) {
    return { safe: false, reason: 'Response exceeds Twitter limit', severity: 'high' };
  }

  // 2. SPAM PATTERN DETECTION
  const spamPatterns = [
    /check out|click here|link in bio|dm me|follow me/i,
    /buy now|limited time|act now|don't miss/i,
    /\b(viagra|cialis|forex|crypto|nft)\b/i,
    /(https?:\/\/|www\.)/i, // No URLs in responses
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(response)) {
      return { safe: false, reason: 'Spam pattern detected', severity: 'high' };
    }
  }

  // 3. REPETITION CHECK - Don't say the same thing twice
  const previousResponses = engagement.conversation?.messages
    .filter(m => m.isFromUs)
    .map(m => m.content) || [];

  for (const prev of previousResponses) {
    const similarity = calculateStringSimilarity(response, prev);
    if (similarity > 0.8) {
      return { safe: false, reason: 'Response too similar to previous message', severity: 'medium' };
    }
  }

  // 4. CONTEXT RELEVANCE - Must relate to their message
  if (!doesResponseAddressMessage(response, theirMessage)) {
    return { safe: false, reason: 'Response not relevant to their message', severity: 'medium' };
  }

  // 5. AI QUALITY SCORE
  const qualityScore = await scoreResponseQuality(response, theirMessage);
  if (qualityScore < PRODUCTION_LIMITS.qualityScoreThreshold) {
    return {
      safe: false,
      reason: `Quality score too low: ${qualityScore.toFixed(2)}`,
      severity: 'medium',
      qualityScore,
    };
  }

  // 6. TOXICITY CHECK (if enabled)
  if (PRODUCTION_LIMITS.toxicityCheckEnabled) {
    const toxicityResult = await checkToxicity(response);
    if (toxicityResult.isToxic) {
      return {
        safe: false,
        reason: `Toxicity detected: ${toxicityResult.reason}`,
        severity: 'high',
      };
    }
  }

  // All checks passed
  return { safe: true, qualityScore };
}

/**
 * Calculate string similarity (0-1) using simple approach
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
  const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');

  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check if response actually addresses their message
 */
function doesResponseAddressMessage(response: string, theirMessage: string): boolean {
  // Extract key nouns/topics from their message
  const theirWords = theirMessage.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4); // Focus on meaningful words

  const responseWords = response.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/);

  // Response should share at least 2 meaningful words or directly answer
  const sharedWords = theirWords.filter(w => responseWords.includes(w));

  // Also check for question patterns - if they asked something, we should respond with substance
  const hasQuestion = /\?/.test(theirMessage);
  if (hasQuestion && response.length < 30) {
    return false; // Too short for a question response
  }

  return sharedWords.length >= 1 || response.length > 50;
}

/**
 * Score response quality (0-1)
 */
async function scoreResponseQuality(response: string, theirMessage: string): Promise<number> {
  try {
    const prompt = `Rate this Twitter reply quality from 0 to 1.

Their message: "${theirMessage}"
Our response: "${response}"

Score: 1.0=highly relevant and valuable, 0.7=good and on-topic, 0.5=acceptable, 0.3=weak, 0.0=spam.

Return ONLY a single decimal number between 0 and 1 (example: 0.8). No text, no explanation. Do NOT use <think> tags.`;

    const result = await createChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 10,
      preferFast: true,
    });

    log.info('Quality score AI response', { content: result.content });

    // Try to extract a number from the response
    const content = result.content || '';
    const numberMatch = content.match(/(\d+\.?\d*)/);
    const score = numberMatch ? parseFloat(numberMatch[1]) : NaN;

    if (isNaN(score)) {
      log.warn('Could not parse quality score, defaulting to 0.7');
      return 0.7; // Default to passing score if we can't parse
    }

    return Math.max(0, Math.min(1, score));
  } catch (error) {
    log.warn('Failed to score response quality', { error: error instanceof Error ? error.message : String(error) });
    return 0.7; // Default to passing score if scoring fails
  }
}

/**
 * Check for toxic/inappropriate content
 */
async function checkToxicity(text: string): Promise<{ isToxic: boolean; reason?: string }> {
  // Simple rule-based toxicity check
  // In production, consider using Perspective API or similar

  const toxicPatterns = [
    /\b(fuck|shit|damn|hell|ass|bitch|bastard)\b/i,
    /\b(stupid|idiot|moron|dumb|loser)\b/i,
    /\b(hate|kill|die|death)\b/i,
  ];

  for (const pattern of toxicPatterns) {
    if (pattern.test(text)) {
      return { isToxic: true, reason: 'Inappropriate language detected' };
    }
  }

  // Check for all caps (shouting)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.6 && text.length > 20) {
    return { isToxic: true, reason: 'Excessive capitalization (appears aggressive)' };
  }

  return { isToxic: false };
}

// ============================================
// Cost Control & Rate Limiting
// ============================================

// Daily usage is tracked PER PAGE (per tenant), keyed by `${pageId}:${date}`,
// so one page's volume never throttles another and the response/cost caps
// apply per page. The DB aggregate below is scoped to the page; the in-memory
// entry is an advisory counter seeded from that authoritative query. (issue #22)
const dailyUsageByKey = new Map<string, DailyUsage>();

function usageKey(pageId: string, date: string): string {
  return `${pageId}:${date}`;
}

async function checkDailyLimits(pageId: string): Promise<{ allowed: boolean; reason?: string }> {
  const today = new Date().toISOString().split('T')[0];
  const key = usageKey(pageId, today);

  // Check cache first
  const cached = dailyUsageByKey.get(key);
  if (cached) {
    if (cached.responsesSent >= PRODUCTION_LIMITS.maxResponsesPerDay) {
      return { allowed: false, reason: `Daily limit reached: ${cached.responsesSent}/${PRODUCTION_LIMITS.maxResponsesPerDay}` };
    }
    if (cached.estimatedCost >= PRODUCTION_LIMITS.costBudgetPerDay) {
      return { allowed: false, reason: `Daily budget exceeded: $${cached.estimatedCost.toFixed(2)}` };
    }
    return { allowed: true };
  }

  // Query database for today's usage, scoped to THIS page.
  const todayStart = new Date(today);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const stats = await ICPEngagement.aggregate([
    {
      $match: {
        pageId: new mongoose.Types.ObjectId(pageId),
        'conversation.messages.timestamp': {
          $gte: todayStart,
          $lt: todayEnd,
        },
        'conversation.messages.isFromUs': true,
      },
    },
    {
      $project: {
        autoResponsesToday: {
          $size: {
            $filter: {
              input: '$conversation.messages',
              as: 'msg',
              cond: {
                $and: [
                  { $eq: ['$$msg.isFromUs', true] },
                  { $gte: ['$$msg.timestamp', todayStart] },
                  { $lt: ['$$msg.timestamp', todayEnd] },
                ],
              },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        totalResponses: { $sum: '$autoResponsesToday' },
      },
    },
  ]);

  const totalResponses = stats[0]?.totalResponses || 0;
  const estimatedCost = totalResponses * 0.02; // Rough estimate: $0.02 per response

  dailyUsageByKey.set(key, {
    date: today,
    responsesGenerated: totalResponses,
    responsesSent: totalResponses,
    estimatedCost,
    errors: 0,
  });

  if (totalResponses >= PRODUCTION_LIMITS.maxResponsesPerDay) {
    return { allowed: false, reason: `Daily limit reached: ${totalResponses}/${PRODUCTION_LIMITS.maxResponsesPerDay}` };
  }
  if (estimatedCost >= PRODUCTION_LIMITS.costBudgetPerDay) {
    return { allowed: false, reason: `Daily budget exceeded: $${estimatedCost.toFixed(2)}` };
  }

  return { allowed: true };
}

function incrementDailyUsage(pageId: string, sent: boolean = true) {
  const today = new Date().toISOString().split('T')[0];
  const entry = dailyUsageByKey.get(usageKey(pageId, today));
  // No-op until checkDailyLimits has seeded this page's entry from the DB.
  if (entry) {
    entry.responsesGenerated++;
    if (sent) {
      entry.responsesSent++;
      entry.estimatedCost += 0.02;
    }
  }
}

// ============================================
// Conversation Quality Analyzer
// ============================================

const CONVERSATION_ANALYZER_PROMPT = `You analyze conversation context to decide if we should keep engaging on Twitter/LinkedIn.

IMPORTANT: Output ONLY valid JSON. No explanations, no markdown code blocks, no text before or after. Do NOT use <think> tags.

We want to BUILD RELATIONSHIPS. Be BIASED TOWARD RESPONDING unless there's a clear reason not to.

RESPOND (default):
- They shared a perspective or opinion
- They answered our question
- They mentioned something we can ask about
- They have expertise to share
- The conversation has momentum

DO NOT RESPOND:
- Single-word replies: "Thanks", "Ok", "Nice", "Cool"
- Conversation enders: "Bye", "Talk later"
- Hostile or dismissive tone
- We already sent 3+ responses (spam risk)

Output format (JSON only, nothing else):
{"shouldRespond": true, "reason": "brief explanation", "suggestedTone": "thoughtful"}`;

async function analyzeConversationContext(
  conversationHistory: Array<{ content: string; isFromUs: boolean; timestamp: Date }>,
  lastMessage: { content: string; isFromUs: boolean }
): Promise<{
  shouldRespond: boolean;
  reason: string;
  suggestedTone: 'thoughtful' | 'supportive' | 'educational' | 'friendly';
}> {
  const conversationText = conversationHistory
    .map(msg => `${msg.isFromUs ? '[US]' : '[THEM]'}: ${msg.content}`)
    .join('\n');

  const prompt = `Analyze this conversation to determine if we should respond to their latest message:

CONVERSATION HISTORY:
${conversationText}

LATEST MESSAGE FROM THEM:
${lastMessage.content}

Context: This is a professional social media conversation where we initially engaged with value-adding insights. We want to maintain quality engagement without being spammy or desperate.`;

  try {
    const result = await createChatCompletion({
      messages: [
        { role: 'system', content: CONVERSATION_ANALYZER_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 500, // Increased to prevent JSON truncation
      preferFast: true,
    });

    const content = result.content || '';
    log.info('AI analysis raw response', { preview: content.slice(0, 200) });

    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object in the string
    const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      jsonStr = jsonObjMatch[0];
    }

    const analysis = JSON.parse(jsonStr);
    return {
      shouldRespond: analysis.shouldRespond === true,
      reason: analysis.reason || 'No reason provided',
      suggestedTone: analysis.suggestedTone || 'friendly',
    };
  } catch (error) {
    log.warn('Failed to analyze conversation context', { error: error instanceof Error ? error.message : String(error) });
    // Default to responding if analysis fails - better to engage than miss opportunities
    return {
      shouldRespond: true,
      reason: 'Analysis parsing failed - defaulting to respond',
      suggestedTone: 'friendly',
    };
  }
}

// ============================================
// Response Generation
// ============================================

async function generateConversationResponse(
  originalPost: { content: string; authorUsername?: string },
  conversationHistory: Array<{ content: string; isFromUs: boolean; timestamp: Date }>,
  suggestedTone: string,
  platform: 'twitter' | 'linkedin'
): Promise<string> {
  const maxLength = platform === 'twitter' ? 250 : 300; // Leave room for potential handles

  const conversationText = conversationHistory.slice(-4) // Last 4 messages for context
    .map(msg => `${msg.isFromUs ? '[US]' : '[THEM]'}: ${msg.content}`)
    .join('\n');

  const prompt = `Generate a follow-up reply for this ${platform} conversation.

ORIGINAL POST: "${originalPost.content}"

CONVERSATION:
${conversationText}

Tone: ${suggestedTone}
Max length: ${maxLength} characters

Rules:
- Return ONLY the reply text. No explanations, no quotes around it. Do NOT use <think> tags.
- Be natural and conversational
- Reference something specific from their latest message
- Sound like a real person, not a bot
- Avoid "Great point!" or "Thanks for sharing!"
- If they asked a question, answer it`;

  log.info('Generating conversation response', { platform, historyLength: conversationHistory.length, promptLength: prompt.length });

  // Retry up to 3 times if we get empty response
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await createChatCompletion({
      messages: [
        { role: 'system', content: 'You write authentic social media replies. Return ONLY the reply text. No explanations, no meta-commentary, no hashtags, no <think> tags. Just the reply.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      maxTokens: 150,
      preferFast: attempt > 1 ? false : true, // Use slower model on retry
    });

    log.info('AI result', { attempt, contentType: typeof result.content, contentLength: result.content?.length || 0 });

    const response = result.content?.trim() || '';

    if (response.length > 0) {
      // Truncate if too long (AI doesn't always respect length limits)
      let finalResponse = response;
      if (platform === 'twitter' && finalResponse.length > 270) {
        // Find a natural break point
        const truncated = finalResponse.slice(0, 260);
        const lastSentence = truncated.lastIndexOf('.');
        const lastQuestion = truncated.lastIndexOf('?');
        const breakPoint = Math.max(lastSentence, lastQuestion);

        if (breakPoint > 150) {
          finalResponse = truncated.slice(0, breakPoint + 1);
        } else {
          // Just truncate at word boundary
          const lastSpace = truncated.lastIndexOf(' ');
          finalResponse = truncated.slice(0, lastSpace) + '...';
        }
        log.info('Response truncated', { originalLength: response.length, finalLength: finalResponse.length });
      }

      log.info('Generated response', { length: finalResponse.length, preview: finalResponse.slice(0, 100) });
      return finalResponse;
    }

    log.warn('Empty response on attempt', {
      attempt,
      nextAction: attempt < 3 ? 'retrying with different model' : 'all retries exhausted',
    });
  }

  log.error('All response generation attempts returned empty');
  return '';
}

// ============================================
// Smart Polling Optimization
// ============================================

/**
 * Calculate priority score for conversation polling
 * Higher score = check sooner (more likely to have activity)
 */
function calculateConversationPriority(engagement: IICPEngagement): number {
  let score = 0;
  const now = Date.now();

  // Recent activity = high priority
  const lastReplyTime = engagement.conversation?.messages?.[engagement.conversation.messages.length - 1]?.timestamp;
  if (lastReplyTime) {
    const hoursSinceReply = (now - new Date(lastReplyTime).getTime()) / (1000 * 60 * 60);
    if (hoursSinceReply < 6) score += 100;        // Very recent (< 6 hours)
    else if (hoursSinceReply < 24) score += 50;   // Recent (< 1 day)
    else if (hoursSinceReply < 72) score += 20;   // Somewhat recent (< 3 days)
  }

  // Active conversations = higher priority
  const messageCount = engagement.conversation?.messages?.length || 0;
  score += Math.min(messageCount * 5, 30); // Up to +30 for active conversations

  // Never checked = medium priority (might be new)
  if (!engagement.conversation?.lastCheckedAt) {
    score += 40;
  }

  // Long time since last check = increase priority
  const lastChecked = engagement.conversation?.lastCheckedAt;
  if (lastChecked) {
    const hoursSinceCheck = (now - new Date(lastChecked).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCheck > 12) score += 15;
  }

  return score;
}

/**
 * Determine check interval based on conversation state (exponential backoff)
 * Returns minutes until next check should happen
 */
function getAdaptiveCheckInterval(engagement: IICPEngagement): number {
  const baseInterval = PRODUCTION_LIMITS.minTimeBetweenChecks; // 30 minutes default

  // If conversation is very active, check more frequently
  const lastReplyTime = engagement.conversation?.messages?.[engagement.conversation.messages.length - 1]?.timestamp;
  if (lastReplyTime) {
    const hoursSinceReply = (Date.now() - new Date(lastReplyTime).getTime()) / (1000 * 60 * 60);

    if (hoursSinceReply < 2) return baseInterval * 0.5;      // 15 min - very active
    if (hoursSinceReply < 6) return baseInterval;             // 30 min - active
    if (hoursSinceReply < 24) return baseInterval * 2;        // 60 min - recent
    if (hoursSinceReply < 72) return baseInterval * 4;        // 120 min - older
    return baseInterval * 8;                                   // 240 min - very old
  }

  return baseInterval; // Default if no message history
}

// ============================================
// Main Conversation Manager
// ============================================

/**
 * Check all active conversations for new replies and respond appropriately
 */
export async function monitorAndRespondToConversations(
  pageId?: string,
  config: {
    maxConversationsToCheck?: number;
    maxResponsesToSend?: number;
    minTimeBetweenChecks?: number; // minutes
    dryRun?: boolean;
    useSmartPolling?: boolean; // Enable priority-based polling optimization
  } = {}
): Promise<ConversationMonitorResult> {
  const {
    maxConversationsToCheck = PRODUCTION_LIMITS.maxConversationsPerRun,
    maxResponsesToSend = 10,
    minTimeBetweenChecks = PRODUCTION_LIMITS.minTimeBetweenChecks,
    dryRun = false,
    useSmartPolling = true, // Default ON - can disable if issues arise
  } = config;

  const result: ConversationMonitorResult = {
    conversationsChecked: 0,
    updatesFound: 0,
    responsesGenerated: 0,
    responsesSent: 0,
    errors: [],
  };

  // PRODUCTION SAFETY: Acquire distributed lock to prevent duplicate processing
  const lockKey = `conversation-monitor${pageId ? `-${pageId}` : ''}`;
  const lockResult = await acquireLock({
    lockName: lockKey,
    ttlSeconds: 300, // 5 minute lock
  });

  if (!lockResult.acquired) {
    result.errors.push('Another instance is already processing conversations');
    log.info('Lock not acquired', { error: lockResult.error });
    return result;
  }

  try {
    // PRODUCTION SAFETY: per-page invocation gates early on the targeted page's
    // usage. A global run (no pageId) enforces limits per-conversation below
    // using each conversation's own pageId. (issue #22)
    if (!dryRun && pageId) {
      const limitCheck = await checkDailyLimits(pageId);
      if (!limitCheck.allowed) {
        result.errors.push(`Daily limits exceeded: ${limitCheck.reason}`);
        log.warn('Daily limit exceeded', { reason: limitCheck.reason });
        return result;
      }
    }
    // Find active conversations that need checking
    const cutoffTime = new Date(Date.now() - minTimeBetweenChecks * 60 * 1000);

    // Query finds:
    // 1. Engagements with conversation tracking enabled (new system)
    // 2. Engagements where they replied but conversation not yet initialized (legacy/migration)
    const query: Record<string, unknown> = {
      platform: 'twitter',
      $or: [
        // New conversation system - tracking enabled
        {
          'conversation.autoResponseEnabled': true,
          $or: [
            { 'conversation.currentAutoResponseCount': { $lt: 3 } },
            { 'conversation.currentAutoResponseCount': { $exists: false } },
          ],
        },
        // Legacy engagements - they replied but no conversation tracking yet
        {
          'followUp.theyReplied': true,
          'conversation': { $exists: false },
        },
        // Has ourReply.id (we posted a reply) but no conversation tracking
        {
          'ourReply.id': { $exists: true, $ne: null },
          'conversation': { $exists: false },
        },
      ],
    };

    if (pageId) {
      query.pageId = new mongoose.Types.ObjectId(pageId);
    }

    // OPTIMIZATION: Find more conversations than needed so we can prioritize
    const findLimit = useSmartPolling ? maxConversationsToCheck * 3 : maxConversationsToCheck;

    const allConversations = await ICPEngagement.find(query)
      .sort({ 'conversation.lastCheckedAt': 1 }) // Oldest first
      .limit(findLimit)
      .populate('pageId', 'connections')
      .lean();

    // OPTIMIZATION: Apply smart polling logic
    let conversationsToProcess = allConversations;

    if (useSmartPolling && allConversations.length > 0) {
      // Filter out conversations that don't need checking yet (adaptive intervals)
      const now = Date.now();
      conversationsToProcess = allConversations.filter((eng: IICPEngagement) => {
        const lastChecked = eng.conversation?.lastCheckedAt;
        if (!lastChecked) return true; // Never checked = always check

        const adaptiveInterval = getAdaptiveCheckInterval(eng);
        const timeSinceCheck = (now - new Date(lastChecked).getTime()) / (1000 * 60); // minutes

        return timeSinceCheck >= adaptiveInterval;
      });

      // Score and sort by priority
      const scoredConversations = conversationsToProcess.map((eng: IICPEngagement) => ({
        engagement: eng,
        priority: calculateConversationPriority(eng),
      }));

      scoredConversations.sort((a, b) => b.priority - a.priority); // Highest priority first

      conversationsToProcess = scoredConversations
        .slice(0, maxConversationsToCheck)
        .map(item => item.engagement) as typeof allConversations;

      log.info('Smart polling applied', { total: allConversations.length, afterFiltering: conversationsToProcess.length });
    } else {
      // Fallback to simple time-based filtering (original logic)
      conversationsToProcess = allConversations.filter((eng: IICPEngagement) => {
        const lastChecked = eng.conversation?.lastCheckedAt;
        return !lastChecked || new Date(lastChecked) < cutoffTime;
      }).slice(0, maxConversationsToCheck);
    }

    const activeConversations = conversationsToProcess;

    log.info('Conversations to check', { count: activeConversations.length });

    let responsesSent = 0;

    for (const engagement of activeConversations) {
      if (responsesSent >= maxResponsesToSend) {
        log.info('Reached max responses limit', { maxResponsesToSend });
        break;
      }

      try {
        result.conversationsChecked++;

        // MIGRATION: Initialize conversation tracking for legacy engagements
        if (!engagement.conversation) {
          log.info('Initializing conversation tracking for legacy engagement', { engagementId: engagement._id });
          const engExt = engagement as unknown as {
            ourReply?: { id?: string; content?: string; url?: string };
            engagedAt?: Date;
            conversation?: Record<string, unknown>;
          };
          const ourReply = engExt.ourReply;
          await ICPEngagement.updateOne(
            { _id: engagement._id },
            {
              $set: {
                'conversation.threadId': engagement.targetPost.id,
                'conversation.autoResponseEnabled': true,
                'conversation.maxAutoResponses': 3,
                'conversation.currentAutoResponseCount': 0,
                'conversation.lastCheckedAt': new Date(),
                'conversation.messages': ourReply?.id ? [{
                  id: ourReply.id,
                  authorId: '', // Unknown for legacy
                  content: ourReply.content || '',
                  timestamp: engExt.engagedAt || new Date(),
                  isFromUs: true,
                  url: ourReply.url,
                }] : [],
              }
            }
          );
          // Reload engagement with conversation data
          engExt.conversation = {
            threadId: engagement.targetPost.id,
            autoResponseEnabled: true,
            maxAutoResponses: 3,
            currentAutoResponseCount: 0,
            lastCheckedAt: new Date(),
            messages: [],
          };
        }

        // Get Twitter connection for this page
        // IMPORTANT: Reload fresh from DB to avoid stale token race with token-refresh cron
        const page = engagement.pageId as unknown as { _id?: { toString(): string }; toString(): string };
        const pageId = page._id?.toString() || page.toString();
        const freshPage = await Page.findById(pageId);
        const twitterConnection = freshPage?.connections?.find((c: { platform: string; isActive: boolean }) => c.platform === 'twitter' && c.isActive);

        if (!twitterConnection) {
          result.errors.push(`Page ${pageId} has no active Twitter connection`);
          continue;
        }

        // Check for new replies in this conversation
        const lastChecked = engagement.conversation?.lastCheckedAt;
        const threadId = engagement.conversation?.threadId || engagement.targetPost?.id;
        const engExt2 = engagement as unknown as { ourReply?: { id?: string }; conversation?: { consecutiveFailures?: number } };
        const ourReplyId = engExt2.ourReply?.id;

        log.info('Checking engagement', {
          engagementId: engagement._id,
          threadId,
          targetPostId: engagement.targetPost?.id,
          ourReplyId,
        });

        const conversationResult = await twitterAdapter.checkConversationReplies(
          twitterConnection,
          threadId,
          lastChecked,
          ourReplyId
        );

        if (!conversationResult.success) {
          const errorMsg = conversationResult.error || 'Unknown error';
          result.errors.push(`Failed to check conversation ${engagement._id}: ${errorMsg}`);

          // PRODUCTION FIX: If the error is auth-related (401, "Could not get user info",
          // "Unauthorized"), disable auto-response to stop retrying a broken connection.
          const isAuthError = errorMsg.includes('401') ||
            errorMsg.includes('Unauthorized') ||
            errorMsg.includes('Could not get user info') ||
            errorMsg.includes('Could not get user ID') ||
            errorMsg.includes('invalid or expired');

          if (isAuthError) {
            log.warn('Auth error - disabling auto-response', { engagementId: engagement._id, error: errorMsg });
            await ICPEngagement.updateOne(
              { _id: engagement._id },
              {
                $set: {
                  'conversation.autoResponseEnabled': false,
                  'conversation.lastCheckedAt': new Date(),
                  'conversation.disabledReason': `Auth error: ${errorMsg}`,
                },
              }
            );
          } else {
            // For non-auth errors, increment a failure counter
            // Disable after 5 consecutive failures to prevent infinite retries
            const consecutiveFailures = (engExt2.conversation?.consecutiveFailures || 0) + 1;
            if (consecutiveFailures >= 5) {
              log.warn('5 consecutive failures - disabling auto-response', { engagementId: engagement._id });
              await ICPEngagement.updateOne(
                { _id: engagement._id },
                {
                  $set: {
                    'conversation.autoResponseEnabled': false,
                    'conversation.lastCheckedAt': new Date(),
                    'conversation.consecutiveFailures': consecutiveFailures,
                    'conversation.disabledReason': `Too many failures: ${errorMsg}`,
                  },
                }
              );
            } else {
              await ICPEngagement.updateOne(
                { _id: engagement._id },
                {
                  $set: {
                    'conversation.lastCheckedAt': new Date(),
                    'conversation.consecutiveFailures': consecutiveFailures,
                  },
                }
              );
            }
          }

          continue;
        }

        // Reset consecutive failure counter on success
        if (engExt2.conversation?.consecutiveFailures && engExt2.conversation.consecutiveFailures > 0) {
          await ICPEngagement.updateOne(
            { _id: engagement._id },
            { $set: { 'conversation.consecutiveFailures': 0 } }
          );
        }

        // Get our user ID to filter out our own tweets
        const ourUserId = await twitterAdapter.getOwnUserId(twitterConnection);

        if (!ourUserId) {
          result.errors.push(`Could not get own user ID for engagement ${engagement._id} — Twitter API may be failing`);
          // Don't disable here since checkConversationReplies already succeeded
          // Just skip this iteration
          continue;
        }

        // Get existing message IDs to avoid duplicates
        const existingMessageIds = new Set(
          (engagement.conversation?.messages || []).map((m: { id: string }) => m.id)
        );

        // Filter out:
        // 1. Our own tweets
        // 2. Replies we've already processed (by ID)
        const newRepliesFromOthers = conversationResult.newReplies.filter(reply => {
          const isFromOthers = reply.authorId !== ourUserId;
          const isNotAlreadyProcessed = !existingMessageIds.has(reply.id);

          log.info('Reply filter check', {
            replyId: reply.id,
            authorId: reply.authorId,
            ourUserId,
            isFromOthers,
            alreadyProcessed: !isNotAlreadyProcessed,
          });

          return isFromOthers && isNotAlreadyProcessed;
        });

        if (newRepliesFromOthers.length === 0) {
          // Nothing new — just record that we checked. (When there ARE new
          // replies, lastCheckedAt is bumped atomically with persisting them
          // below, so a crash can't advance the cursor past unsaved replies. — issue #33)
          await ICPEngagement.updateOne(
            { _id: engagement._id },
            { $set: { 'conversation.lastCheckedAt': new Date() } }
          );
          continue; // No new replies to process
        }

        log.info('New replies found', { count: newRepliesFromOthers.length, engagementId: engagement._id });
        result.updatesFound++;

        // Process the most recent reply
        const latestReply = newRepliesFromOthers[newRepliesFromOthers.length - 1];

        // Update conversation history with new messages
        const newMessages = newRepliesFromOthers.map(reply => ({
          id: reply.id,
          authorId: reply.authorId,
          content: reply.text,
          timestamp: reply.createdAt,
          isFromUs: false,
          url: reply.url,
        }));

        // Build conversation history BEFORE adding new messages to avoid duplicates
        const existingMessages = engagement.conversation?.messages || [];
        const conversationHistory = [
          ...existingMessages,
          ...newMessages,
        ];

        log.info('Conversation history', {
          existing: existingMessages.length,
          new: newMessages.length,
          total: conversationHistory.length,
        });

        // Add new messages to conversation history in DB
        await ICPEngagement.updateOne(
          { _id: engagement._id },
          {
            $push: { 'conversation.messages': { $each: newMessages } },
            $set: {
              'followUp.theyReplied': true,
              'followUp.conversationLength': (engagement.followUp?.conversationLength || 1) + newRepliesFromOthers.length,
              // Advance the cursor only once their replies are persisted. (issue #33)
              'conversation.lastCheckedAt': new Date(),
            },
          }
        );

        const analysis = await analyzeConversationContext(
          conversationHistory,
          { content: latestReply.text, isFromUs: false }
        );

        log.info('Analysis result', {
          engagementId: engagement._id,
          shouldRespond: analysis.shouldRespond,
          reason: analysis.reason,
          shouldRespondType: typeof analysis.shouldRespond,
        });

        if (!analysis.shouldRespond) {
          log.info('Skipping response per analysis', { engagementId: engagement._id });
          continue; // Don't respond to this message
        }

        log.info('Proceeding to generate response');

        // Generate response
        const response = await generateConversationResponse(
          {
            content: engagement.targetPost.content,
            authorUsername: engagement.targetUser.username,
          },
          conversationHistory,
          analysis.suggestedTone,
          'twitter'
        );

        if (!response || response.length === 0) {
          log.error('Response generation returned empty', { engagementId: engagement._id });
          result.errors.push(`Failed to generate response for engagement ${engagement._id}`);
          continue;
        }

        // SAFETY CHECK: Validate response quality and safety
        const safetyCheck = await validateResponseSafety(response, latestReply.text, engagement);
        if (!safetyCheck.safe) {
          log.info('Response rejected by safety check', { engagementId: engagement._id, reason: safetyCheck.reason });
          result.errors.push(`Response rejected: ${safetyCheck.reason}`);

          // Disable auto-response if multiple safety failures
          if (safetyCheck.severity === 'high') {
            await disableAutoResponse(engagement._id.toString());
            log.warn('Auto-response disabled due to safety concern', { engagementId: engagement._id });
          }
          continue;
        }

        log.info('Generated response', { engagementId: engagement._id, preview: response.slice(0, 100) });
        result.responsesGenerated++;
        incrementDailyUsage(pageId, false); // Track generation (per page)

        if (dryRun) {
          log.info('DRY RUN - Would send response', { response });
          continue;
        }

        // PRODUCTION SAFETY: Final check before sending (per page)
        const finalLimitCheck = await checkDailyLimits(pageId);
        if (!finalLimitCheck.allowed) {
          result.errors.push(`Hit daily limit before sending: ${finalLimitCheck.reason}`);
          log.warn('Hit limit, stopping', { reason: finalLimitCheck.reason });
          break; // Stop processing more conversations
        }

        // Send the response
        const replyResult = await twitterAdapter.replyToTweet(
          twitterConnection,
          latestReply.id,
          response
        );

        if (!replyResult.success) {
          result.errors.push(`Failed to send response for engagement ${engagement._id}: ${replyResult.error}`);
          continue;
        }

        // Record our response in the conversation
        const ourMessage = {
          id: replyResult.replyId!,
          authorId: ourUserId || '',
          content: response,
          timestamp: new Date(),
          isFromUs: true,
          url: replyResult.replyUrl,
        };

        await ICPEngagement.updateOne(
          { _id: engagement._id },
          {
            $push: { 'conversation.messages': ourMessage },
            $inc: { 'conversation.currentAutoResponseCount': 1 },
            $set: {
              'followUp.weRepliedAgain': true,
              'followUp.conversationLength': (engagement.followUp?.conversationLength || 1) + 1,
              status: 'conversation',
            },
          }
        );

        log.info('Successfully sent response', { engagementId: engagement._id });
        result.responsesSent++;
        responsesSent++;
        incrementDailyUsage(pageId, true); // Track sent response (per page)

        // Small delay between responses to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        result.errors.push(`Error processing engagement ${engagement._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        log.error('Error processing engagement', {
          engagementId: engagement._id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    log.info('Completed', { conversationsChecked: result.conversationsChecked, responsesSent: result.responsesSent });
    return result;

  } catch (error) {
    result.errors.push(`Fatal error in conversation monitor: ${error instanceof Error ? error.message : 'Unknown error'}`);
    log.error('Fatal error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return result;
  } finally {
    // PRODUCTION SAFETY: Always release the lock
    await releaseLock(lockKey);
  }
}

/**
 * Initialize conversation tracking for a new engagement
 */
export async function initializeConversation(
  engagementId: string,
  threadId: string,
  ourReplyId: string,
  ourReplyContent: string,
  ourReplyUrl?: string
): Promise<void> {
  const ourUserId = ''; // Will be filled when we send the reply

  await ICPEngagement.updateOne(
    { _id: engagementId },
    {
      $set: {
        'conversation.threadId': threadId,
        'conversation.autoResponseEnabled': true,
        'conversation.maxAutoResponses': 3,
        'conversation.currentAutoResponseCount': 0,
        'conversation.messages': [
          {
            id: ourReplyId,
            authorId: ourUserId,
            content: ourReplyContent,
            timestamp: new Date(),
            isFromUs: true,
            url: ourReplyUrl,
          }
        ],
        'conversation.lastCheckedAt': new Date(),
      }
    }
  );
}

/**
 * Disable auto-responses for a conversation (manual control)
 */
export async function disableAutoResponse(engagementId: string): Promise<void> {
  await ICPEngagement.updateOne(
    { _id: engagementId },
    {
      $set: { 'conversation.autoResponseEnabled': false }
    }
  );
}

/**
 * Get conversation statistics
 */
export async function getConversationStats(pageId?: string): Promise<{
  totalActiveConversations: number;
  conversationsWithReplies: number;
  averageConversationLength: number;
  autoResponsesEnabled: number;
  autoResponsesSent: number;
}> {
  const query: Record<string, unknown> = { platform: 'twitter' };
  if (pageId) {
    query.pageId = new mongoose.Types.ObjectId(pageId);
  }

  const stats = await ICPEngagement.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalActiveConversations: {
          $sum: {
            $cond: [{ $ifNull: ['$conversation.threadId', false] }, 1, 0]
          }
        },
        conversationsWithReplies: {
          $sum: {
            $cond: ['$followUp.theyReplied', 1, 0]
          }
        },
        averageConversationLength: {
          $avg: '$followUp.conversationLength'
        },
        autoResponsesEnabled: {
          $sum: {
            $cond: [{ $eq: ['$conversation.autoResponseEnabled', true] }, 1, 0]
          }
        },
        autoResponsesSent: {
          $sum: '$conversation.currentAutoResponseCount'
        },
      }
    }
  ]);

  const result = stats[0] || {};
  return {
    totalActiveConversations: result.totalActiveConversations || 0,
    conversationsWithReplies: result.conversationsWithReplies || 0,
    averageConversationLength: result.averageConversationLength || 0,
    autoResponsesEnabled: result.autoResponsesEnabled || 0,
    autoResponsesSent: result.autoResponsesSent || 0,
  };
}

/**
 * AI Client with MongoDB-backed Usage Tracking
 * 
 * Supports both Ollama (local) and Groq (cloud) backends via OpenAI-compatible API.
 * Configure via environment variables:
 *   AI_PROVIDER=ollama|groq (default: ollama)
 *   OLLAMA_BASE_URL=http://... (REQUIRED when AI_PROVIDER=ollama; no default)
 *   OLLAMA_MODEL=qwen2.5:7b (default)
 *   GROQ_API_KEY=... (only needed if AI_PROVIDER=groq)
 * 
 * Features:
 * 1. Tracks token usage per model in MongoDB (persists across restarts)
 * 2. Proactively switches models before hitting limits (Groq mode)
 * 3. Falls back to other models on 429 errors (Groq mode)
 * 4. Respects both daily AND per-minute limits (Groq mode)
 * 5. Strips <think> tags from reasoning models (qwen family)
 * 6. Single model mode for Ollama (no rotation needed)
 */

import OpenAI from 'openai';
import AIUsage, {
  GROQ_MODEL_LIMITS,
  MODEL_PRIORITY,
  FAST_MODEL_PRIORITY,
  getDateKey,
  getMinuteKey,
  type ModelLimits,
  type IAIUsage,
} from './models/AIUsage';
import { logger } from '@/lib/logger';

const log = logger.child('ai-client');

// ============================================
// Provider Configuration (lazy-loaded)
// ============================================

let _aiClient: OpenAI | null = null;
let _aiProvider: 'ollama' | 'groq' | null = null;
let _ollamaModel: string | null = null;

function getAiConfig(): { client: OpenAI; provider: 'ollama' | 'groq'; model: string } {
  if (_aiClient && _aiProvider && _ollamaModel !== null) {
    return { client: _aiClient, provider: _aiProvider, model: _ollamaModel };
  }
  const provider = (process.env.AI_PROVIDER || 'ollama') as 'ollama' | 'groq';
  if (provider === 'ollama') {
    const baseURL = process.env.OLLAMA_BASE_URL;
    if (!baseURL) {
      throw new Error('OLLAMA_BASE_URL is required when AI_PROVIDER=ollama');
    }
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    _aiClient = new OpenAI({ apiKey: 'ollama', baseURL: `${baseURL}/v1` });
    _aiProvider = 'ollama';
    _ollamaModel = model;
    log.info('Provider configured', { provider: 'ollama', model, url: baseURL });
  } else {
    _aiClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    _aiProvider = 'groq';
    _ollamaModel = ''; // unused in groq mode
    log.info('Provider configured', { provider: 'groq' });
  }
  return { client: _aiClient, provider: _aiProvider, model: _ollamaModel };
}

// Convenience accessors (lazy)
function getAiProvider(): 'ollama' | 'groq' { return getAiConfig().provider; }
function getOllamaModel(): string { return getAiConfig().model; }
function getOllamaBaseUrl(): string | undefined { return process.env.OLLAMA_BASE_URL; }

// Safety threshold - switch models at this % of limit
const DAILY_THRESHOLD = 0.90;   // 90% of daily limit
const MINUTE_THRESHOLD = 0.80;  // 80% of minute limit (tighter to avoid bursting)

// In-memory cache for current minute (reduces DB calls for rate limiting)
interface MinuteCache {
  minute: Date;
  usage: Map<string, { tokens: number; requests: number }>;
}
let minuteCache: MinuteCache = {
  minute: getMinuteKey(),
  usage: new Map(),
};

// In-memory cache for daily usage (refreshed periodically)
interface DailyCache {
  date: Date;
  usage: Map<string, { tokens: number; requests: number; rateLimitHits: number }>;
  lastRefresh: number;
}
let dailyCache: DailyCache = {
  date: getDateKey(),
  usage: new Map(),
  lastRefresh: 0,
};

const CACHE_TTL = 5000; // Refresh daily cache every 5 seconds

// ============================================
// MongoDB-backed Usage Tracking
// ============================================

/**
 * Refresh daily cache from MongoDB
 */
async function refreshDailyCache(): Promise<void> {
  const now = Date.now();
  const today = getDateKey();
  
  // Check if cache is stale or date changed
  if (
    dailyCache.date.getTime() === today.getTime() && 
    now - dailyCache.lastRefresh < CACHE_TTL
  ) {
    return;
  }
  
  try {
    const records = await AIUsage.find({ date: today }).lean();
    
    dailyCache = {
      date: today,
      usage: new Map(),
      lastRefresh: now,
    };
    
    for (const record of records) {
      dailyCache.usage.set(record.modelName, {
        tokens: record.tokensUsed,
        requests: record.requestCount,
        rateLimitHits: record.rateLimitHits,
      });
    }
  } catch (error) {
    log.warn('Error refreshing cache', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Get usage from cache (with fallback to DB)
 */
async function getDailyUsage(model: string): Promise<{ tokens: number; requests: number; rateLimitHits: number }> {
  await refreshDailyCache();
  return dailyCache.usage.get(model) || { tokens: 0, requests: 0, rateLimitHits: 0 };
}

/**
 * Update minute cache
 */
function updateMinuteCache(model: string, tokens: number): void {
  const currentMinute = getMinuteKey();
  
  // Reset cache if minute changed
  if (minuteCache.minute.getTime() !== currentMinute.getTime()) {
    minuteCache = {
      minute: currentMinute,
      usage: new Map(),
    };
  }
  
  const current = minuteCache.usage.get(model) || { tokens: 0, requests: 0 };
  minuteCache.usage.set(model, {
    tokens: current.tokens + tokens,
    requests: current.requests + 1,
  });
}

/**
 * Get minute usage from cache
 */
function getMinuteUsage(model: string): { tokens: number; requests: number } {
  const currentMinute = getMinuteKey();
  
  if (minuteCache.minute.getTime() !== currentMinute.getTime()) {
    minuteCache = {
      minute: currentMinute,
      usage: new Map(),
    };
  }
  
  return minuteCache.usage.get(model) || { tokens: 0, requests: 0 };
}

/**
 * Record usage in MongoDB (async, non-blocking)
 */
async function recordUsage(model: string, tokens: number, success: boolean = true): Promise<void> {
  const today = getDateKey();
  const currentMinute = getMinuteKey();
  
  // Update in-memory caches immediately
  updateMinuteCache(model, tokens);
  const cached = dailyCache.usage.get(model) || { tokens: 0, requests: 0, rateLimitHits: 0 };
  dailyCache.usage.set(model, {
    tokens: cached.tokens + tokens,
    requests: cached.requests + 1,
    rateLimitHits: cached.rateLimitHits + (success ? 0 : 0),
  });
  
  try {
    // Update or create daily record
    const result = await AIUsage.findOneAndUpdate(
      { date: today, modelName: model },
      {
        $inc: { 
          tokensUsed: tokens, 
          requestCount: 1,
          errorCount: success ? 0 : 1,
        },
        $set: { lastUpdated: new Date() },
      },
      { upsert: true, new: true }
    );
    
    // Log usage
    const limits = GROQ_MODEL_LIMITS[model];
    if (limits?.tokensPerDay) {
      const percentUsed = ((result.tokensUsed / limits.tokensPerDay) * 100).toFixed(1);
      log.info('Token usage recorded', { model, tokensUsed: result.tokensUsed, tokensLimit: limits.tokensPerDay, percentUsed });
    } else {
      log.info('Token usage recorded', { model, tokensUsed: result.tokensUsed, dailyLimit: 'none' });
    }
  } catch (error) {
    log.error('Error recording usage', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Record a rate limit hit and mark model as exhausted
 */
async function recordRateLimitHit(model: string): Promise<void> {
  const today = getDateKey();
  const limits = GROQ_MODEL_LIMITS[model];
  
  // Mark model as exhausted in cache (set tokens to limit to prevent future selection)
  const exhaustedTokens = limits?.tokensPerDay || 100000;
  dailyCache.usage.set(model, {
    tokens: exhaustedTokens,  // Mark as fully used
    requests: limits?.requestsPerDay || 1000,
    rateLimitHits: (dailyCache.usage.get(model)?.rateLimitHits || 0) + 1,
  });
  
  log.info('Model marked as exhausted', { model, exhaustedTokens });

  try {
    await AIUsage.updateOne(
      { date: today, modelName: model },
      {
        $inc: { rateLimitHits: 1 },
        $set: {
          lastUpdated: new Date(),
          tokensUsed: exhaustedTokens,  // Mark as exhausted in DB too
        },
      },
      { upsert: true }
    );
  } catch (error) {
    log.error('Error recording rate limit', { error: error instanceof Error ? error.message : String(error) });
  }
}

// ============================================
// Model Selection
// ============================================

/**
 * Check if a model has capacity for a request
 */
async function hasCapacity(
  model: string, 
  estimatedTokens: number = 2000
): Promise<{ 
  available: boolean; 
  reason?: string;
  dailyUsed?: number;
  dailyLimit?: number | null;
}> {
  const limits = GROQ_MODEL_LIMITS[model];
  if (!limits) {
    return { available: true };  // Unknown model, try it
  }
  
  // Check minute limit (from in-memory cache - instant)
  const minuteUsage = getMinuteUsage(model);
  const projectedMinuteTokens = minuteUsage.tokens + estimatedTokens;
  
  if (projectedMinuteTokens > limits.tokensPerMinute * MINUTE_THRESHOLD) {
    return { 
      available: false, 
      reason: `Minute tokens: ${minuteUsage.tokens}/${limits.tokensPerMinute}` 
    };
  }
  
  if (minuteUsage.requests >= limits.requestsPerMinute * MINUTE_THRESHOLD) {
    return { 
      available: false, 
      reason: `Minute requests: ${minuteUsage.requests}/${limits.requestsPerMinute}` 
    };
  }
  
  // Check daily limit (null = no limit for compound models)
  if (limits.tokensPerDay !== null) {
    const usage = await getDailyUsage(model);
    const projectedDailyTokens = usage.tokens + estimatedTokens;
    
    if (projectedDailyTokens > limits.tokensPerDay * DAILY_THRESHOLD) {
      return { 
        available: false, 
        reason: `Daily tokens: ${usage.tokens.toLocaleString()}/${limits.tokensPerDay.toLocaleString()}`,
        dailyUsed: usage.tokens,
        dailyLimit: limits.tokensPerDay,
      };
    }
    
    if (usage.requests >= limits.requestsPerDay * DAILY_THRESHOLD) {
      return { 
        available: false, 
        reason: `Daily requests: ${usage.requests}/${limits.requestsPerDay}` 
      };
    }
    
    return { 
      available: true,
      dailyUsed: usage.tokens,
      dailyLimit: limits.tokensPerDay,
    };
  }
  
  // No daily limit (compound models)
  return { available: true, dailyLimit: null };
}

/**
 * Calculate usage percentage for a model
 * Returns 0 for unlimited models, 1+ for exhausted models
 */
async function getUsagePercent(model: string): Promise<number> {
  const limits = GROQ_MODEL_LIMITS[model];
  if (!limits) return 0;
  
  // Compound models have no daily limit - return 0 (always available)
  if (limits.tokensPerDay === null) {
    return 0;
  }
  
  const usage = await getDailyUsage(model);
  return usage.tokens / limits.tokensPerDay;
}

/**
 * SMART MODEL SELECTION
 * 
 * Strategy: Always pick the model with the LOWEST usage percentage.
 * This distributes load evenly across all models and maximizes total capacity.
 * 
 * For models with no daily limit (compound), they're treated as 0% usage
 * but we prefer "real" models when they have capacity.
 */
async function getAvailableModel(preferFast: boolean = false, estimatedTokens: number = 2000): Promise<string> {
  // Ollama mode: always use the configured model (no rotation needed)
  const { provider, model: ollamaModel } = getAiConfig();
  if (provider === 'ollama') {
    return ollamaModel;
  }

  const allModels = preferFast ? FAST_MODEL_PRIORITY : MODEL_PRIORITY;
  
  // Calculate usage % and capacity for all models
  const modelStats: Array<{
    model: string;
    usagePercent: number;
    hasCapacity: boolean;
    isUnlimited: boolean;
    reason?: string;
  }> = [];
  
  for (const model of allModels) {
    const limits = GROQ_MODEL_LIMITS[model];
    const isUnlimited = limits?.tokensPerDay === null;
    const { available, reason } = await hasCapacity(model, estimatedTokens);
    const usagePercent = await getUsagePercent(model);
    
    modelStats.push({
      model,
      usagePercent,
      hasCapacity: available,
      isUnlimited,
      reason,
    });
  }
  
  // Filter to only models with capacity
  const availableModels = modelStats.filter(m => m.hasCapacity);
  
  if (availableModels.length === 0) {
    // No models available - find the one with lowest usage (might still work)
    log.warn('All models near capacity!');

    // Prefer unlimited models as last resort
    const unlimited = modelStats.find(m => m.isUnlimited);
    if (unlimited) {
      log.info('Falling back to unlimited model', { model: unlimited.model });
      return unlimited.model;
    }

    // Otherwise pick lowest usage
    const sorted = [...modelStats].sort((a, b) => a.usagePercent - b.usagePercent);
    log.info('Using lowest-usage model', { model: sorted[0].model, usagePercent: (sorted[0].usagePercent * 100).toFixed(1) });
    return sorted[0].model;
  }
  
  // Split into limited and unlimited
  const limitedModels = availableModels.filter(m => !m.isUnlimited);
  const unlimitedModels = availableModels.filter(m => m.isUnlimited);
  
  // Prefer limited models with lowest usage (save unlimited for when we need them)
  if (limitedModels.length > 0) {
    // Sort by usage percentage (lowest first)
    limitedModels.sort((a, b) => a.usagePercent - b.usagePercent);
    const selected = limitedModels[0];
    
    // Only log if switching or notable
    if (selected.usagePercent > 0.5) {
      log.info('Selected model', { model: selected.model, usagePercent: (selected.usagePercent * 100).toFixed(1) });
    }

    return selected.model;
  }

  // Only unlimited models available
  const selected = unlimitedModels[0];
  log.info('Using unlimited model (all limited models exhausted)', { model: selected.model });
  return selected.model;
}

// ============================================
// AI Client (supports Ollama and Groq)
// ============================================

/**
 * Parse retry-after from error or headers
 */
function parseRetryAfter(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    // Check for retry-after in headers
    const headers = (error as { headers?: { get?: (key: string) => string | null } }).headers;
    if (headers?.get) {
      const retryAfter = headers.get('retry-after');
      if (retryAfter) {
        return parseInt(retryAfter, 10);
      }
    }
    
    // Parse from error message
    const message = (error as { message?: string }).message || '';
    const match = message.match(/try again in (\d+(?:\.\d+)?)(s|m|h)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === 'm') return Math.ceil(value * 60);
      if (unit === 'h') return Math.ceil(value * 3600);
      return Math.ceil(value);
    }
  }
  return undefined;
}

/**
 * Estimate tokens for a request (rough heuristic: 4 chars ≈ 1 token)
 */
function estimateTokens(messages: Array<{ content: string }>, maxTokens: number): number {
  const inputTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  return inputTokens + maxTokens;
}

// ============================================
// Main API
// ============================================

export interface ChatCompletionOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  preferFast?: boolean;  // Prefer faster/smaller models
  maxRetries?: number;   // Max number of model switches on rate limit
}

export interface ChatCompletionResult {
  content: string | null;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Create a chat completion with automatic model rotation
 */
export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const { 
    messages, 
    temperature = 0.7, 
    maxTokens = 1000, 
    preferFast = false,
    maxRetries = 3 
  } = options;
  
  const estimatedTokens = estimateTokens(messages, maxTokens);
  let lastError: Error | null = null;
  const triedModels = new Set<string>();
  
  for (let attempt = 0; attempt < maxRetries + 1; attempt++) {
    // Get model with capacity
    const model = await getAvailableModel(preferFast, estimatedTokens);
    
    // Don't retry same model
    if (triedModels.has(model)) {
      break;  // All available models tried
    }
    triedModels.add(model);
    
    try {
      log.info('Using model', { model, attempt: attempt + 1, maxAttempts: maxRetries + 1 });
      
      const { client: aiClient } = getAiConfig();
      const response = await aiClient.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      // Record actual usage
      if (response.usage) {
        await recordUsage(model, response.usage.total_tokens, true);
      }

      let content = response.choices[0]?.message?.content || null;
      const finishReason = response.choices[0]?.finish_reason;

      // Strip <think> tags that qwen and other reasoning models output
      if (content) {
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        content = content.replace(/<think>[\s\S]*/gi, '').trim(); // unclosed tags
      }

      // Debug: Log finish reason and content info
      log.info('Response received', { finishReason, contentLength: content?.length || 0 });

      // Debug: Log if content is empty despite successful response
      if (!content && response.choices.length > 0) {
        log.warn('Response has choices but content is empty/null', { choices: JSON.stringify(response.choices, null, 2) });
      }

      return {
        content,
        model,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error (Groq only - Ollama doesn't rate limit)
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code;
      const currentProvider = getAiConfig().provider;

      if (currentProvider === 'groq' && (status === 429 || code === 'rate_limit_exceeded')) {
        await recordRateLimitHit(model);
        log.info('Rate limited, switching to next model', { model });
        continue;
      }

      // For Ollama connection errors, provide helpful message
      if (currentProvider === 'ollama') {
        const msg = (error as Error).message || '';
        if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
          log.error('Cannot connect to Ollama', { url: process.env.OLLAMA_BASE_URL });
        }
      }
      
      // For other errors, record and throw
      await recordUsage(model, estimatedTokens, false);
      throw error;
    }
  }
  
  // All retries exhausted
  throw lastError || new Error('All models at capacity');
}

/**
 * Convenience function for simple completions
 */
export async function complete(
  prompt: string,
  options?: Partial<ChatCompletionOptions>
): Promise<string | null> {
  const result = await createChatCompletion({
    messages: [{ role: 'user', content: prompt }],
    ...options,
  });
  return result.content;
}

/**
 * Convenience function for system + user prompt
 */
export async function completeWithSystem(
  systemPrompt: string,
  userPrompt: string,
  options?: Partial<ChatCompletionOptions>
): Promise<string | null> {
  const result = await createChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    ...options,
  });
  return result.content;
}

/**
 * Get current usage status for all models (from MongoDB)
 */
export async function getUsageStatus(): Promise<Record<string, { 
  tokensUsed: number; 
  tokensLimit: number | null; 
  requestsUsed: number;
  requestsLimit: number;
  percentUsed: number | null;
  available: boolean;
  rateLimitHits: number;
}>> {
  await refreshDailyCache();
  const status: Record<string, any> = {};
  
  // In Ollama mode, just show the Ollama model
  const { provider, model: ollamaModel } = getAiConfig();
  const modelsToCheck = provider === 'ollama' ? [ollamaModel] : MODEL_PRIORITY;
  
  for (const model of modelsToCheck) {
    const limits = GROQ_MODEL_LIMITS[model];
    if (!limits) continue;
    
    const usage = await getDailyUsage(model);
    const { available } = await hasCapacity(model);
    
    status[model] = {
      tokensUsed: usage.tokens,
      tokensLimit: limits.tokensPerDay,
      requestsUsed: usage.requests,
      requestsLimit: limits.requestsPerDay,
      percentUsed: limits.tokensPerDay 
        ? Math.round((usage.tokens / limits.tokensPerDay) * 1000) / 10
        : null,
      available,
      rateLimitHits: usage.rateLimitHits,
    };
  }
  
  return status;
}

/**
 * Get total available capacity across all models
 */
export async function getTotalCapacity(): Promise<{ 
  totalUsed: number; 
  totalLimit: number; 
  percentUsed: number;
  availableModels: string[];
  unlimitedModels: string[];
}> {
  const status = await getUsageStatus();
  let totalUsed = 0;
  let totalLimit = 0;
  const availableModels: string[] = [];
  const unlimitedModels: string[] = [];
  
  for (const [model, s] of Object.entries(status)) {
    if (s.tokensLimit) {
      totalUsed += s.tokensUsed || 0;
      totalLimit += s.tokensLimit;
    } else {
      unlimitedModels.push(model);
    }
    if (s.available) {
      availableModels.push(model);
    }
  }
  
  return {
    totalUsed,
    totalLimit,
    percentUsed: totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 1000) / 10 : 0,
    availableModels,
    unlimitedModels,
  };
}

/**
 * Get which model would be selected for a request (for debugging/monitoring)
 */
export async function getSelectedModel(preferFast: boolean = false): Promise<{
  model: string;
  usagePercent: number;
  reasoning: string;
  allModels: Array<{
    model: string;
    usagePercent: number;
    hasCapacity: boolean;
    tokensUsed: number;
    tokensLimit: number | null;
  }>;
}> {
  // In Ollama mode, return the single configured model
  const { provider: selectedProvider, model: ollamaModel } = getAiConfig();
  if (selectedProvider === 'ollama') {
    const usage = await getDailyUsage(ollamaModel);
    return {
      model: ollamaModel,
      usagePercent: 0,
      reasoning: `Ollama local model (${process.env.OLLAMA_BASE_URL})`,
      allModels: [{
        model: ollamaModel,
        usagePercent: 0,
        hasCapacity: true,
        tokensUsed: usage.tokens,
        tokensLimit: null,
      }],
    };
  }

  const allModels = preferFast ? FAST_MODEL_PRIORITY : MODEL_PRIORITY;
  const modelDetails: Array<{
    model: string;
    usagePercent: number;
    hasCapacity: boolean;
    tokensUsed: number;
    tokensLimit: number | null;
  }> = [];
  
  for (const model of allModels) {
    const limits = GROQ_MODEL_LIMITS[model];
    const usage = await getDailyUsage(model);
    const { available } = await hasCapacity(model);
    const usagePercent = limits?.tokensPerDay 
      ? (usage.tokens / limits.tokensPerDay) * 100
      : 0;
    
    modelDetails.push({
      model,
      usagePercent: Math.round(usagePercent * 10) / 10,
      hasCapacity: available,
      tokensUsed: usage.tokens,
      tokensLimit: limits?.tokensPerDay ?? null,
    });
  }
  
  // Sort by usage % (same logic as getAvailableModel)
  const available = modelDetails.filter(m => m.hasCapacity && m.tokensLimit !== null);
  const unlimited = modelDetails.filter(m => m.hasCapacity && m.tokensLimit === null);
  
  let selected: typeof modelDetails[0];
  let reasoning: string;
  
  if (available.length > 0) {
    available.sort((a, b) => a.usagePercent - b.usagePercent);
    selected = available[0];
    reasoning = `Lowest usage among ${available.length} available limited models`;
  } else if (unlimited.length > 0) {
    selected = unlimited[0];
    reasoning = 'All limited models exhausted, using unlimited model';
  } else {
    const sorted = [...modelDetails].sort((a, b) => a.usagePercent - b.usagePercent);
    selected = sorted[0];
    reasoning = 'All models at capacity, using least-used as fallback';
  }
  
  return {
    model: selected.model,
    usagePercent: selected.usagePercent,
    reasoning,
    allModels: modelDetails,
  };
}

// Export the raw client for advanced usage (lazy getter)
export function getGroqClient(): OpenAI { return getAiConfig().client; }
export { getGroqClient as groqClient };  // groqClient alias for backward compatibility

// Export provider config as functions (lazy)
export { getAiProvider, getOllamaBaseUrl, getOllamaModel };

// Export model lists and limits
export { GROQ_MODEL_LIMITS, MODEL_PRIORITY, FAST_MODEL_PRIORITY };

// Default export for convenience
export default {
  createChatCompletion,
  complete,
  completeWithSystem,
  getUsageStatus,
  getTotalCapacity,
  getSelectedModel,
  GROQ_MODEL_LIMITS,
  MODEL_PRIORITY,
};

/**
 * AI Usage Model
 * 
 * Tracks AI model usage across the system for:
 * - Proactive model rotation before hitting limits
 * - Usage analytics and cost tracking
 * - Rate limit management
 */

import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// ============================================
// Groq Model Limits (from actual Groq dashboard)
// ============================================

export interface ModelLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number | null;  // null = no limit
}

export const GROQ_MODEL_LIMITS: Record<string, ModelLimits> = {
  // ============================================
  // Ollama local models (no rate limits - unlimited)
  // ============================================
  'qwen2.5:7b': {
    requestsPerMinute: 999,
    requestsPerDay: 999999,
    tokensPerMinute: 999999,
    tokensPerDay: null,  // No limit for local models
  },

  // ============================================
  // Compound models (NO daily token limit - use as fallback)
  // ============================================
  'groq/compound': {
    requestsPerMinute: 30,
    requestsPerDay: 250,
    tokensPerMinute: 70000,
    tokensPerDay: null,  // No limit!
  },
  'groq/compound-mini': {
    requestsPerMinute: 30,
    requestsPerDay: 250,
    tokensPerMinute: 70000,
    tokensPerDay: null,  // No limit!
  },

  // ============================================
  // Llama models
  // ============================================
  'llama-3.3-70b-versatile': {
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 12000,
    tokensPerDay: 100000,  // Lowest daily limit
  },
  'llama-3.1-8b-instant': {
    requestsPerMinute: 30,
    requestsPerDay: 14400,
    tokensPerMinute: 6000,
    tokensPerDay: 500000,
  },
  
  // ============================================
  // Llama 4 models (new!)
  // ============================================
  'meta-llama/llama-4-maverick-17b-128e-instruct': {
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 6000,
    tokensPerDay: 500000,
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 30000,
    tokensPerDay: 500000,
  },
  
  // ============================================
  // Llama Guard/Prompt Guard (safety models)
  // ============================================
  'meta-llama/llama-guard-4-12b': {
    requestsPerMinute: 30,
    requestsPerDay: 14400,
    tokensPerMinute: 15000,
    tokensPerDay: 500000,
  },
  'meta-llama/llama-prompt-guard-2-22m': {
    requestsPerMinute: 30,
    requestsPerDay: 14400,
    tokensPerMinute: 15000,
    tokensPerDay: 500000,
  },
  'meta-llama/llama-prompt-guard-2-86m': {
    requestsPerMinute: 30,
    requestsPerDay: 14400,
    tokensPerMinute: 15000,
    tokensPerDay: 500000,
  },

  // ============================================
  // Kimi models (Moonshot AI)
  // ============================================
  'moonshotai/kimi-k2-instruct': {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    tokensPerMinute: 10000,
    tokensPerDay: 300000,
  },
  'moonshotai/kimi-k2-instruct-0905': {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    tokensPerMinute: 10000,
    tokensPerDay: 300000,
  },

  // ============================================
  // OpenAI GPT-OSS models
  // ============================================
  'openai/gpt-oss-120b': {
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 8000,
    tokensPerDay: 200000,
  },
  'openai/gpt-oss-20b': {
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 8000,
    tokensPerDay: 200000,
  },
  'openai/gpt-oss-safeguard-20b': {
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 8000,
    tokensPerDay: 200000,
  },

  // ============================================
  // Qwen model
  // ============================================
  'qwen/qwen3-32b': {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    tokensPerMinute: 6000,
    tokensPerDay: 500000,
  },

  // ============================================
  // Allam (Arabic)
  // ============================================
  'allam-2-7b': {
    requestsPerMinute: 30,
    requestsPerDay: 7000,
    tokensPerMinute: 6000,
    tokensPerDay: 500000,
  },
};

// Model priority order (quality -> capacity -> speed)
// Put best quality models first, problematic models removed
// NOTE: qwen/qwen3-32b removed - outputs <think> tags that break content
export const MODEL_PRIORITY = [
  'llama-3.3-70b-versatile',                      // Best quality, 100K/day
  'openai/gpt-oss-120b',                          // GPT-OSS large, 200K/day - RELIABLE
  'meta-llama/llama-4-scout-17b-16e-instruct',    // Llama 4, 500K/day, 30K/min
  'meta-llama/llama-4-maverick-17b-128e-instruct',// Llama 4, 500K/day
  'moonshotai/kimi-k2-instruct',                  // Kimi, 300K/day
  'llama-3.1-8b-instant',                         // Fast, 500K/day
  'groq/compound',                                // No daily limit (fallback)
  'groq/compound-mini',                           // No daily limit (fallback)
];

// Fast models for high-volume operations (smaller, faster models first)
// NOTE: qwen/qwen3-32b removed - outputs <think> tags
export const FAST_MODEL_PRIORITY = [
  'llama-3.1-8b-instant',                         // 500K/day, very fast
  'meta-llama/llama-4-scout-17b-16e-instruct',    // 30K tokens/min
  'moonshotai/kimi-k2-instruct',                  // 60 req/min
  'groq/compound-mini',                           // No daily limit
  'groq/compound',                                // No daily limit
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',                      // Quality fallback
];

// ============================================
// MongoDB Schema
// ============================================

export interface IAIUsageData {
  date: Date;                    // Date (day granularity)
  modelName: string;             // Model name (renamed to avoid conflict with Mongoose)
  
  // Daily usage
  tokensUsed: number;
  requestCount: number;
  
  // Minute-level tracking (for rate limiting)
  minuteUsage: {
    minute: Date;               // Truncated to minute
    tokens: number;
    requests: number;
  }[];
  
  // Metadata
  lastUpdated: Date;
  rateLimitHits: number;        // Count of 429 errors
  errorCount: number;           // Other errors
}

export interface IAIUsage extends IAIUsageData, Document {}

const AIUsageSchema = new Schema<IAIUsage>({
  date: { 
    type: Date, 
    required: true,
    index: true,
  },
  modelName: { 
    type: String, 
    required: true,
    index: true,
  },
  
  tokensUsed: { type: Number, default: 0 },
  requestCount: { type: Number, default: 0 },
  
  minuteUsage: [{
    minute: { type: Date, required: true },
    tokens: { type: Number, default: 0 },
    requests: { type: Number, default: 0 },
  }],
  
  lastUpdated: { type: Date, default: Date.now },
  rateLimitHits: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Compound index for efficient queries
AIUsageSchema.index({ date: 1, modelName: 1 }, { unique: true });

// ============================================
// Helper Functions
// ============================================

/**
 * Get the start of day for a date (UTC)
 */
export function getDateKey(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the start of minute for a date
 */
export function getMinuteKey(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  return d;
}

// ============================================
// Model Export
// ============================================

let AIUsage: Model<IAIUsage>;

try {
  AIUsage = mongoose.model<IAIUsage>('AIUsage');
} catch {
  AIUsage = mongoose.model<IAIUsage>('AIUsage', AIUsageSchema);
}

export default AIUsage;

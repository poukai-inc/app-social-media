/**
 * AI Usage API
 * 
 * GET /api/ai/usage - Get current AI model usage stats
 * 
 * Returns usage data for all Groq models including:
 * - Tokens used / limit
 * - Requests used / limit
 * - Availability status
 * - Rate limit hits
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTotalCapacity, getSelectedModel, GROQ_MODEL_LIMITS, MODEL_PRIORITY } from '@/lib/ai-client';
import connectDB from '@/lib/mongodb';
import AIUsage, { getDateKey } from '@/lib/models/AIUsage';
import { logger } from '@/lib/logger';

const log = logger.child('api:ai:usage');

export async function GET(_request: Request) {
  try {
    // Require authentication. This endpoint exposes global AI model usage and
    // cost telemetry (AIUsage rows are keyed by date+model, not per user), so
    // when ADMIN_EMAILS is configured restrict it to those operators. When
    // unset, any authenticated user may read it (dev/default). (review C4)
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.length > 0 && !adminEmails.includes(session.user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();
    
    // getUsageStatus() was called here and its result discarded — removed the
    // wasted read. (issue #48)
    const capacity = await getTotalCapacity();
    const selectedModel = await getSelectedModel();
    
    // Get historical data for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);
    
    const historicalData = await AIUsage.find({
      date: { $gte: sevenDaysAgo },
    })
      .sort({ date: -1, modelName: 1 })
      .lean();
    
    // Group by date
    const byDate: Record<string, Record<string, unknown>> = {};
    for (const record of historicalData) {
      const dateStr = record.date.toISOString().split('T')[0] ?? record.date.toISOString();
      const existingEntry = byDate[dateStr];
      const dateEntry: Record<string, unknown> = existingEntry ?? {};
      byDate[dateStr] = dateEntry;
      dateEntry[record.modelName] = {
        tokensUsed: record.tokensUsed,
        requestCount: record.requestCount,
        rateLimitHits: record.rateLimitHits,
        errorCount: record.errorCount,
      };
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      today: getDateKey().toISOString().split('T')[0],
      
      // Which model would be selected right now
      selectedModel: {
        model: selectedModel.model,
        usagePercent: selectedModel.usagePercent,
        reasoning: selectedModel.reasoning,
      },
      
      // Current status for all models (sorted by usage)
      models: selectedModel.allModels,
      
      // Aggregate stats
      capacity: {
        ...capacity,
        totalModels: MODEL_PRIORITY.length,
      },
      
      // Historical (last 7 days)
      history: byDate,
      
      // Limits reference
      limits: GROQ_MODEL_LIMITS,
    });
  } catch (error) {
    log.error('AI usage API error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch AI usage data',
      },
      { status: 500 }
    );
  }
}

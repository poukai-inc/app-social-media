/**
 * Conversation Monitoring Cron Job
 * 
 * Monitors active Twitter conversations for new replies and automatically 
 * responds when appropriate to maintain engagement quality.
 * 
 * Should be called every 30 minutes to check for conversation updates.
 * 
 * Features:
 * - Monitors existing ICP engagement conversations
 * - Detects when people reply to our tweets
 * - Generates contextual follow-up responses
 * - Maintains conversation history and quality
 * - Prevents spam with smart rate limiting
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { monitorAndRespondToConversations, getConversationStats } from '@/lib/engagement/conversation-manager';
import { logger } from '@/lib/logger';
import { verifyCronSecret } from '@/lib/cron-auth';

const log = logger.child('cron:conversation-monitor');

export async function GET(request: NextRequest) {
  // Verify cron authentication
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const url = new URL(request.url);
  
  // Parse query parameters
  const pageId = url.searchParams.get('pageId'); // Optional: target specific page
  const maxConversations = parseInt(url.searchParams.get('maxConversations') || '50');
  const maxResponses = parseInt(url.searchParams.get('maxResponses') || '10'); 
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const forceCheck = url.searchParams.get('forceCheck') === 'true'; // Skip timing checks

  try {
    await connectToDatabase();

    log.info('Starting conversation monitoring', { pageId: pageId || 'all', maxConversations, maxResponses, dryRun, forceCheck });

    // Run the conversation monitoring
    const result = await monitorAndRespondToConversations(pageId || undefined, {
      maxConversationsToCheck: maxConversations,
      maxResponsesToSend: maxResponses,
      minTimeBetweenChecks: forceCheck ? 0 : 30, // Force check bypasses timing
      dryRun,
      useSmartPolling: !forceCheck, // Disable smart polling when forcing check
    });

    // Get conversation statistics for reporting
    const stats = await getConversationStats(pageId || undefined);

    const duration = Date.now() - startTime;

    log.info('Conversation monitoring completed', { durationMs: duration, conversationsChecked: result.conversationsChecked, responsesSent: result.responsesSent });

    if (result.errors.length > 0) {
      log.warn('Conversation monitoring errors', { count: result.errors.length, errors: result.errors });
    }

    return NextResponse.json({
      success: true,
      summary: {
        conversationsChecked: result.conversationsChecked,
        updatesFound: result.updatesFound,
        responsesGenerated: result.responsesGenerated,
        responsesSent: result.responsesSent,
        errorsCount: result.errors.length,
        durationMs: duration,
        dryRun,
      },
      statistics: stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });

  } catch (error) {
    log.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        summary: {
          conversationsChecked: 0,
          responsesGenerated: 0,
          responsesSent: 0,
          errorsCount: 1,
          durationMs: Date.now() - startTime,
          dryRun,
        },
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
/**
 * ICP Engagement Cron Job
 * 
 * Runs the ICP engagement agent for all pages with:
 * - Active Twitter connections
 * - ICP engagement enabled
 * 
 * Should be called by external cron service (e.g., every 4 hours)
 * 
 * Rate limits:
 * - Twitter Basic: 10 search requests per 15 min
 * - Twitter Pro: Higher limits
 * 
 * Recommended schedule: Every 4-6 hours
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Page from '@/lib/models/Page';
import { runICPEngagementAgent } from '@/lib/engagement/icp-engagement-agent';
import { logger } from '@/lib/logger';

const log = logger.child('cron:icp-engage');

// Verify cron secret
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Allow if no secret configured (dev)

  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  // Verify cron authentication
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: {
    pageId: string;
    pageName: string;
    success: boolean;
    repliesAttempted: number;
    repliesSuccessful: number;
    errors: string[];
  }[] = [];

  try {
    await connectToDatabase();

    // Find all pages with active Twitter connections and ICP engagement enabled
    const pages = await Page.find({
      'connections': {
        $elemMatch: {
          platform: 'twitter',
          isActive: true,
        },
      },
      // Add check for ICP engagement being enabled (you can add this field to Page model)
      // 'settings.icpEngagementEnabled': true,
    }).select('_id name connections contentStrategy');

    log.info('Found pages with Twitter connections', { count: pages.length });

    // Process each page
    for (const [pageIndex, page] of pages.entries()) {
      try {
        log.info('Processing page', { name: page.name, id: page._id });

        // Check if page has content strategy (needed for ICP analysis)
        if (!page.contentStrategy) {
          log.info('Skipping page - no content strategy', { name: page.name });
          results.push({
            pageId: page._id.toString(),
            pageName: page.name,
            success: false,
            repliesAttempted: 0,
            repliesSuccessful: 0,
            errors: ['No content strategy configured'],
          });
          continue;
        }

        // Run the agent with production config (cost-optimized)
        const agentResult = await runICPEngagementAgent(page._id.toString(), {
          maxTweetsPerQuery: 15,
          maxQueriesToRun: 3,       // Increased to find more candidates
          maxRepliesToSend: 2,      // Max 2 replies per run
          minRelevanceScore: 5,     // Lowered threshold to 5/10
          minFollowers: 50,         // Lower follower minimum
          maxFollowers: 500000,     // Increased max to allow larger accounts
          skipVerified: false,      // Allow verified accounts
          dryRun: false,            // Actually send replies
        });

        results.push({
          pageId: page._id.toString(),
          pageName: page.name,
          success: agentResult.success,
          repliesAttempted: agentResult.repliesSent,
          repliesSuccessful: agentResult.repliesSuccessful,
          errors: agentResult.errors,
        });

        // Rate limit between pages
        if (pageIndex < pages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
        }
      } catch (error) {
        log.error('Error processing page', { pageId: page._id, error: error instanceof Error ? error.message : String(error) });
        results.push({
          pageId: page._id.toString(),
          pageName: page.name,
          success: false,
          repliesAttempted: 0,
          repliesSuccessful: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    const duration = Date.now() - startTime;
    const totalSuccessful = results.reduce((sum, r) => sum + r.repliesSuccessful, 0);
    const totalAttempted = results.reduce((sum, r) => sum + r.repliesAttempted, 0);
    const successCount = results.filter(r => r.success).length;

    log.info('Completed', { durationMs: duration, successful: successCount, total: results.length, totalSuccessful, totalAttempted });

    return NextResponse.json({
      success: true,
      summary: {
        pagesProcessed: results.length,
        pagesSuccessful: successCount,
        totalRepliesAttempted: totalAttempted,
        totalRepliesSent: totalSuccessful,
        durationMs: duration,
      },
      results,
    });
  } catch (error) {
    log.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}

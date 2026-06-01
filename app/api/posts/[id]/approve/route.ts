import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import type { ApprovalInfo } from '@/lib/models/Post';
import Page from '@/lib/models/Page';
import User from '@/lib/models/User';
import { getOptimalPostingTime } from '@/lib/learning/platform-learning';
import type { PlatformType } from '@/lib/platforms/types';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:[id]:approve');

/**
 * Get the next occurrence of a specific day and hour
 */
function getNextOccurrence(dayOfWeek: number, hour: number, _timezone?: string): Date {
  const now = new Date();
  const result = new Date(now);
  
  // Set the hour
  result.setHours(hour, 0, 0, 0);
  
  // Calculate days until target day
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  
  if (daysUntil < 0 || (daysUntil === 0 && result <= now)) {
    daysUntil += 7; // Next week
  }
  
  result.setDate(result.getDate() + daysUntil);
  
  return result;
}

/**
 * Calculate optimal scheduled time for a post using AI learning
 */
async function calculateScheduledTime(
  pageId: string,
  platform: PlatformType,
  page: { schedule?: { preferredTimes?: string[]; preferredDays?: number[]; timezone?: string } }
): Promise<Date> {
  const now = new Date();
  
  try {
    // Try to get AI-optimal timing based on past performance
    const optimalTime = await getOptimalPostingTime(
      pageId,
      platform,
      page.schedule?.preferredDays
    );
    
    if (optimalTime && optimalTime.confidence > 0.5) {
      log.info('Using AI-learned optimal time', { platform, day: optimalTime.day, hour: optimalTime.hour });
      return getNextOccurrence(optimalTime.day, optimalTime.hour, page.schedule?.timezone);
    }
  } catch (error) {
    log.warn('Could not get optimal posting time', { error: error instanceof Error ? error.message : String(error) });
  }
  
  // Fall back to preferred times from page settings
  const preferredTimes = page.schedule?.preferredTimes ?? ['09:00'];
  const preferredTime = preferredTimes[Math.floor(Math.random() * preferredTimes.length)] ?? '09:00';
  const timeParts = preferredTime.split(':').map(Number);
  const hours = timeParts[0] ?? 9;
  const minutes = timeParts[1] ?? 0;
  
  const scheduledFor = new Date(now);
  scheduledFor.setHours(hours, minutes, 0, 0);
  
  // If the time has passed today, schedule for tomorrow
  if (scheduledFor <= now) {
    scheduledFor.setDate(scheduledFor.getDate() + 1);
  }
  
  log.info('Using preferred time fallback', { platform, scheduledFor: scheduledFor.toISOString() });
  return scheduledFor;
}

// GET /api/posts/[id]/approve?token=xxx&action=approve|reject
// Handles email approval links
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const action = searchParams.get('action');

    if (!token || !action) {
      return redirectWithMessage('error', 'Missing token or action');
    }

    if (!['approve', 'reject'].includes(action)) {
      return redirectWithMessage('error', 'Invalid action');
    }

    await connectToDatabase();

    const post = await Post.findById(id);
    if (!post) {
      return redirectWithMessage('error', 'Post not found');
    }

    // Verify token
    if (post.approval?.approvalToken !== token) {
      return redirectWithMessage('error', 'Invalid approval token');
    }

    // Check token expiration
    if (post.approval?.tokenExpiresAt && new Date() > post.approval.tokenExpiresAt) {
      return redirectWithMessage('error', 'Approval link has expired');
    }

    // Check if already processed
    if (post.approval?.decision !== 'pending') {
      return redirectWithMessage('info', `This post was already ${post.approval?.decision}`);
    }

    // Process the action
    if (action === 'approve') {
      // Calculate optimal scheduled time using AI learning
      let scheduledFor: Date | undefined;
      
      if (post.pageId) {
        const page = await Page.findById(post.pageId);
        if (page) {
          const platform = post.targetPlatforms?.[0] || 'linkedin';
          scheduledFor = await calculateScheduledTime(
            post.pageId.toString(),
            platform as PlatformType,
            page
          );
        }
      }
      
      // If no page found, schedule for 1 hour from now
      if (!scheduledFor) {
        scheduledFor = new Date();
        scheduledFor.setHours(scheduledFor.getHours() + 1);
      }
      
      post.status = 'scheduled';
      post.scheduledFor = scheduledFor;
      post.approval.decision = 'approved';
      post.approval.decidedAt = new Date();
      post.approval.decidedBy = 'email';
    } else {
      post.status = 'rejected';
      post.approval.decision = 'rejected';
      post.approval.decidedAt = new Date();
      post.approval.decidedBy = 'email';
    }

    // approvalToken and tokenExpiresAt are intentionally cleared here;
    // reassigning the whole subdoc below omits them so Mongoose clears them.

    await post.save();

    return redirectWithMessage(
      'success',
      action === 'approve' ? 'Post approved and scheduled!' : 'Post rejected'
    );
  } catch (error) {
    log.error('Approval error', { error: error instanceof Error ? error.message : String(error) });
    return redirectWithMessage('error', 'Failed to process approval');
  }
}

function redirectWithMessage(type: 'success' | 'error' | 'info', message: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUrl = `${baseUrl}/dashboard/scheduled?${type}=${encodeURIComponent(message)}`;
  return NextResponse.redirect(redirectUrl);
}

// POST /api/posts/[id]/approve - API-based approval (from dashboard)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check — this handler was previously unauthenticated (AUDIT-C1)
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, feedbackNote } = body;

    if (!action || !['approve', 'reject', 'edit'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await connectToDatabase();

    // Resolve user to enforce ownership check below
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const post = await Post.findById(id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Ownership check — prevent IDOR across users
    if (post.userId?.toString() !== user._id.toString()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build the updated approval object, omitting cleared fields so Mongoose unsets them
    const buildApproval = (decision: 'approved' | 'rejected' | 'edited'): ApprovalInfo => ({
      decision,
      decidedAt: new Date(),
      decidedBy: 'dashboard',
      ...(feedbackNote !== undefined && { feedbackNote }),
    });

    if (action === 'approve') {
      // Calculate optimal scheduled time using AI learning
      let scheduledFor: Date | undefined;

      if (post.pageId) {
        const page = await Page.findById(post.pageId);
        if (page) {
          const platform = post.targetPlatforms?.[0] ?? 'linkedin';
          scheduledFor = await calculateScheduledTime(
            post.pageId.toString(),
            platform as PlatformType,
            page
          );
        }
      }

      // If no page found, schedule for 1 hour from now
      if (!scheduledFor) {
        scheduledFor = new Date();
        scheduledFor.setHours(scheduledFor.getHours() + 1);
      }

      post.status = 'scheduled';
      post.scheduledFor = scheduledFor;
      post.approval = buildApproval('approved');
    } else if (action === 'reject') {
      post.status = 'rejected';
      post.approval = buildApproval('rejected');
    } else if (action === 'edit') {
      // Mark as edited, keep in draft for further editing
      post.status = 'draft';
      post.approval = buildApproval('edited');
    }

    await post.save();

    return NextResponse.json({
      success: true,
      post: {
        id: post._id,
        status: post.status,
        scheduledFor: post.scheduledFor,
        approval: post.approval,
      },
    });
  } catch (error) {
    log.error('Approval API error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 });
  }
}

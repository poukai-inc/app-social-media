import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import type { EngagementStatus } from '@/lib/models/Engagement';
import { EngagementTarget, EngagementSettings } from '@/lib/models/Engagement';
import User from '@/lib/models/User';
import { logger } from '@/lib/logger';

const log = logger.child('api:engagements:debug');

// Debug endpoint to check engagement data
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const settings = await EngagementSettings.findOne({ userId: user._id });
    const allEngagements = await EngagementTarget.find({ userId: user._id });

    // Breakdown by status
    const byStatus = {
      pending: allEngagements.filter(e => e.status === 'pending'),
      approved: allEngagements.filter(e => e.status === 'approved'),
      engaged: allEngagements.filter(e => e.status === 'engaged'),
      failed: allEngagements.filter(e => e.status === 'failed'),
      skipped: allEngagements.filter(e => e.status === 'skipped'),
    };

    // What the cron would query
    // safe: values are hard-coded EngagementStatus literals, not user input
    const statusFilter: EngagementStatus[] = settings?.requireApproval ? ['approved'] : ['pending', 'approved'];
    const wouldProcess = await EngagementTarget.find({
      userId: user._id,
      status: { $in: statusFilter },
      $or: [
        { scheduledFor: { $lte: new Date() } },
        { scheduledFor: null },
      ],
    }).limit(10);

    return NextResponse.json({
      userId: user._id.toString(),
      settings: settings ? {
        autoEngageEnabled: settings.autoEngageEnabled,
        autoReplyEnabled: settings.autoReplyEnabled,
        requireApproval: settings.requireApproval,
        dailyEngagementLimit: settings.dailyEngagementLimit,
      } : null,
      counts: {
        total: allEngagements.length,
        pending: byStatus.pending.length,
        approved: byStatus.approved.length,
        engaged: byStatus.engaged.length,
        failed: byStatus.failed.length,
        skipped: byStatus.skipped.length,
      },
      statusFilterUsed: statusFilter,
      wouldProcessCount: wouldProcess.length,
      wouldProcess: wouldProcess.map(e => ({
        id: e._id.toString(),
        status: e.status,
        postUrn: e.postUrn,
        scheduledFor: e.scheduledFor,
        engagementType: e.engagementType,
      })),
      allEngagements: allEngagements.map(e => ({
        id: e._id.toString(),
        status: e.status,
        postUrl: e.postUrl,
        postUrn: e.postUrn,
        scheduledFor: e.scheduledFor,
        error: e.error,
      })),
    });
  } catch (error) {
    log.error('Debug error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import type {
  IEngagementSettings 
} from '@/lib/models/Engagement';
import {
  getOrCreateEngagementSettings
} from '@/lib/models/Engagement';
import { logger } from '@/lib/logger';

const log = logger.child('api:engagements:settings');

// GET /api/engagements/settings - Get engagement settings
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

    const settings = await getOrCreateEngagementSettings(user._id);

    return NextResponse.json({
      settings: {
        autoReplyEnabled: settings.autoReplyEnabled,
        autoEngageEnabled: settings.autoEngageEnabled,
        requireApproval: settings.requireApproval,
        dailyEngagementLimit: settings.dailyEngagementLimit,
        dailyReplyLimit: settings.dailyReplyLimit,
        engagementDelay: settings.engagementDelay,
        engagementStyle: settings.engagementStyle,
      },
    });
  } catch (error) {
    log.error('Error fetching settings', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT /api/engagements/settings - Update engagement settings
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const {
      autoReplyEnabled,
      autoEngageEnabled,
      requireApproval,
      dailyEngagementLimit,
      dailyReplyLimit,
      engagementDelay,
      engagementStyle,
    }: Partial<IEngagementSettings> = body;

    const settings = await getOrCreateEngagementSettings(user._id);

    // Update fields if provided
    if (autoReplyEnabled !== undefined) settings.autoReplyEnabled = autoReplyEnabled;
    if (autoEngageEnabled !== undefined) settings.autoEngageEnabled = autoEngageEnabled;
    if (requireApproval !== undefined) settings.requireApproval = requireApproval;
    if (dailyEngagementLimit !== undefined) settings.dailyEngagementLimit = dailyEngagementLimit;
    if (dailyReplyLimit !== undefined) settings.dailyReplyLimit = dailyReplyLimit;
    if (engagementDelay !== undefined) settings.engagementDelay = engagementDelay;
    if (engagementStyle !== undefined) settings.engagementStyle = engagementStyle;

    await settings.save();

    return NextResponse.json({
      success: true,
      settings: {
        autoReplyEnabled: settings.autoReplyEnabled,
        autoEngageEnabled: settings.autoEngageEnabled,
        requireApproval: settings.requireApproval,
        dailyEngagementLimit: settings.dailyEngagementLimit,
        dailyReplyLimit: settings.dailyReplyLimit,
        engagementDelay: settings.engagementDelay,
        engagementStyle: settings.engagementStyle,
      },
    });
  } catch (error) {
    log.error('Error updating settings', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

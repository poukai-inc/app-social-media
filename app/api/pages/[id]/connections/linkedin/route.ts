import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import type { PlatformConnection } from '@/lib/platforms/types';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:connections:linkedin');

/**
 * POST /api/pages/[id]/connections/linkedin
 * Connect the current user's LinkedIn profile to a page using session credentials
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: pageId } = await params;

    await connectToDatabase();

    // Find the user to get LinkedIn credentials
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has LinkedIn credentials
    if (!user.linkedinAccessToken) {
      return NextResponse.json(
        { error: 'No LinkedIn access token found. Please sign in with LinkedIn first.' },
        { status: 400 }
      );
    }

    // Find the page and verify ownership
    const page = await Page.findOne({
      _id: pageId,
      userId: user._id,
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Create the LinkedIn connection using session credentials
    const connection: PlatformConnection = {
      platform: 'linkedin',
      platformId: user.linkedinId || session.user.id || '',
      platformUsername: session.user.name || 'LinkedIn Profile',
      accessToken: user.linkedinAccessToken,
      refreshToken: undefined, // LinkedIn doesn't use refresh tokens in our current setup
      tokenExpiresAt: user.linkedinAccessTokenExpires,
      isActive: true,
      connectedAt: new Date(),
      metadata: {
        avatarUrl: session.user.image,
        email: session.user.email,
        connectedViaSession: true,
      },
    };

    // Initialize connections array if needed
    page.connections = page.connections || [];
    
    // Check if LinkedIn is already connected
    const existingIndex = page.connections.findIndex(
      (c: PlatformConnection) => c.platform === 'linkedin'
    );

    if (existingIndex >= 0) {
      // Update existing connection
      page.connections[existingIndex] = connection;
    } else {
      // Add new connection
      page.connections.push(connection);
    }

    // Also update legacy fields for backward compatibility
    page.linkedinId = connection.platformId;
    page.type = page.type === 'manual' ? 'personal' : page.type;

    await page.save();

    return NextResponse.json({
      success: true,
      message: 'LinkedIn connected successfully',
      connection: {
        platform: connection.platform,
        platformUsername: connection.platformUsername,
        isActive: connection.isActive,
        connectedAt: connection.connectedAt,
      },
    });
  } catch (error) {
    log.error('LinkedIn connection error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to connect LinkedIn' },
      { status: 500 }
    );
  }
}

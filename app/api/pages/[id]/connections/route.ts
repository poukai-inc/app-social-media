import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Page from '@/lib/models/Page';
import User from '@/lib/models/User';
import type { PlatformType, PlatformConnection } from '@/lib/platforms/types';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:connections');

/**
 * API to manage platform connections for a page
 * POST - Add a new platform connection
 * DELETE - Remove a platform connection
 * PATCH - Update connection settings (enable/disable)
 */

interface AddConnectionRequest {
  platform: PlatformType;
  platformId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateConnectionRequest {
  platform: PlatformType;
  isActive?: boolean;
}

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
    const body: AddConnectionRequest = await request.json();

    await connectToDatabase();

    // Look up user by email to get MongoDB ObjectId
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the page and verify ownership
    const page = await Page.findOne({
      _id: pageId,
      userId: user._id,
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Create the connection object
    const connection: PlatformConnection = {
      platform: body.platform,
      platformId: body.platformId,
      platformUsername: body.platformUsername,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : undefined,
      isActive: true,
      connectedAt: new Date(),
      metadata: body.metadata,
    };

    // Check if connection for this platform already exists
    page.connections = page.connections || [];
    const existingIndex = page.connections.findIndex(
      (c: PlatformConnection) => c.platform === body.platform
    );

    if (existingIndex >= 0) {
      // Update existing connection
      page.connections[existingIndex] = connection;
    } else {
      // Add new connection
      page.connections.push(connection);
    }

    await page.save();

    return NextResponse.json({
      success: true,
      message: `${body.platform} connected successfully`,
      connection: {
        platform: connection.platform,
        platformUsername: connection.platformUsername,
        isActive: connection.isActive,
        connectedAt: connection.connectedAt,
      },
    });
  } catch (error) {
    log.error('Add connection error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to add connection' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: pageId } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as PlatformType;

    if (!platform) {
      return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
    }

    await connectToDatabase();

    // Look up user by email to get MongoDB ObjectId
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the page and verify ownership
    const page = await Page.findOne({
      _id: pageId,
      userId: user._id,
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Remove the connection
    page.connections = (page.connections || []).filter(
      (c: PlatformConnection) => c.platform !== platform
    );

    await page.save();

    return NextResponse.json({
      success: true,
      message: `${platform} disconnected successfully`,
    });
  } catch (error) {
    log.error('Delete connection error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to remove connection' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: pageId } = await params;
    const body: UpdateConnectionRequest = await request.json();

    if (!body.platform) {
      return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
    }

    await connectToDatabase();

    // Look up user by email to get MongoDB ObjectId
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the page and verify ownership
    const page = await Page.findOne({
      _id: pageId,
      userId: user._id,
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Find and update the connection
    const connectionIndex = (page.connections || []).findIndex(
      (c: PlatformConnection) => c.platform === body.platform
    );

    if (connectionIndex < 0) {
      return NextResponse.json(
        { error: `No ${body.platform} connection found` },
        { status: 404 }
      );
    }

    // Update the connection fields
    if (body.isActive !== undefined) {
      page.connections[connectionIndex].isActive = body.isActive;
    }

    await page.save();

    return NextResponse.json({
      success: true,
      message: `${body.platform} connection updated`,
      connection: {
        platform: page.connections[connectionIndex].platform,
        platformUsername: page.connections[connectionIndex].platformUsername,
        isActive: page.connections[connectionIndex].isActive,
      },
    });
  } catch (error) {
    log.error('Update connection error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to update connection' },
      { status: 500 }
    );
  }
}

// GET - Get all connections for a page
export async function GET(
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

    // Find the page and verify ownership
    const page = await Page.findOne({
      _id: pageId,
      userId: session.user.id,
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Return connections without sensitive token data
    const connections = (page.connections || []).map((c: PlatformConnection) => ({
      platform: c.platform,
      platformId: c.platformId,
      platformUsername: c.platformUsername,
      isActive: c.isActive,
      connectedAt: c.connectedAt,
      tokenExpiresAt: c.tokenExpiresAt,
      metadata: c.metadata,
    }));

    return NextResponse.json({ connections });
  } catch (error) {
    log.error('Get connections error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to get connections' },
      { status: 500 }
    );
  }
}

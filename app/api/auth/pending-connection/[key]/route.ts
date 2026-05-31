import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import PendingConnection from '@/lib/models/PendingConnection';
import { logger } from '@/lib/logger';

const log = logger.child('api:auth:pending-connection');

/**
 * GET /api/auth/pending-connection/[key]
 *
 * One-time consume of OAuth connection data stashed during the OAuth callback
 * (BACKLOG #110). Authenticated + scoped to the calling user; the record is
 * deleted on read so the tokens can be fetched exactly once.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
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

    const { key } = await params;

    // Atomic one-time consume, scoped to this user.
    const doc = await PendingConnection.findOneAndDelete({ _id: key, userId: user._id });
    if (!doc || doc.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Connection link expired or invalid' },
        { status: 404 }
      );
    }

    return NextResponse.json({ platform: doc.platform, payload: doc.payload });
  } catch (error) {
    log.error('Pending connection fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

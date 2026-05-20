import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:available');

// GET /api/pages/available - Get available LinkedIn accounts that can be added as pages
export async function GET(request: NextRequest) {
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

    // Get existing pages to know which accounts are already added
    const existingPages = await Page.find({ userId: user._id }).select('linkedinId type').lean();
    const existingLinkedinIds = new Set(existingPages.map((p: { linkedinId?: string }) => p.linkedinId));

    const availableAccounts: {
      id: string;
      type: 'personal' | 'organization';
      name: string;
      avatar?: string;
      vanityName?: string;
      organizationId?: string;
      alreadyAdded: boolean;
    }[] = [];

    // Add personal profile
    if (user.linkedinId) {
      availableAccounts.push({
        id: user.linkedinId,
        type: 'personal',
        name: user.name,
        avatar: user.image,
        alreadyAdded: existingLinkedinIds.has(user.linkedinId),
      });
    }

    // Add organizations
    if (user.linkedinOrganizations && user.linkedinOrganizations.length > 0) {
      for (const org of user.linkedinOrganizations) {
        availableAccounts.push({
          id: org.id,
          type: 'organization',
          name: org.name,
          avatar: org.logoUrl,
          vanityName: org.vanityName,
          organizationId: org.id,
          alreadyAdded: existingLinkedinIds.has(org.id),
        });
      }
    }

    return NextResponse.json({
      accounts: availableAccounts,
      summary: {
        total: availableAccounts.length,
        added: availableAccounts.filter(a => a.alreadyAdded).length,
        available: availableAccounts.filter(a => !a.alreadyAdded).length,
      },
    });
  } catch (error) {
    log.error('Available accounts fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch available accounts' }, { status: 500 });
  }
}

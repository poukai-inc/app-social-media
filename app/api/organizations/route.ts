import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import type { LinkedInOrganization } from '@/lib/models/User';
import User from '@/lib/models/User';
import { logger } from '@/lib/logger';

const log = logger.child('api:organizations');

interface LinkedInOrgElement {
  organization: string;
  role: string;
  state: string;
}

interface LinkedInOrgDetails {
  id: number;
  localizedName: string;
  vanityName?: string;
  logoV2?: {
    original?: string;
  };
}

// GET /api/organizations - Fetch user's LinkedIn organizations
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

    // Return cached organizations if available
    if (user.linkedinOrganizations && user.linkedinOrganizations.length > 0) {
      return NextResponse.json({
        organizations: user.linkedinOrganizations,
        defaultPostAs: user.defaultPostAs || 'person',
        defaultOrganizationId: user.defaultOrganizationId,
      });
    }

    return NextResponse.json({
      organizations: [],
      defaultPostAs: user.defaultPostAs || 'person',
      defaultOrganizationId: user.defaultOrganizationId,
    });
  } catch (error) {
    log.error('Error fetching organizations', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}

// POST /api/organizations - Refresh organizations from LinkedIn
export async function POST() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    
    const user = await User.findOne({ email: session.user.email });
    
    if (!user || !user.linkedinAccessToken) {
      return NextResponse.json({ error: 'LinkedIn not connected' }, { status: 400 });
    }

    // Check if token is expired
    if (user.linkedinAccessTokenExpires && new Date() > user.linkedinAccessTokenExpires) {
      return NextResponse.json({ error: 'LinkedIn access token expired. Please reconnect.' }, { status: 401 });
    }

    // Fetch organizations where user is an admin
    const orgsResponse = await fetch(
      'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization,role,state))',
      {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!orgsResponse.ok) {
      const errorText = await orgsResponse.text();
      log.error('LinkedIn organizations fetch error', { error: errorText });
      
      // If permission denied, return empty list without error
      if (orgsResponse.status === 403) {
        return NextResponse.json({
          organizations: [],
          message: 'No organization admin access. You can still post as yourself.',
        });
      }
      
      return NextResponse.json({ error: 'Failed to fetch organizations from LinkedIn' }, { status: 500 });
    }

    const orgsData = await orgsResponse.json();
    const orgElements: LinkedInOrgElement[] = orgsData.elements || [];

    // Fetch details for each organization
    const organizations: LinkedInOrganization[] = [];
    
    for (const element of orgElements) {
      if (element.state !== 'APPROVED') continue;
      
      // Extract organization ID from URN (urn:li:organization:12345)
      const orgId = element.organization.split(':').pop();
      if (!orgId) continue;

      try {
        const orgDetailsResponse = await fetch(
          `https://api.linkedin.com/v2/organizations/${orgId}?projection=(id,localizedName,vanityName,logoV2)`,
          {
            headers: {
              'Authorization': `Bearer ${user.linkedinAccessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          }
        );

        if (orgDetailsResponse.ok) {
          const orgDetails: LinkedInOrgDetails = await orgDetailsResponse.json();
          organizations.push({
            id: orgId,
            name: orgDetails.localizedName,
            ...(orgDetails.vanityName !== undefined && { vanityName: orgDetails.vanityName }),
            ...(orgDetails.logoV2?.original !== undefined && { logoUrl: orgDetails.logoV2.original }),
            role: element.role,
          });
        }
      } catch (err) {
        log.error('Failed to fetch details for org', { orgId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Update user with organizations
    await User.findByIdAndUpdate(user._id, {
      linkedinOrganizations: organizations,
    });

    return NextResponse.json({
      organizations,
      defaultPostAs: user.defaultPostAs || 'person',
      defaultOrganizationId: user.defaultOrganizationId,
    });
  } catch (error) {
    log.error('Error refreshing organizations', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to refresh organizations' },
      { status: 500 }
    );
  }
}

// PUT /api/organizations - Update default posting preferences
export async function PUT(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { defaultPostAs, defaultOrganizationId } = body;

    if (defaultPostAs && !['person', 'organization'].includes(defaultPostAs)) {
      return NextResponse.json({ error: 'Invalid defaultPostAs value' }, { status: 400 });
    }

    await connectToDatabase();
    
    const updateData: Record<string, unknown> = {};
    if (defaultPostAs !== undefined) updateData.defaultPostAs = defaultPostAs;
    if (defaultOrganizationId !== undefined) updateData.defaultOrganizationId = defaultOrganizationId;

    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      updateData,
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      defaultPostAs: user.defaultPostAs,
      defaultOrganizationId: user.defaultOrganizationId,
    });
  } catch (error) {
    log.error('Error updating preferences', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

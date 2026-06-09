import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { signState } from '@/lib/oauth-state';

const log = logger.child('api:auth:linkedin:connect');

/**
 * LinkedIn "connect" flow - Step 1 (ADR-0008): redirect to LinkedIn to capture
 * the posting token, decoupled from login. Mirrors the Twitter connect flow.
 */

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CONNECT_REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/auth/linkedin/connect/callback`;

// Scopes needed to identify the member and post on their behalf.
const LINKEDIN_SCOPES = 'openid profile email w_member_social';

export async function GET() {
  try {
    // Verify the user is authenticated (identity established via pouk/LinkedIn login).
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // HMAC-signed state to bind the callback to this user (AUDIT-H2).
    const state = signState({
      email: session.user.email,
      timestamp: Date.now(),
    });

    // Build LinkedIn authorize URL.
    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', LINKEDIN_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', LINKEDIN_CONNECT_REDIRECT_URI);
    authUrl.searchParams.set('scope', LINKEDIN_SCOPES);
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    log.error('LinkedIn connect init error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to initialize LinkedIn connect' },
      { status: 500 }
    );
  }
}

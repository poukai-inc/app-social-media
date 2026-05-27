import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { signState } from '@/lib/oauth-state';

const log = logger.child('api:auth:facebook');

/**
 * Facebook OAuth - Step 1: Redirect to Facebook for authorization
 * This is used for connecting Facebook Pages to existing user accounts
 */

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 
  `${process.env.NEXTAUTH_URL}/api/auth/facebook/callback`;

// Required permissions for posting to Pages
// Note: These require Facebook App Review for production use
// For development, make sure your account is an Admin/Developer of the Facebook App
// AND you must add these permissions in: Use cases → Customize → Add permissions
const FACEBOOK_SCOPES = [
  'public_profile',           // Basic profile info (always available)
  'pages_show_list',          // List user's pages
  'pages_manage_posts',       // Create and manage posts
  'pages_read_engagement',    // Read engagement data
  'pages_read_user_content',  // Read user content on pages
  'business_management',      // Access Business Manager assets
].join(',');

export async function GET(request: Request) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get optional pageId to associate with after OAuth
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    // HMAC-signed state to prevent forgery (backlog #111 / AUDIT-H2)
    const state = signState({
      pageId,
      email: session.user.email,
      timestamp: Date.now(),
    });

    // Build Facebook OAuth URL
    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    authUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
    authUrl.searchParams.set('scope', FACEBOOK_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    log.error('Facebook OAuth init error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to initialize Facebook OAuth' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

const log = logger.child('api:auth:twitter');

/**
 * Twitter OAuth 2.0 - Step 1: Redirect to Twitter for authorization
 * Uses OAuth 2.0 with PKCE for enhanced security
 */

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI || 
  `${process.env.NEXTAUTH_URL}/api/auth/twitter/callback`;

// X (Twitter) OAuth 2.0 scopes for posting
// See: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code#scopes
const TWITTER_SCOPES = [
  'tweet.read',      // Read tweets
  'tweet.write',     // Create and delete tweets
  'users.read',      // Read user profile info
  'media.write',     // Upload media (images, videos)
  'offline.access',  // Get refresh tokens for long-lived access
].join(' ');

// Generate PKCE code verifier and challenge
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

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

    // Generate PKCE
    const { verifier, challenge } = generatePKCE();

    // Generate state parameter for security and to pass pageId + verifier
    const state = Buffer.from(JSON.stringify({
      pageId,
      email: session.user.email,
      codeVerifier: verifier,
      timestamp: Date.now(),
    })).toString('base64');

    // Build X (Twitter) OAuth URL
    const authUrl = new URL('https://x.com/i/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', TWITTER_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', TWITTER_REDIRECT_URI);
    authUrl.searchParams.set('scope', TWITTER_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    log.error('Twitter OAuth init error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to initialize Twitter OAuth' },
      { status: 500 }
    );
  }
}

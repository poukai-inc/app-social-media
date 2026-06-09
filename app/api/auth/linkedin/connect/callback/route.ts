import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import { logger } from '@/lib/logger';
import { verifyState } from '@/lib/oauth-state';

const log = logger.child('api:auth:linkedin:connect:callback');

/**
 * LinkedIn "connect" flow - Step 2 (ADR-0008): exchange the code for a posting
 * token and store it on the current user's record. Writes the exact fields
 * lib/linkedin.ts reads (linkedinId / linkedinAccessToken /
 * linkedinAccessTokenExpires) — do NOT rename them.
 */

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
const LINKEDIN_CONNECT_REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/auth/linkedin/connect/callback`;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors returned by LinkedIn.
    if (error) {
      log.error('LinkedIn connect OAuth error', { error, errorDescription });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=missing_code`
      );
    }

    // Verify HMAC-signed state (AUDIT-H2).
    const state = verifyState<{ email: string; timestamp: number }>(stateParam);
    if (!state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=invalid_state`
      );
    }

    // Verify state is recent (within 10 minutes).
    if (Date.now() - state.timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=state_expired`
      );
    }

    // Require an authenticated session that matches the state's email.
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/login?error=unauthorized`
      );
    }
    if (session.user.email !== state.email) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=state_mismatch`
      );
    }

    // Exchange the authorization code for an access token.
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINKEDIN_CONNECT_REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      log.error('LinkedIn connect token error', {
        error: tokenData.error,
        errorDescription: tokenData.error_description,
      });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`
      );
    }

    const accessToken = tokenData.access_token as string | undefined;
    const expiresIn = (tokenData.expires_in as number | undefined) || 5184000; // Default 60 days.

    if (!accessToken) {
      log.error('LinkedIn connect missing access token', { tokenData });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=token_exchange_failed`
      );
    }

    // Fetch the LinkedIn member id (`sub`) via userinfo.
    const userInfoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const userInfo = await userInfoResponse.json();
    const sub = userInfo.sub as string | undefined;

    if (!sub) {
      log.error('LinkedIn connect missing sub', { userInfo });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=failed_to_get_user`
      );
    }

    await connectToDatabase();

    const updated = await User.findOneAndUpdate(
      { email: state.email },
      {
        linkedinId: sub,
        linkedinAccessToken: accessToken,
        linkedinAccessTokenExpires: new Date(Date.now() + expiresIn * 1000),
      }
    );

    if (!updated) {
      log.error('LinkedIn connect user not found', { email: state.email });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=user_not_found`
      );
    }

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?success=linkedin_connected`
    );
  } catch (error) {
    log.error('LinkedIn connect callback error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?error=callback_failed`
    );
  }
}

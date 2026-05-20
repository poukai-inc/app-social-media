import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Page from '@/lib/models/Page';
import User from '@/lib/models/User';
import type { PlatformConnection } from '@/lib/platforms/types';
import { logger } from '@/lib/logger';

const log = logger.child('api:auth:twitter:callback');

/**
 * Twitter OAuth 2.0 - Step 2: Handle callback and exchange code for tokens
 */

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI || 
  `${process.env.NEXTAUTH_URL}/api/auth/twitter/callback`;

export async function GET(request: Request) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/login?error=unauthorized`);
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      log.error('Twitter OAuth error', { error, errorDescription });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=missing_code`
      );
    }

    // Decode and validate state
    let state: { pageId?: string; email: string; codeVerifier: string; timestamp: number };
    try {
      state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=invalid_state`
      );
    }

    // Verify state is recent (within 10 minutes)
    if (Date.now() - state.timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=state_expired`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: TWITTER_REDIRECT_URI,
        code_verifier: state.codeVerifier,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      log.error('Twitter token error', { tokenData });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200; // Default 2 hours

    // Get user info from X (Twitter)
    const userResponse = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url,username,name', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const userData = await userResponse.json();

    if (userData.errors) {
      log.error('Twitter user fetch error', { errors: userData.errors });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=failed_to_get_user`
      );
    }

    const twitterUser = userData.data;

    await connectToDatabase();

    // Look up user by email to get MongoDB ObjectId
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      log.error('User not found', { email: session.user.email });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=user_not_found`
      );
    }

    // If a specific pageId was provided, add Twitter connection to that page
    if (state.pageId) {
      const page = await Page.findOne({
        _id: state.pageId,
        userId: user._id,
      });

      if (page) {
        const connection: PlatformConnection = {
          platform: 'twitter',
          platformId: twitterUser.id,
          platformUsername: `@${twitterUser.username}`,
          accessToken,
          refreshToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          isActive: true,
          connectedAt: new Date(),
          metadata: {
            name: twitterUser.name,
            username: twitterUser.username,
            profileImageUrl: twitterUser.profile_image_url,
          },
        };

        // Add or update Twitter connection
        const existingConnIndex = page.connections?.findIndex(
          (c: PlatformConnection) => c.platform === 'twitter'
        );

        if (existingConnIndex >= 0) {
          page.connections[existingConnIndex] = connection;
        } else {
          page.connections = page.connections || [];
          page.connections.push(connection);
        }

        await page.save();

        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/dashboard/pages/${state.pageId}?success=twitter_connected`
        );
      }
    }

    // No page specified - redirect to selection page
    const connectionData = Buffer.from(JSON.stringify({
      platform: 'twitter',
      platformId: twitterUser.id,
      platformUsername: `@${twitterUser.username}`,
      accessToken,
      refreshToken,
      expiresIn,
      metadata: {
        name: twitterUser.name,
        username: twitterUser.username,
        profileImageUrl: twitterUser.profile_image_url,
      },
    })).toString('base64');

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/connect/twitter?data=${connectionData}`
    );
  } catch (error) {
    log.error('Twitter OAuth callback error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?error=callback_failed`
    );
  }
}

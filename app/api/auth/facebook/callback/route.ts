import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import Page from '@/lib/models/Page';
import User from '@/lib/models/User';
import type { PlatformConnection } from '@/lib/platforms/types';
import { logger } from '@/lib/logger';

const log = logger.child('api:auth:facebook:callback');

/**
 * Facebook OAuth - Step 2: Handle callback and exchange code for tokens
 */

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 
  `${process.env.NEXTAUTH_URL}/api/auth/facebook/callback`;
const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

interface FacebookPagesResponse {
  data: FacebookPage[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

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
      log.error('Facebook OAuth error', { error, errorDescription });
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
    let state: { pageId?: string; email: string; timestamp: number };
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

    // Exchange code for user access token
    const tokenUrl = new URL(`${FACEBOOK_GRAPH_API}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      log.error('Facebook token error', { error: tokenData.error });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=${encodeURIComponent(tokenData.error.message)}`
      );
    }

    const shortLivedToken = tokenData.access_token;

    // Exchange for long-lived token (60+ days)
    const longLivedUrl = new URL(`${FACEBOOK_GRAPH_API}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    longLivedUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      log.error('Facebook long-lived token error', { error: longLivedData.error });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=${encodeURIComponent(longLivedData.error.message)}`
      );
    }

    const userAccessToken = longLivedData.access_token;
    const tokenExpiresIn = longLivedData.expires_in || 5184000; // Default 60 days

    // Debug: Check what permissions were actually granted
    const debugUrl = new URL(`${FACEBOOK_GRAPH_API}/me/permissions`);
    debugUrl.searchParams.set('access_token', userAccessToken);
    const debugResponse = await fetch(debugUrl.toString());
    const debugData = await debugResponse.json();
    log.info('Granted permissions', { permissions: debugData });

    // Get ALL user's Facebook Pages (with pagination)
    const allPages: FacebookPage[] = [];
    let nextUrl: string | null = `${FACEBOOK_GRAPH_API}/me/accounts?access_token=${encodeURIComponent(userAccessToken)}&fields=id,name,access_token,category,picture&limit=100`;
    
    log.info('Fetching Facebook pages (with pagination)');
    
    while (nextUrl) {
      const pagesResponse = await fetch(nextUrl);
      const pagesData: FacebookPagesResponse = await pagesResponse.json();
      
      if (pagesData.data) {
        allPages.push(...pagesData.data);
      }
      
      // Check for more pages
      nextUrl = pagesData.paging?.next || null;
      
      // Safety limit to prevent infinite loops
      if (allPages.length > 500) {
        log.warn('Hit page limit, stopping pagination');
        break;
      }
    }
    
    log.info('Found Facebook pages total', { count: allPages.length });

    if (allPages.length === 0) {
      log.error('No Facebook pages found after pagination');
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=no_pages_found`
      );
    }

    // Store the pages data in a temporary way so user can select which pages to connect
    // For now, we'll redirect to a page selection UI with the data
    
    await connectToDatabase();
    
    // Look up the user by email to get the MongoDB ObjectId
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      log.error('User not found', { email: session.user.email });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard?error=user_not_found`
      );
    }

    // If a specific pageId was provided, add Facebook connection to that page
    if (state.pageId) {
      const page = await Page.findOne({
        _id: state.pageId,
        userId: user._id,
      });

      if (page) {
        // If there's only one Facebook page, connect it automatically
        if (allPages.length === 1) {
          const fbPage = allPages[0];
          const connection: PlatformConnection = {
            platform: 'facebook',
            platformId: fbPage.id,
            platformUsername: fbPage.name,
            accessToken: fbPage.access_token,
            tokenExpiresAt: new Date(Date.now() + tokenExpiresIn * 1000),
            isActive: true,
            connectedAt: new Date(),
            metadata: {
              category: fbPage.category,
              pictureUrl: fbPage.picture?.data?.url,
            },
          };

          // Add or update Facebook connection
          const existingConnIndex = page.connections?.findIndex(
            (c: PlatformConnection) => c.platform === 'facebook'
          );

          if (existingConnIndex >= 0) {
            page.connections[existingConnIndex] = connection;
          } else {
            page.connections = page.connections || [];
            page.connections.push(connection);
          }

          await page.save();

          return NextResponse.redirect(
            `${process.env.NEXTAUTH_URL}/dashboard?success=facebook_connected&page=${page.name}`
          );
        }
      }
    }

    // Multiple Facebook pages found or no specific page - redirect to selection
    // Store pages data in URL-safe format for selection UI
    const pagesInfo = allPages.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      picture: p.picture?.data?.url,
      token: p.access_token,
    }));

    // For security, we'll encode this and pass to a selection page
    const encodedPages = Buffer.from(JSON.stringify({
      pages: pagesInfo,
      userToken: userAccessToken,
      expiresIn: tokenExpiresIn,
      targetPageId: state.pageId,
    })).toString('base64');

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/connect/facebook?data=${encodedPages}`
    );
  } catch (error) {
    log.error('Facebook OAuth callback error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard?error=callback_failed`
    );
  }
}

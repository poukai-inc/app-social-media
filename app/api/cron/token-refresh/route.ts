/**
 * Token Refresh Cron
 * 
 * Runs hourly to:
 * 1. Check all platform connections for tokens expiring within 24 hours
 * 2. Attempt to refresh tokens automatically
 * 3. Send email to user if refresh fails (only once per 24 hours per platform)
 * 
 * Called by scheduler or external cron with: GET /api/cron/token-refresh (Authorization: Bearer CRON_SECRET)
 */

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import type { IPlatformConnection } from '@/lib/models/Page';
import Page from '@/lib/models/Page';
import TokenAlert from '@/lib/models/TokenAlert';
import { sendEmail } from '@/lib/email';
import { cronAuthError } from '@/lib/cron-auth';
import { twitterAdapter } from '@/lib/platforms/twitter-adapter';
import { facebookAdapter } from '@/lib/platforms/facebook-adapter';
import { logger } from '@/lib/logger';

const log = logger.child('cron:token-refresh');
// import { linkedinAdapter } from '@/lib/platforms/linkedin-adapter';

// Warning thresholds
const TOKEN_WARNING_HOURS = 24;      // Warn when token expires in less than 24 hours
const TOKEN_CRITICAL_HOURS = 6;      // Critical when less than 6 hours
const EMAIL_COOLDOWN_HOURS = 24;     // Don't send duplicate emails within this period

// Platform-specific warning thresholds — avoids over-refreshing short-lived tokens
const PLATFORM_WARNING_HOURS: Record<string, number> = {
  twitter: 1,       // Twitter tokens last ~2h, refresh only when < 1h left
  facebook: 24,     // Facebook long-lived tokens last 60 days
  linkedin: 24,     // LinkedIn tokens last 60 days
};

interface TokenCheckResult {
  pageId: string;
  pageName: string;
  platform: string;
  platformUsername?: string;
  status: 'ok' | 'refreshed' | 'refresh_failed' | 'no_expiry' | 'no_refresh_token' | 'already_alerted';
  expiresAt?: Date;
  hoursUntilExpiry?: number;
  error?: string;
  emailSent?: boolean;
}

/**
 * Check if a token is expiring soon
 */
function isTokenExpiringSoon(expiresAt: Date | undefined, thresholdHours: number): boolean {
  if (!expiresAt) return false;
  const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilExpiry < thresholdHours && hoursUntilExpiry > 0;
}

/**
 * Check if token is already expired
 */
function isTokenExpired(expiresAt: Date | undefined): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

/**
 * Get hours until expiry
 */
function getHoursUntilExpiry(expiresAt: Date | undefined): number | undefined {
  if (!expiresAt) return undefined;
  return Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60) * 10) / 10;
}

/**
 * Attempt to refresh a platform token
 */
async function refreshPlatformToken(
  connection: IPlatformConnection
): Promise<{ success: boolean; newToken?: { accessToken: string; refreshToken?: string; expiresAt?: Date }; error?: string }> {
  try {
    let result;
    
    switch (connection.platform) {
      case 'twitter':
        result = await twitterAdapter.refreshToken(connection);
        break;
      case 'facebook':
        result = await facebookAdapter.refreshToken(connection);
        break;
      case 'linkedin':
        // LinkedIn doesn't support refresh tokens with the standard OAuth flow
        // Users need to re-authenticate
        return { 
          success: false, 
          error: 'LinkedIn tokens cannot be refreshed. User must re-authenticate.' 
        };
      default:
        return { success: false, error: `Unknown platform: ${connection.platform}` };
    }
    
    return { success: true, newToken: result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during token refresh'
    };
  }
}

/**
 * Send token expiry warning email
 */
async function sendTokenExpiryEmail(
  userEmail: string,
  pageName: string,
  platform: string,
  platformUsername: string | undefined,
  hoursUntilExpiry: number | undefined,
  isExpired: boolean
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const reconnectUrl = `${baseUrl}/dashboard/connect/${platform}`;
  
  const urgencyColor = isExpired ? '#dc2626' : hoursUntilExpiry && hoursUntilExpiry < TOKEN_CRITICAL_HOURS ? '#f59e0b' : '#3b82f6';
  const urgencyText = isExpired 
    ? 'has expired' 
    : `will expire in ${hoursUntilExpiry?.toFixed(1)} hours`;
  
  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  const displayName = platformUsername ? `@${platformUsername}` : platformName;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Required: Reconnect ${platformName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: ${urgencyColor}; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">⚠️ Action Required</h1>
    <p style="margin: 8px 0 0; opacity: 0.9;">Your ${platformName} connection ${urgencyText}</p>
  </div>
  
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
    
    <div style="background: #fef3c7; border-left: 4px solid ${urgencyColor}; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e;">
        <strong>Page:</strong> ${pageName}<br>
        <strong>Platform:</strong> ${platformName} (${displayName})<br>
        <strong>Status:</strong> ${isExpired ? 'Expired' : `Expires in ${hoursUntilExpiry?.toFixed(1)} hours`}
      </p>
    </div>
    
    <p style="margin-bottom: 24px;">
      We tried to automatically refresh your ${platformName} access token but were unable to do so. 
      To continue posting to ${displayName}, please reconnect your account.
    </p>
    
    <p style="margin-bottom: 24px;">
      <strong>What happens if you don't reconnect?</strong><br>
      Scheduled posts to ${platformName} will fail to publish, and auto-engagement features won't work.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${reconnectUrl}" 
         style="display: inline-block; background: ${urgencyColor}; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        🔗 Reconnect ${platformName}
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    
    <p style="font-size: 12px; color: #6b7280; text-align: center;">
      This is an automated message from AutoPost.<br>
      <a href="${baseUrl}/dashboard" style="color: #3b82f6;">Go to Dashboard</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
Action Required: Reconnect ${platformName}

Your ${platformName} connection for "${pageName}" ${urgencyText}.

We tried to automatically refresh your access token but were unable to do so.

To continue posting to ${displayName}, please reconnect your account:
${reconnectUrl}

What happens if you don't reconnect?
Scheduled posts to ${platformName} will fail to publish, and auto-engagement features won't work.
`;

  return sendEmail({
    to: userEmail,
    subject: `⚠️ Action Required: Reconnect ${platformName} for ${pageName}`,
    html,
    text,
  });
}

export async function GET(request: Request) {
  try {
    // Verify cron secret (fail closed if CRON_SECRET unset)
    const cronError = cronAuthError(request);
    if (cronError) {
      return NextResponse.json(
        { error: cronError === 'misconfigured' ? 'CRON_SECRET not configured' : 'Unauthorized' },
        { status: cronError === 'misconfigured' ? 500 : 401 },
      );
    }

    await connectToDatabase();
    
    log.info('Starting token check');
    
    // Find all active pages with platform connections
    const pages = await Page.find({
      isActive: true,
      'connections.0': { $exists: true }, // Has at least one connection
    })
      .populate('userId', 'email name')
      .lean();
    
    const results: TokenCheckResult[] = [];
    const emailsSent: string[] = [];
    let tokensRefreshed = 0;
    let refreshFailed = 0;
    
    for (const page of pages) {
      const user = page.userId as unknown as { _id: string; email: string; name: string };
      
      if (!user?.email) {
        log.warn('Page has no user with email', { pageId: page._id });
        continue;
      }
      
      // TokenAlert only tracks these three platforms; instagram is not tracked here
      type TokenAlertPlatform = 'linkedin' | 'facebook' | 'twitter';
      const TOKEN_ALERT_PLATFORMS: ReadonlyArray<TokenAlertPlatform> = ['linkedin', 'facebook', 'twitter'];

      for (const connection of page.connections) {
        if (!connection.isActive) continue;

        // Narrow platform to TokenAlertPlatform; skip platforms not tracked by TokenAlert (e.g. instagram)
        if (!TOKEN_ALERT_PLATFORMS.includes(connection.platform as TokenAlertPlatform)) continue;
        const narrowedPlatform = connection.platform as TokenAlertPlatform;

        const hoursUntilExpiry = getHoursUntilExpiry(connection.tokenExpiresAt);
        const result: TokenCheckResult = {
          pageId: page._id.toString(),
          pageName: page.name,
          platform: connection.platform,
          ...(connection.platformUsername !== undefined && { platformUsername: connection.platformUsername }),
          status: 'ok',
          ...(connection.tokenExpiresAt !== undefined && { expiresAt: connection.tokenExpiresAt }),
          ...(hoursUntilExpiry !== undefined && { hoursUntilExpiry }),
        };
        
        // Check if token has no expiry info (some tokens don't expire)
        if (!connection.tokenExpiresAt) {
          result.status = 'no_expiry';
          results.push(result);
          continue;
        }
        
        const isExpired = isTokenExpired(connection.tokenExpiresAt);
        const platformWarningHours = PLATFORM_WARNING_HOURS[connection.platform] ?? TOKEN_WARNING_HOURS;
        const isExpiringSoon = isTokenExpiringSoon(connection.tokenExpiresAt, platformWarningHours);
        
        // Token is fine
        if (!isExpired && !isExpiringSoon) {
          results.push(result);
          continue;
        }
        
        log.info('Token status', { platform: connection.platform, pageName: page.name, status: isExpired ? 'EXPIRED' : 'expiring soon' });
        
        const alertType = isExpired ? 'expired' : 'expiring_soon';
        const pageObjectId = new mongoose.Types.ObjectId(page._id.toString());
        const userObjectId = new mongoose.Types.ObjectId(user._id.toString());
        
        // Check if we have a refresh token
        if (!connection.refreshToken) {
          result.status = 'no_refresh_token';
          result.error = 'No refresh token available';
          
          // Check if we already sent an alert recently
          const recentlyAlerted = await TokenAlert.recentAlertExists(
            pageObjectId,
            connection.platform,
            alertType,
            EMAIL_COOLDOWN_HOURS
          );
          
          if (recentlyAlerted) {
            result.status = 'already_alerted';
            result.emailSent = false;
            log.info('Already alerted, skipping email', { platform: connection.platform, pageName: page.name, cooldownHours: EMAIL_COOLDOWN_HOURS });
            results.push(result);
            continue;
          }
          
          // Send email notification
          const emailSent = await sendTokenExpiryEmail(
            user.email,
            page.name,
            connection.platform,
            connection.platformUsername,
            result.hoursUntilExpiry,
            isExpired
          );
          
          // Record the alert
          await TokenAlert.create({
            pageId: pageObjectId,
            userId: userObjectId,
            platform: narrowedPlatform, // safe: narrowed to TokenAlertPlatform above
            platformId: connection.platformId,
            alertType,
            ...(connection.tokenExpiresAt !== undefined && { tokenExpiresAt: connection.tokenExpiresAt }),
            refreshAttempted: false,
            refreshSucceeded: false,
            emailSent,
            ...(result.hoursUntilExpiry !== undefined && { hoursUntilExpiry: result.hoursUntilExpiry }),
          });
          
          result.emailSent = emailSent;
          if (emailSent) {
            emailsSent.push(`${user.email} (${connection.platform})`);
          }
          
          results.push(result);
          continue;
        }
        
        // Attempt to refresh the token
        log.info('Attempting to refresh token', { platform: connection.platform });
        const refreshResult = await refreshPlatformToken(connection);
        
        if (refreshResult.success && refreshResult.newToken) {
          // Update the token in the database
          await Page.updateOne(
            { 
              _id: page._id, 
              'connections.platform': connection.platform,
              'connections.platformId': connection.platformId,
            },
            {
              $set: {
                'connections.$.accessToken': refreshResult.newToken.accessToken,
                'connections.$.refreshToken': refreshResult.newToken.refreshToken || connection.refreshToken,
                'connections.$.tokenExpiresAt': refreshResult.newToken.expiresAt,
              },
            }
          );
          
          // Record successful refresh
          await TokenAlert.create({
            pageId: pageObjectId,
            userId: userObjectId,
            platform: narrowedPlatform, // safe: narrowed to TokenAlertPlatform above
            platformId: connection.platformId,
            alertType,
            ...(connection.tokenExpiresAt !== undefined && { tokenExpiresAt: connection.tokenExpiresAt }),
            refreshAttempted: true,
            refreshSucceeded: true,
            emailSent: false,
            ...(result.hoursUntilExpiry !== undefined && { hoursUntilExpiry: result.hoursUntilExpiry }),
          });
          
          result.status = 'refreshed';
          tokensRefreshed++;
          log.info('Successfully refreshed token', { platform: connection.platform, pageName: page.name });
        } else {
          result.status = 'refresh_failed';
          if (refreshResult.error !== undefined) result.error = refreshResult.error;
          refreshFailed++;
          
          log.error('Failed to refresh token', { platform: connection.platform, error: refreshResult.error });
          
          // Check if we already sent an alert recently
          const recentlyAlerted = await TokenAlert.recentAlertExists(
            pageObjectId,
            connection.platform,
            'refresh_failed',
            EMAIL_COOLDOWN_HOURS
          );
          
          if (recentlyAlerted) {
            result.emailSent = false;
            log.info('Already alerted about refresh failure, skipping email', { platform: connection.platform, pageName: page.name, cooldownHours: EMAIL_COOLDOWN_HOURS });
          } else {
            // Send email notification
            const emailSent = await sendTokenExpiryEmail(
              user.email,
              page.name,
              connection.platform,
              connection.platformUsername,
              result.hoursUntilExpiry,
              isExpired
            );
            
            // Record the alert
            await TokenAlert.create({
              pageId: pageObjectId,
              userId: userObjectId,
              platform: narrowedPlatform, // safe: narrowed to TokenAlertPlatform above
              platformId: connection.platformId,
              alertType: 'refresh_failed',
              ...(connection.tokenExpiresAt !== undefined && { tokenExpiresAt: connection.tokenExpiresAt }),
              refreshAttempted: true,
              refreshSucceeded: false,
              ...(refreshResult.error !== undefined && { refreshError: refreshResult.error }),
              emailSent,
              ...(result.hoursUntilExpiry !== undefined && { hoursUntilExpiry: result.hoursUntilExpiry }),
            });
            
            result.emailSent = emailSent;
            if (emailSent) {
              emailsSent.push(`${user.email} (${connection.platform})`);
            }
          }
        }
        
        results.push(result);
      }
    }
    
    const summary = {
      timestamp: new Date().toISOString(),
      totalPages: pages.length,
      totalConnections: results.length,
      tokensRefreshed,
      refreshFailed,
      emailsSent: emailsSent.length,
      breakdown: {
        ok: results.filter(r => r.status === 'ok').length,
        refreshed: results.filter(r => r.status === 'refreshed').length,
        refresh_failed: results.filter(r => r.status === 'refresh_failed').length,
        no_expiry: results.filter(r => r.status === 'no_expiry').length,
        no_refresh_token: results.filter(r => r.status === 'no_refresh_token').length,
        already_alerted: results.filter(r => r.status === 'already_alerted').length,
      },
    };
    
    log.info('Token refresh cron complete', { summary });
    
    return NextResponse.json({
      success: true,
      summary,
      results,
      emailsSent,
    });
    
  } catch (error) {
    log.error('Token refresh cron error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

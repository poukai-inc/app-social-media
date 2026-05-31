import { BasePlatformAdapter } from './base-adapter';
import type {
  PlatformContent,
  PlatformPublishResult,
  PlatformMetrics,
  MediaUploadResult,
  ContentStrategyInput,
  PlatformType,
} from './types';
import type { IPlatformConnection } from '../models/Page';
import { CircuitBreaker, fetchWithTimeout } from '../circuit-breaker';
import { logger } from '@/lib/logger';

const log = logger.child('platform:facebook');

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';

/**
 * Facebook Platform Adapter
 * Handles all Facebook-specific API interactions
 */
export class FacebookAdapter extends BasePlatformAdapter {
  platform: PlatformType = 'facebook';

  /**
   * Adapt content for Facebook
   * - More casual tone
   * - Fewer or no hashtags (optional)
   * - Longer content allowed
   */
  async adaptContent(
    baseContent: string,
    _strategy?: ContentStrategyInput
  ): Promise<PlatformContent> {
    let content = baseContent;
    
    // Extract existing hashtags
    const existingHashtags = this.extractHashtags(content);
    content = this.removeHashtags(content);
    
    // Facebook: hashtags are optional, keep 0-3
    const { max } = this.config.recommendedHashtags;
    const hashtags = existingHashtags.slice(0, max);
    
    // Facebook has a very high character limit, usually no truncation needed
    content = this.truncateContent(content);
    
    // Add hashtags back (inline or at end, depending on content)
    if (hashtags.length > 0) {
      content = this.addHashtags(content, hashtags);
    }
    
    return {
      platform: 'facebook',
      content,
      hashtags,
    };
  }

  /**
   * Publish to Facebook
   */
  async publish(
    connection: IPlatformConnection,
    content: PlatformContent,
    media?: MediaUploadResult[]
  ): Promise<PlatformPublishResult> {
    try {
      // For Facebook Pages, we post to /{page-id}/feed
      // For personal profiles (limited), we'd use /me/feed
      const pageId = connection.platformId;
      
      // Check if we have media
      const hasMedia = media && media.length > 0 && media.some(m => m.success && m.mediaId);
      
      let endpoint: string;
      let postBody: Record<string, unknown>;
      
      if (hasMedia) {
        // Post with photo(s)
        const validMedia = media!.filter(m => m.success && m.mediaId);
        
        if (validMedia.length === 1) {
          // Single photo post
          endpoint = `${FACEBOOK_GRAPH_API}/${pageId}/photos`;
          postBody = {
            photo_id: validMedia[0].mediaId,
            caption: content.content,
            access_token: connection.accessToken,
          };
        } else {
          // Multiple photos - need to create unpublished photos first
          // Then create a multi-photo post
          endpoint = `${FACEBOOK_GRAPH_API}/${pageId}/feed`;
          postBody = {
            message: content.content,
            attached_media: validMedia.map(m => ({ media_fbid: m.mediaId })),
            access_token: connection.accessToken,
          };
        }
      } else {
        // Text-only post
        endpoint = `${FACEBOOK_GRAPH_API}/${pageId}/feed`;
        postBody = {
          message: content.content,
          access_token: connection.accessToken,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          platform: 'facebook',
          connectionId: connection.platformId,
          success: false,
          error: errorData.error?.message || `Facebook API error (${response.status})`,
        };
      }

      const data = await response.json();
      const postId = data.id || data.post_id;
      
      return {
        platform: 'facebook',
        connectionId: connection.platformId,
        success: true,
        postId,
        postUrl: postId ? `https://www.facebook.com/${postId}` : undefined,
        publishedAt: new Date(),
      };
    } catch (error) {
      return {
        platform: 'facebook',
        connectionId: connection.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload media to Facebook
   */
  async uploadMedia(
    connection: IPlatformConnection,
    mediaUrl: string,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult> {
    try {
      const pageId = connection.platformId;
      
      if (mediaType === 'video') {
        // Video upload is more complex - would need resumable upload
        // For now, support image uploads
        return {
          success: false,
          error: 'Video upload not yet supported for Facebook',
        };
      }

      // Upload photo as unpublished
      const response = await fetch(`${FACEBOOK_GRAPH_API}/${pageId}/photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: mediaUrl,
          published: false, // Upload but don't publish yet
          access_token: connection.accessToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to upload media');
      }

      const data = await response.json();
      
      return {
        success: true,
        mediaId: data.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch post metrics from Facebook
   */
  async fetchMetrics(
    connection: IPlatformConnection,
    postId: string
  ): Promise<PlatformMetrics> {
    try {
      // Circuit breaker: stop hammering Facebook if it's timing out
      const breaker = CircuitBreaker.for(`facebook:metrics:${connection.platformId}`, {
        failureThreshold: 3,
        resetTimeoutMs: 30 * 60 * 1000, // 30 min backoff
      });

      if (!breaker.allowRequest()) {
        log.info('Skipping metrics fetch', { reason: breaker.getRejectionReason() });
        return {
          platform: 'facebook',
          connectionId: connection.platformId,
          lastUpdated: new Date(),
        };
      }

      // Pass the access token via the Authorization header rather than the URL
      // query string, so it does not land in proxy/access logs. (issue #37)
      const response = await fetchWithTimeout(
        `${FACEBOOK_GRAPH_API}/${postId}?fields=insights.metric(post_impressions,post_engaged_users,post_reactions_by_type_total),shares,comments.summary(true),reactions.summary(true)`,
        {
          timeoutMs: 15_000,
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        }
      );

      if (!response.ok) {
        breaker.recordFailure(response.status);
        throw new Error(`Failed to fetch metrics (${response.status})`);
      }

      breaker.recordSuccess();

      const data = await response.json();
      
      // Parse insights
      const insights = data.insights?.data || [];
      const impressions = insights.find((i: { name: string }) => i.name === 'post_impressions')?.values?.[0]?.value || 0;
      const engagedUsers = insights.find((i: { name: string }) => i.name === 'post_engaged_users')?.values?.[0]?.value || 0;
      
      return {
        platform: 'facebook',
        connectionId: connection.platformId,
        impressions,
        reach: engagedUsers,
        likes: data.reactions?.summary?.total_count || 0,
        comments: data.comments?.summary?.total_count || 0,
        shares: data.shares?.count || 0,
        engagementRate: impressions > 0 ? engagedUsers / impressions : 0,
        lastUpdated: new Date(),
      };
    } catch {
      return {
        platform: 'facebook',
        connectionId: connection.platformId,
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Refresh Facebook access token
   */
  async refreshToken(connection: IPlatformConnection): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    // Facebook Page tokens don't expire if they're long-lived tokens
    // But we can exchange short-lived tokens for long-lived ones
    
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    
    if (!appId || !appSecret) {
      throw new Error('Facebook app credentials not configured');
    }

    const response = await fetch(
      `${FACEBOOK_GRAPH_API}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${appId}&` +
      `client_secret=${appSecret}&` +
      `fb_exchange_token=${connection.accessToken}`
    );

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in 
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    };
  }

  /**
   * Validate Facebook connection
   */
  async validateConnection(connection: IPlatformConnection): Promise<boolean> {
    try {
      const response = await fetch(
        `${FACEBOOK_GRAPH_API}/me?access_token=${connection.accessToken}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const facebookAdapter = new FacebookAdapter();

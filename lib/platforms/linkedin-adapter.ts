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

const log = logger.child('platform:linkedin-adapter');

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

// Video processing timeout and polling settings
const VIDEO_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const VIDEO_POLL_INTERVAL_MS = 5000; // 5 seconds

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * LinkedIn Platform Adapter
 * Handles all LinkedIn-specific API interactions
 */
export class LinkedInAdapter extends BasePlatformAdapter {
  platform: PlatformType = 'linkedin';

  /**
   * Adapt content for LinkedIn
   * - Professional tone
   * - 3-5 hashtags at the end
   * - Max 3000 characters
   */
  async adaptContent(
    baseContent: string,
    _strategy?: ContentStrategyInput
  ): Promise<PlatformContent> {
    let content = baseContent;
    
    // Extract existing hashtags
    const existingHashtags = this.extractHashtags(content);
    content = this.removeHashtags(content);
    
    // LinkedIn prefers 3-5 hashtags
    const { min, max } = this.config.recommendedHashtags;
    let hashtags = existingHashtags.slice(0, max);
    
    // If we have fewer than min, the content should be fine as-is
    // (AI generation should handle this)
    if (hashtags.length < min && existingHashtags.length >= min) {
      hashtags = existingHashtags.slice(0, min);
    }
    
    // Truncate if needed
    const maxContentLength = this.config.maxCharacters - (hashtags.join(' ').length + 2);
    content = this.truncateContent(content, maxContentLength);
    
    // Add hashtags back
    if (hashtags.length > 0) {
      content = this.addHashtags(content, hashtags);
    }
    
    return {
      platform: 'linkedin',
      content,
      hashtags,
    };
  }

  /**
   * Publish to LinkedIn
   */
  async publish(
    connection: IPlatformConnection,
    content: PlatformContent,
    media?: MediaUploadResult[]
  ): Promise<PlatformPublishResult> {
    try {
      // Determine author URN
      const authorUrn = connection.accountType === 'page'
        ? `urn:li:organization:${connection.platformId}`
        : `urn:li:person:${connection.platformId}`;

      // Build post body
      const postBody: Record<string, unknown> = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.content,
            },
            shareMediaCategory: media && media.length > 0 ? 'IMAGE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      // Add media if present
      if (media && media.length > 0) {
        const validMedia = media.filter(m => m.success && m.mediaId);
        if (validMedia.length > 0) {
          const shareContent = (postBody.specificContent as Record<string, Record<string, unknown>>)['com.linkedin.ugc.ShareContent'];
          (postBody.specificContent as Record<string, unknown>)['com.linkedin.ugc.ShareContent'] = {
            ...shareContent,
            media: validMedia.map(m => ({
              status: 'READY',
              media: m.mediaId,
            })),
          };
        }
      }

      const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          platform: 'linkedin',
          connectionId: connection.platformId,
          success: false,
          error: `LinkedIn API error (${response.status}): ${error}`,
        };
      }

      const postId = response.headers.get('x-restli-id') || '';
      
      return {
        platform: 'linkedin',
        connectionId: connection.platformId,
        success: true,
        postId,
        ...(postId ? { postUrl: `https://www.linkedin.com/feed/update/${postId}` } : {}),
        publishedAt: new Date(),
      };
    } catch (error) {
      return {
        platform: 'linkedin',
        connectionId: connection.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload media to LinkedIn
   */
  override async uploadMedia(
    connection: IPlatformConnection,
    mediaUrl: string,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult> {
    try {
      const authorUrn = connection.accountType === 'page'
        ? `urn:li:organization:${connection.platformId}`
        : `urn:li:person:${connection.platformId}`;

      // Step 1: Register upload
      const registerResponse = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: [mediaType === 'video' 
              ? 'urn:li:digitalmediaRecipe:feedshare-video'
              : 'urn:li:digitalmediaRecipe:feedshare-image'
            ],
            owner: authorUrn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            }],
          },
        }),
      });

      if (!registerResponse.ok) {
        throw new Error('Failed to register media upload');
      }

      const registerData = await registerResponse.json();
      const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
      const asset = registerData.value.asset;

      // Step 2: Download the media
      const mediaResponse = await fetch(mediaUrl);
      const mediaBuffer = await mediaResponse.arrayBuffer();

      // Step 3: Upload to LinkedIn
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': mediaResponse.headers.get('content-type') || 'application/octet-stream',
        },
        body: mediaBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload media');
      }

      // For video, we need to wait for processing to complete
      if (mediaType === 'video') {
        const processingResult = await this.waitForVideoProcessing(connection, asset);
        if (!processingResult.success) {
          throw new Error(processingResult.error || 'Video processing failed');
        }
      }

      return {
        success: true,
        mediaId: asset,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wait for LinkedIn video processing to complete
   */
  private async waitForVideoProcessing(
    connection: IPlatformConnection,
    assetUrn: string
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < VIDEO_PROCESSING_TIMEOUT_MS) {
      try {
        const response = await fetch(
          `${LINKEDIN_API_BASE}/assets/${encodeURIComponent(assetUrn)}`,
          {
            headers: {
              'Authorization': `Bearer ${connection.accessToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to check video status: ${response.status}`);
        }

        const data = await response.json();
        const status = data.recipes?.[0]?.status;

        if (status === 'AVAILABLE') {
          log.info('LinkedIn video processing complete');
          return { success: true };
        }

        if (status === 'PROCESSING' || status === 'WAITING_UPLOAD') {
          log.info('LinkedIn video status, waiting', { status });
          await delay(VIDEO_POLL_INTERVAL_MS);
          continue;
        }

        if (status === 'FAILED' || status === 'CANCELLED') {
          return { 
            success: false, 
            error: `Video processing ${status.toLowerCase()}` 
          };
        }

        // Unknown status, wait and try again
        await delay(VIDEO_POLL_INTERVAL_MS);
      } catch (error) {
        log.error('Error checking video status', { error: error instanceof Error ? error.message : String(error) });
        await delay(VIDEO_POLL_INTERVAL_MS);
      }
    }

    return { 
      success: false, 
      error: 'Video processing timeout exceeded' 
    };
  }

  /**
   * Fetch post metrics from LinkedIn
   */
  override async fetchMetrics(
    connection: IPlatformConnection,
    postId: string
  ): Promise<PlatformMetrics> {
    try {
      // Circuit breaker: stop hammering LinkedIn socialActions if 403
      const breaker = CircuitBreaker.for('linkedin:socialActions:metrics', {
        failureThreshold: 3,
        resetTimeoutMs: 60 * 60 * 1000,
        instantTripCodes: [403],
      });

      if (!breaker.allowRequest()) {
        log.info('Skipping metrics fetch', { reason: breaker.getRejectionReason() });
        return {
          platform: 'linkedin',
          connectionId: connection.platformId,
          lastUpdated: new Date(),
        };
      }

      const response = await fetchWithTimeout(
        `${LINKEDIN_API_BASE}/socialActions/${encodeURIComponent(postId)}`,
        {
          headers: {
            'Authorization': `Bearer ${connection.accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          timeoutMs: 15_000,
        }
      );

      if (!response.ok) {
        breaker.recordFailure(response.status);
        throw new Error(`Failed to fetch metrics (${response.status})`);
      }

      breaker.recordSuccess();

      const data = await response.json();
      
      return {
        platform: 'linkedin',
        connectionId: connection.platformId,
        likes: data.likesSummary?.totalLikes || 0,
        comments: data.commentsSummary?.totalFirstLevelComments || 0,
        shares: data.sharesSummary?.totalShareCount || 0,
        lastUpdated: new Date(),
      };
    } catch {
      return {
        platform: 'linkedin',
        connectionId: connection.platformId,
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Validate LinkedIn connection
   */
  async validateConnection(connection: IPlatformConnection): Promise<boolean> {
    try {
      const response = await fetch(`${LINKEDIN_API_BASE}/me`, {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const linkedInAdapter = new LinkedInAdapter();

import type { 
  IPlatformAdapter, 
  PlatformConnection, 
  PlatformContent, 
  PlatformPublishResult,
  PlatformMetrics,
  MediaUploadResult,
  ContentStrategyInput} from './types';
import {
  PLATFORM_CONFIGS,
} from './types';
import type { IPlatformConnection } from '../models/Page';
import { BasePlatformAdapter } from './base-adapter';
import { logger } from '@/lib/logger';

const log = logger.child('platform:twitter');
import { fetchWithTimeout } from '../circuit-breaker';
import crypto from 'crypto';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

/**
 * Generate OAuth 1.0a signature for Twitter API requests
 * Required for media upload endpoint
 */
function generateOAuth1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Create signature base string
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  // Generate HMAC-SHA1 signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');

  return signature;
}

/**
 * Generate OAuth 1.0a header for Twitter API v1.1
 */
function generateOAuth1Header(
  method: string,
  url: string,
  connection: IPlatformConnection,
  additionalParams: Record<string, string> = {}
): string {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY || process.env.TWITTER_CLIENT_ID || '';
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET || process.env.TWITTER_CLIENT_SECRET || '';
  const oauthToken = connection.oauthToken || connection.accessToken;
  const oauthTokenSecret = connection.oauthTokenSecret || '';

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: oauthToken,
    oauth_version: '1.0',
    ...additionalParams,
  };

  // Generate signature
  const signature = generateOAuth1Signature(
    method,
    url,
    oauthParams,
    consumerSecret,
    oauthTokenSecret
  );

  oauthParams.oauth_signature = signature;

  // Build Authorization header
  const headerParts = Object.keys(oauthParams)
    .filter(key => key.startsWith('oauth_'))
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

/**
 * Twitter/X Platform Adapter
 * Handles content adaptation and publishing to Twitter/X
 */
class TwitterAdapter extends BasePlatformAdapter implements IPlatformAdapter {
  platform = 'twitter' as const;
  
  /**
   * Adapt content for Twitter's constraints
   * - Max 280 characters (or 25,000 for Twitter Blue)
   * - 1-3 hashtags work best
   * - Casual, punchy tone
   * - Can include threads for longer content
   */
  async adaptContent(
    baseContent: string, 
    strategy?: ContentStrategyInput
  ): Promise<PlatformContent> {
    const config = PLATFORM_CONFIGS.twitter;
    
    // Extract hashtags
    let hashtags = this.extractHashtags(baseContent);
    let content = this.removeHashtags(baseContent);
    
    // Twitter prefers fewer, more impactful hashtags
    if (hashtags.length > config.recommendedHashtags.max) {
      hashtags = hashtags.slice(0, config.recommendedHashtags.max);
    }
    
    // Calculate available space for content
    const hashtagText = hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : '';
    const maxContentLength = config.maxCharacters - hashtagText.length;
    
    // Truncate if needed, but try to keep it punchy
    if (content.length > maxContentLength) {
      content = this.truncateContent(content, maxContentLength);
    }
    
    // Add hashtags back
    if (hashtags.length > 0) {
      content = content + hashtagText;
    }
    
    return {
      platform: 'twitter',
      content,
      hashtags,
    };
  }

  /**
   * Publish to Twitter/X using v2 API
   */
  async publish(
    connection: IPlatformConnection,
    content: PlatformContent,
    media?: MediaUploadResult[]
  ): Promise<PlatformPublishResult> {
    try {
      const tweetBody: Record<string, unknown> = {
        text: content.content,
      };

      // Add media if present
      if (media && media.length > 0) {
        const validMedia = media.filter(m => m.success && m.mediaId);
        if (validMedia.length > 0) {
          tweetBody.media = {
            media_ids: validMedia.map(m => m.mediaId),
          };
        }
      }

      const response = await fetch(`${TWITTER_API_BASE}/tweets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tweetBody),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          platform: 'twitter',
          connectionId: connection.platformId,
          success: false,
          error: error.detail || error.title || `Twitter API error (${response.status})`,
        };
      }

      const data = await response.json();
      const tweetId = data.data?.id;
      
      return {
        platform: 'twitter',
        connectionId: connection.platformId,
        success: true,
        postId: tweetId,
        postUrl: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined,
        publishedAt: new Date(),
      };
    } catch (error) {
      return {
        platform: 'twitter',
        connectionId: connection.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload media to Twitter
   * Note: Twitter v1.1 media upload requires OAuth 1.0a authentication
   */
  async uploadMedia(
    connection: IPlatformConnection,
    mediaUrl: string,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult> {
    try {
      // Fetch the media file
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) {
        throw new Error('Failed to fetch media file');
      }
      
      const mediaBuffer = await mediaResponse.arrayBuffer();
      const base64Media = Buffer.from(mediaBuffer).toString('base64');
      const contentType = mediaResponse.headers.get('content-type') || 'image/jpeg';
      
      // Twitter uses v1.1 for media upload with OAuth 1.0a
      const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
      
      // Check if we have OAuth 1.0a credentials
      const hasOAuth1 = connection.oauthToken && connection.oauthTokenSecret;
      
      if (hasOAuth1) {
        // Use OAuth 1.0a authentication
        const authHeader = generateOAuth1Header('POST', uploadUrl, connection);
        
        const formData = new URLSearchParams();
        formData.append('media_data', base64Media);
        
        if (mediaType === 'video') {
          formData.append('media_category', 'tweet_video');
        }
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.errors?.[0]?.message || `Twitter media upload failed (${response.status})`);
        }

        const data = await response.json();
        
        // For video, need to wait for processing
        if (mediaType === 'video' && data.processing_info) {
          const mediaId = data.media_id_string;
          const finalResult = await this.waitForMediaProcessing(connection, mediaId);
          return finalResult;
        }
        
        return {
          success: true,
          mediaId: data.media_id_string,
        };
      } else {
        // Fallback: Try with Bearer token (works for some endpoints)
        // Note: This may not work for media upload, but try anyway
        const formData = new URLSearchParams();
        formData.append('media_data', base64Media);
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${connection.accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          // If Bearer auth fails, provide helpful error
          if (response.status === 401 || response.status === 403) {
            throw new Error('Twitter media upload requires OAuth 1.0a credentials (oauthToken and oauthTokenSecret)');
          }
          throw new Error(error.errors?.[0]?.message || 'Failed to upload media');
        }

        const data = await response.json();
        
        return {
          success: true,
          mediaId: data.media_id_string,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wait for Twitter media processing (for videos)
   */
  private async waitForMediaProcessing(
    connection: IPlatformConnection,
    mediaId: string,
    maxAttempts: number = 60
  ): Promise<MediaUploadResult> {
    const statusUrl = `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`;
    const hasOAuth1 = connection.oauthToken && connection.oauthTokenSecret;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const headers: Record<string, string> = hasOAuth1
          ? { 'Authorization': generateOAuth1Header('GET', statusUrl.split('?')[0], connection) }
          : { 'Authorization': `Bearer ${connection.accessToken}` };
        
        const response = await fetch(statusUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        
        const data = await response.json();
        const state = data.processing_info?.state;
        
        if (state === 'succeeded') {
          return { success: true, mediaId };
        }
        
        if (state === 'failed') {
          const error = data.processing_info?.error?.message || 'Video processing failed';
          return { success: false, error };
        }
        
        // Still processing, wait and retry
        const checkAfterSecs = data.processing_info?.check_after_secs || 5;
        await new Promise(resolve => setTimeout(resolve, checkAfterSecs * 1000));
      } catch (error) {
        log.error('Error checking media status', { error: error instanceof Error ? error.message : String(error) });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    return { success: false, error: 'Media processing timeout' };
  }

  /**
   * Fetch tweet metrics
   */
  async fetchMetrics(
    connection: IPlatformConnection,
    postId: string
  ): Promise<PlatformMetrics> {
    try {
      const response = await fetch(
        `${TWITTER_API_BASE}/tweets/${postId}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`,
        {
          headers: {
            'Authorization': `Bearer ${connection.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const data = await response.json();
      const metrics = data.data?.public_metrics || {};
      const nonPublic = data.data?.non_public_metrics || {};
      
      return {
        platform: 'twitter',
        connectionId: connection.platformId,
        impressions: nonPublic.impression_count || metrics.impression_count,
        likes: metrics.like_count || 0,
        comments: metrics.reply_count || 0,
        shares: metrics.retweet_count + (metrics.quote_count || 0),
        clicks: nonPublic.url_link_clicks,
        lastUpdated: new Date(),
      };
    } catch (error) {
      return {
        platform: 'twitter',
        connectionId: connection.platformId,
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Refresh OAuth 2.0 token
   */
  async refreshToken(connection: PlatformConnection): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    if (!connection.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  /**
   * Validate Twitter connection
   */
  async validateConnection(connection: PlatformConnection): Promise<boolean> {
    try {
      const response = await fetch(`${TWITTER_API_BASE}/users/me`, {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================
  // Twitter Search & Engagement APIs
  // ============================================

  /**
   * Search for recent tweets matching a query
   * Twitter API v2 - Recent Search endpoint
   * 
   * Note: Basic tier allows 10 requests/15min, Pro tier allows more
   */
  async searchTweets(
    connection: IPlatformConnection,
    query: string,
    options?: {
      maxResults?: number;       // 10-100, default 10
      sinceId?: string;          // Only tweets after this ID
      excludeRetweets?: boolean; // Filter out RTs
      excludeReplies?: boolean;  // Filter out replies (get original tweets only)
    }
  ): Promise<{
    success: boolean;
    tweets?: TwitterSearchResult[];
    nextToken?: string;
    error?: string;
  }> {
    try {
      const { 
        maxResults = 10, 
        sinceId, 
        excludeRetweets = true,
        excludeReplies = true 
      } = options || {};

      // Build query with filters
      let searchQuery = query;
      if (excludeRetweets) searchQuery += ' -is:retweet';
      if (excludeReplies) searchQuery += ' -is:reply';
      // Restrict to English tweets for better relevance
      searchQuery += ' lang:en';

      const params = new URLSearchParams({
        query: searchQuery,
        max_results: String(Math.min(maxResults, 100)),
        'tweet.fields': 'author_id,created_at,public_metrics,conversation_id,in_reply_to_user_id,text',
        'user.fields': 'name,username,description,public_metrics,verified',
        'expansions': 'author_id',
      });

      if (sinceId) params.append('since_id', sinceId);

      // Log token info for debugging (last 8 chars of token to check staleness)
      const tokenSuffix = connection.accessToken?.slice(-8) || 'MISSING';
      log.info('Twitter Search: executing query', { searchQuery, tokenSuffix });

      const response = await fetchWithTimeout(
        `${TWITTER_API_BASE}/tweets/search/recent?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${connection.accessToken}`,
          },
          timeoutMs: 15_000,
        }
      );

      log.info('Twitter Search: response status', { status: response.status, query });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        
        // Handle rate limiting
        if (response.status === 429) {
          const resetTime = response.headers.get('x-rate-limit-reset');
          return {
            success: false,
            error: `Rate limited. Reset at: ${resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : 'unknown'}`,
          };
        }
        
        // Handle unauthorized - token expired or invalid
        if (response.status === 401) {
          return {
            success: false,
            error: 'Unauthorized - Twitter access token is invalid or expired. Please reconnect your Twitter account in the dashboard.',
          };
        }
        
        return {
          success: false,
          error: error.detail || error.title || `Search failed (${response.status})`,
        };
      }

      const data = await response.json();
      
      // Log search metadata for debugging (result count, query used)
      const resultCount = data.meta?.result_count ?? data.data?.length ?? 0;
      if (resultCount === 0) {
        log.info('Twitter Search: query returned 0 results', { query, meta: data.meta || {} });
      }
      
      // Map users by ID for easy lookup
      const usersById = new Map<string, TwitterUser>();
      if (data.includes?.users) {
        for (const user of data.includes.users) {
          usersById.set(user.id, {
            id: user.id,
            username: user.username,
            name: user.name,
            description: user.description,
            followersCount: user.public_metrics?.followers_count || 0,
            verified: user.verified || false,
          });
        }
      }

      // Map tweets with author info
      const tweets: TwitterSearchResult[] = (data.data || []).map((tweet: Record<string, unknown>) => {
        const author = usersById.get(tweet.author_id as string);
        const metrics = tweet.public_metrics as Record<string, number> || {};
        
        return {
          id: tweet.id as string,
          text: tweet.text as string,
          authorId: tweet.author_id as string,
          author,
          createdAt: new Date(tweet.created_at as string),
          conversationId: tweet.conversation_id as string,
          metrics: {
            likes: metrics.like_count || 0,
            retweets: metrics.retweet_count || 0,
            replies: metrics.reply_count || 0,
            quotes: metrics.quote_count || 0,
          },
        };
      });

      return {
        success: true,
        tweets,
        nextToken: data.meta?.next_token,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reply to a tweet
   */
  async replyToTweet(
    connection: IPlatformConnection,
    tweetId: string,
    replyText: string
  ): Promise<{
    success: boolean;
    replyId?: string;
    replyUrl?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${TWITTER_API_BASE}/tweets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: replyText,
          reply: {
            in_reply_to_tweet_id: tweetId,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: error.detail || error.title || `Reply failed (${response.status})`,
        };
      }

      const data = await response.json();
      const replyId = data.data?.id;

      return {
        success: true,
        replyId,
        replyUrl: replyId ? `https://twitter.com/i/web/status/${replyId}` : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Like a tweet
   */
  async likeTweet(
    connection: IPlatformConnection,
    tweetId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First get the authenticated user's ID
      const meResponse = await fetchWithTimeout(`${TWITTER_API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${connection.accessToken}` },
        timeoutMs: 10_000,
      });
      
      if (!meResponse.ok) {
        return { success: false, error: `Could not get user info (${meResponse.status})` };
      }
      
      const meData = await meResponse.json();
      const userId = meData.data?.id;

      const response = await fetchWithTimeout(`${TWITTER_API_BASE}/users/${userId}/likes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tweet_id: tweetId }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: error.detail || error.title || `Like failed (${response.status})`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a user's recent tweets (for analyzing ICP accounts)
   */
  async getUserTweets(
    connection: IPlatformConnection,
    username: string,
    maxResults: number = 10
  ): Promise<{
    success: boolean;
    tweets?: TwitterSearchResult[];
    user?: TwitterUser;
    error?: string;
  }> {
    try {
      // First get user ID from username
      const userResponse = await fetch(
        `${TWITTER_API_BASE}/users/by/username/${username}?user.fields=description,public_metrics,verified`,
        { headers: { 'Authorization': `Bearer ${connection.accessToken}` } }
      );

      if (!userResponse.ok) {
        return { success: false, error: 'User not found' };
      }

      const userData = await userResponse.json();
      const user: TwitterUser = {
        id: userData.data.id,
        username: userData.data.username,
        name: userData.data.name,
        description: userData.data.description,
        followersCount: userData.data.public_metrics?.followers_count || 0,
        verified: userData.data.verified || false,
      };

      // Get their tweets
      const params = new URLSearchParams({
        max_results: String(Math.min(maxResults, 100)),
        'tweet.fields': 'created_at,public_metrics,conversation_id',
        exclude: 'retweets,replies',
      });

      const tweetsResponse = await fetch(
        `${TWITTER_API_BASE}/users/${user.id}/tweets?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${connection.accessToken}` } }
      );

      if (!tweetsResponse.ok) {
        return { success: true, user, tweets: [] };
      }

      const tweetsData = await tweetsResponse.json();
      const tweets: TwitterSearchResult[] = (tweetsData.data || []).map((tweet: Record<string, unknown>) => {
        const metrics = tweet.public_metrics as Record<string, number> || {};
        return {
          id: tweet.id as string,
          text: tweet.text as string,
          authorId: user.id,
          author: user,
          createdAt: new Date(tweet.created_at as string),
          conversationId: tweet.conversation_id as string,
          metrics: {
            likes: metrics.like_count || 0,
            retweets: metrics.retweet_count || 0,
            replies: metrics.reply_count || 0,
            quotes: metrics.quote_count || 0,
          },
        };
      });

      return { success: true, user, tweets };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check for new replies in a conversation thread
   * Uses mentions timeline which works on Twitter Free tier
   */
  async checkConversationReplies(
    connection: IPlatformConnection,
    conversationId: string,
    sinceDate?: Date,
    ourReplyId?: string
  ): Promise<{
    success: boolean;
    newReplies: Array<{
      id: string;
      text: string;
      authorId: string;
      author?: TwitterUser;
      createdAt: Date;
      inReplyToUserId?: string;
      url: string;
    }>;
    error?: string;
  }> {
    try {
      // Get our user ID first
      const meResponse = await fetchWithTimeout(`${TWITTER_API_BASE}/users/me`, {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
        },
        timeoutMs: 10_000,
      });
      
      if (!meResponse.ok) {
        return {
          success: false,
          newReplies: [],
          error: `Could not get user info (${meResponse.status}${meResponse.status === 401 ? ' Unauthorized' : ''})`,
        };
      }
      
      const meData = await meResponse.json();
      const ourUserId = meData.data?.id;
      
      if (!ourUserId) {
        return {
          success: false,
          newReplies: [],
          error: 'Could not get user ID',
        };
      }

      // Strategy: Use mentions timeline (works on Free tier)
      // This gets all tweets that mention/reply to us
      // Note: Don't use start_time with mentions - it can cause errors
      const url = `${TWITTER_API_BASE}/users/${ourUserId}/mentions?` +
        `tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id,text,referenced_tweets&` +
        `expansions=author_id,referenced_tweets.id&` +
        `user.fields=id,name,username,public_metrics,verified&` +
        `max_results=100`;

      log.info('Checking mentions for user', { ourUserId });
      
      const response = await fetchWithTimeout(url, {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
        },
        timeoutMs: 15_000,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        log.error('Mentions API error', { status: response.status, errorData });
        return {
          success: false,
          newReplies: [],
          error: errorData.detail || errorData.title || `Mentions API failed (${response.status})`,
        };
      }

      const data = await response.json();
      const tweets = data.data || [];
      const users = data.includes?.users || [];
      const referencedTweets = data.includes?.tweets || [];

      log.info('Found mentions', { count: tweets.length });

      // Create user lookup map
      const userMap = new Map(users.map((user: any) => [user.id, {
        id: user.id,
        name: user.name,
        username: user.username,
        followersCount: user.public_metrics?.followers_count || 0,
        verified: user.verified || false,
      }]));

      // Filter to only replies in THIS conversation
      // A reply is in our conversation if:
      // 1. Its conversation_id matches our thread
      // 2. OR it references our reply tweet
      const relevantReplies = tweets.filter((tweet: any) => {
        // Skip our own tweets
        if (tweet.author_id === ourUserId) return false;
        
        // Check if it's in the same conversation
        if (tweet.conversation_id === conversationId) return true;
        
        // Check if it's a reply to our specific tweet
        if (ourReplyId && tweet.referenced_tweets) {
          const isReplyToOurs = tweet.referenced_tweets.some(
            (ref: any) => ref.type === 'replied_to' && ref.id === ourReplyId
          );
          if (isReplyToOurs) return true;
        }
        
        return false;
      });

      log.info('Found relevant replies in conversation', { count: relevantReplies.length, conversationId });

      const newReplies = relevantReplies.map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id,
        author: userMap.get(tweet.author_id),
        createdAt: new Date(tweet.created_at),
        inReplyToUserId: tweet.in_reply_to_user_id,
        url: `https://twitter.com/i/web/status/${tweet.id}`,
      }));

      return {
        success: true,
        newReplies,
      };

    } catch (error) {
      return {
        success: false,
        newReplies: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get our user ID from Twitter API
   */
  async getOwnUserId(connection: IPlatformConnection): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(`${TWITTER_API_BASE}/users/me`, {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
        },
        timeoutMs: 10_000,
      });

      if (!response.ok) {
        log.warn('Failed to get own user ID from Twitter API', { status: response.status });
        return null;
      }

      const data = await response.json();
      return data.data?.id || null;
    } catch (error) {
      log.warn('Error getting own user ID', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  description?: string;
  followersCount: number;
  verified: boolean;
}

export interface TwitterSearchResult {
  id: string;
  text: string;
  authorId: string;
  author?: TwitterUser;
  createdAt: Date;
  conversationId: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
  };
}

export const twitterAdapter = new TwitterAdapter();

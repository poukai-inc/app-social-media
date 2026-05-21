import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import { CircuitBreaker, fetchWithTimeout } from '@/lib/circuit-breaker';
import { logger } from '@/lib/logger';

const log = logger.child('platform:linkedin-engagement');

// ============================================
// Types
// ============================================

interface LinkedInComment {
  urn: string;
  actor: string;
  actorName: string;
  actorProfileUrl?: string;
  message: string;
  createdAt: number;
}

interface LinkedInReaction {
  actor: string;
  reactionType: string;
}

interface PostDetails {
  urn: string;
  author: string;
  authorName?: string;
  content: string;
}

interface ScrapedPostData {
  content?: string;
  author?: string;
  authorName?: string;
  title?: string;
}

// ============================================
// Web Scraping - Fetch Post Content from URL
// ============================================

/**
 * Scrape LinkedIn post content from the public page
 * This extracts data from meta tags and embedded JSON without requiring auth
 */
export async function scrapeLinkedInPost(postUrl: string): Promise<{ success: boolean; data?: ScrapedPostData; error?: string }> {
  try {
    // Fetch the page with browser-like headers
    const response = await fetch(postUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.status}` };
    }

    const html = await response.text();
    const data: ScrapedPostData = {};

    // Extract from Open Graph meta tags
    const ogDescriptionMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)
      || html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:description"[^>]*>/i);
    if (ogDescriptionMatch) {
      data.content = decodeHTMLEntities(ogDescriptionMatch[1]);
    }

    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i)
      || html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:title"[^>]*>/i);
    if (ogTitleMatch) {
      data.title = decodeHTMLEntities(ogTitleMatch[1]);
    }

    // Try to extract author from title or URL
    // Title format is often "Author Name on LinkedIn: post content..."
    if (data.title) {
      const authorFromTitle = data.title.match(/^([^|]+?)(?:\s+on\s+LinkedIn|\s*\|)/i);
      if (authorFromTitle) {
        data.authorName = authorFromTitle[1].trim();
      }
    }

    // Extract author username from URL
    const authorFromUrl = postUrl.match(/linkedin\.com\/posts\/([^_\/]+)/);
    if (authorFromUrl) {
      data.author = authorFromUrl[1];
    }

    // Try to find JSON-LD data which has richer content
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
          const jsonData = JSON.parse(jsonContent);
          
          // Look for Article or SocialMediaPosting schema
          if (jsonData['@type'] === 'Article' || jsonData['@type'] === 'SocialMediaPosting') {
            if (jsonData.articleBody) {
              data.content = jsonData.articleBody;
            }
            if (jsonData.author?.name) {
              data.authorName = jsonData.author.name;
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    // Also look for the post content in the page's data attributes or specific divs
    // LinkedIn sometimes embeds content in data-* attributes
    const commentaryMatch = html.match(/data-test-id="main-feed-activity-card__commentary"[^>]*>([^<]+)</i)
      || html.match(/<span[^>]*class="[^"]*break-words[^"]*"[^>]*>([^<]{50,})</i);
    if (commentaryMatch && !data.content) {
      data.content = decodeHTMLEntities(commentaryMatch[1]);
    }

    if (!data.content && !data.title) {
      return { success: false, error: 'Could not extract post content from page' };
    }

    // Use title as content if no description found
    if (!data.content && data.title) {
      // Title often contains the beginning of the post
      data.content = data.title.replace(/^[^:]+:\s*/, ''); // Remove "Author on LinkedIn: " prefix
    }

    return { success: true, data };
  } catch (error) {
    log.error('Error scraping LinkedIn post', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Decode HTML entities like &amp; &quot; etc.
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract post URN from various LinkedIn URL formats
 * Supports:
 * - https://www.linkedin.com/feed/update/urn:li:activity:1234567890/
 * - https://www.linkedin.com/posts/username_activity-1234567890-xxxx
 * - https://www.linkedin.com/feed/update/urn:li:share:1234567890/
 * - https://www.linkedin.com/feed/update/urn:li:ugcPost:1234567890/
 * - https://www.linkedin.com/posts/username_title-1234567890-xxxx (new format)
 * - https://www.linkedin.com/embed/feed/update/urn:li:share:1234567890
 */
export function extractPostUrn(url: string): string | null {
  try {
    // Clean up the URL - decode if needed
    const decodedUrl = decodeURIComponent(url);
    
    // Format: /feed/update/urn:li:activity:123456/
    const activityMatch = decodedUrl.match(/urn:li:activity:(\d+)/);
    if (activityMatch) {
      return `urn:li:activity:${activityMatch[1]}`;
    }

    // Format: /feed/update/urn:li:share:123456/
    const shareMatch = decodedUrl.match(/urn:li:share:(\d+)/);
    if (shareMatch) {
      return `urn:li:share:${shareMatch[1]}`;
    }

    // Format: /feed/update/urn:li:ugcPost:123456/
    const ugcMatch = decodedUrl.match(/urn:li:ugcPost:(\d+)/);
    if (ugcMatch) {
      return `urn:li:ugcPost:${ugcMatch[1]}`;
    }

    // Format: /posts/username_activity-1234567890-xxxx
    const postsActivityMatch = decodedUrl.match(/posts\/[^/]+[_-]activity[_-](\d+)/i);
    if (postsActivityMatch) {
      return `urn:li:activity:${postsActivityMatch[1]}`;
    }

    // Format: /posts/username_anytitle-1234567890-xxxx (generic posts format)
    // The ID is typically 19 digits
    const postsGenericMatch = decodedUrl.match(/posts\/[^/]+[-_](\d{19,20})[-_]/);
    if (postsGenericMatch) {
      return `urn:li:activity:${postsGenericMatch[1]}`;
    }

    // Format: Just the activity ID in the URL somewhere (fallback)
    const anyActivityId = decodedUrl.match(/[-_](\d{19,20})(?:[-_]|$|\/)/);
    if (anyActivityId) {
      return `urn:li:activity:${anyActivityId[1]}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get user's LinkedIn credentials from database
 */
async function getLinkedInCredentials(userId: string) {
  await connectToDatabase();
  const user = await User.findOne({ email: userId });

  if (!user || !user.linkedinAccessToken || !user.linkedinId) {
    throw new Error('User not connected to LinkedIn');
  }

  if (user.linkedinAccessTokenExpires && new Date() > user.linkedinAccessTokenExpires) {
    throw new Error('LinkedIn access token expired. Please reconnect.');
  }

  return {
    accessToken: user.linkedinAccessToken,
    personUrn: `urn:li:person:${user.linkedinId}`,
    linkedinId: user.linkedinId,
  };
}

// ============================================
// Social Actions API - Comments
// ============================================

/**
 * Fetch comments on a specific post
 */
export async function getPostComments(
  userId: string,
  postUrn: string
): Promise<{ success: boolean; comments?: LinkedInComment[]; error?: string }> {
  try {
    // Circuit breaker: stop hammering LinkedIn API if it's returning 403s
    const breaker = CircuitBreaker.for('linkedin:socialActions:comments', {
      failureThreshold: 3,
      resetTimeoutMs: 60 * 60 * 1000, // 1 hour backoff on repeated failures
      instantTripCodes: [403],
    });

    if (!breaker.allowRequest()) {
      const reason = breaker.getRejectionReason();
      log.info('Skipping comments fetch', { reason });
      return { success: false, error: reason };
    }

    const { accessToken } = await getLinkedInCredentials(userId);

    // URL encode the URN for the API call
    const encodedUrn = encodeURIComponent(postUrn);

    const response = await fetchWithTimeout(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments?count=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeoutMs: 15_000,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error('LinkedIn comments API error', { status: response.status, errorText });
      breaker.recordFailure(response.status);
      return { success: false, error: `Failed to fetch comments: ${response.status}` };
    }

    breaker.recordSuccess();
    const data = await response.json();
    
    const comments: LinkedInComment[] = (data.elements || []).map((comment: {
      '$URN': string;
      actor: string;
      message?: { text?: string };
      created?: { time?: number };
    }) => ({
      urn: comment['$URN'] || comment.actor,
      actor: comment.actor,
      actorName: 'LinkedIn User', // Would need additional API call to get name
      message: comment.message?.text || '',
      createdAt: comment.created?.time || Date.now(),
    }));

    return { success: true, comments };
  } catch (error) {
    log.error('Error fetching comments', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Post a comment on a LinkedIn post
 */
export async function postComment(
  userId: string,
  postUrn: string,
  commentText: string
): Promise<{ success: boolean; commentUrn?: string; error?: string }> {
  try {
    const { accessToken, personUrn } = await getLinkedInCredentials(userId);

    const encodedUrn = encodeURIComponent(postUrn);

    const response = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor: personUrn,
          message: {
            text: commentText,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error('LinkedIn comment post error', { errorText });
      return { success: false, error: `Failed to post comment: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, commentUrn: data['$URN'] || data.id };
  } catch (error) {
    log.error('Error posting comment', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Reply to a comment on a LinkedIn post
 */
export async function replyToComment(
  userId: string,
  postUrn: string,
  parentCommentUrn: string,
  replyText: string
): Promise<{ success: boolean; replyUrn?: string; error?: string }> {
  try {
    const { accessToken, personUrn } = await getLinkedInCredentials(userId);

    const encodedUrn = encodeURIComponent(postUrn);

    const response = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor: personUrn,
          message: {
            text: replyText,
          },
          parentComment: parentCommentUrn,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error('LinkedIn reply error', { errorText });
      return { success: false, error: `Failed to post reply: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, replyUrn: data['$URN'] || data.id };
  } catch (error) {
    log.error('Error posting reply', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Social Actions API - Reactions (Likes)
// ============================================

/**
 * React to a LinkedIn post (like)
 */
export async function reactToPost(
  userId: string,
  postUrn: string,
  reactionType: 'LIKE' | 'CELEBRATE' | 'SUPPORT' | 'LOVE' | 'INSIGHTFUL' | 'FUNNY' = 'LIKE'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { accessToken, personUrn } = await getLinkedInCredentials(userId);

    const encodedUrn = encodeURIComponent(postUrn);

    const response = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/likes`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor: personUrn,
          reactionType,
        }),
      }
    );

    if (!response.ok) {
      // 409 means already liked - treat as success
      if (response.status === 409) {
        return { success: true };
      }
      const errorText = await response.text();
      log.error('LinkedIn reaction error', { errorText });
      return { success: false, error: `Failed to react: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    log.error('Error reacting to post', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get reactions on a post
 */
export async function getPostReactions(
  userId: string,
  postUrn: string
): Promise<{ success: boolean; reactions?: LinkedInReaction[]; error?: string }> {
  try {
    // Circuit breaker: same socialActions API family
    const breaker = CircuitBreaker.for('linkedin:socialActions:reactions', {
      failureThreshold: 3,
      resetTimeoutMs: 60 * 60 * 1000,
      instantTripCodes: [403],
    });

    if (!breaker.allowRequest()) {
      const reason = breaker.getRejectionReason();
      log.info('Skipping reactions fetch', { reason });
      return { success: false, error: reason };
    }

    const { accessToken } = await getLinkedInCredentials(userId);

    const encodedUrn = encodeURIComponent(postUrn);

    const response = await fetchWithTimeout(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/likes?count=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeoutMs: 15_000,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error('LinkedIn reactions API error', { status: response.status, errorText });
      breaker.recordFailure(response.status);
      return { success: false, error: `Failed to fetch reactions: ${response.status}` };
    }

    breaker.recordSuccess();

    const data = await response.json();

    const reactions: LinkedInReaction[] = (data.elements || []).map((reaction: {
      actor: string;
      reactionType?: string;
    }) => ({
      actor: reaction.actor,
      reactionType: reaction.reactionType || 'LIKE',
    }));

    return { success: true, reactions };
  } catch (error) {
    log.error('Error fetching reactions', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// UGC Posts API - Fetch Post Details
// ============================================

/**
 * Get details of a specific post (if accessible)
 * Note: LinkedIn API access to other users' posts is limited
 */
export async function getPostDetails(
  userId: string,
  postUrn: string
): Promise<{ success: boolean; post?: PostDetails; error?: string }> {
  try {
    const { accessToken } = await getLinkedInCredentials(userId);

    // Try to get post via ugcPosts endpoint
    const encodedUrn = encodeURIComponent(postUrn);

    const response = await fetch(
      `https://api.linkedin.com/v2/ugcPosts/${encodedUrn}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) {
      // Post details might not be accessible, but we can still engage with it
      return { 
        success: false, 
        error: `Could not fetch post details: ${response.status}. Post may still be engageable.` 
      };
    }

    const data = await response.json();
    
    const post: PostDetails = {
      urn: postUrn,
      author: data.author || 'Unknown',
      content: data.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '',
    };

    return { success: true, post };
  } catch (error) {
    log.error('Error fetching post details', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Batch Operations
// ============================================

/**
 * Engage with a post (like and/or comment)
 */
export async function engageWithPost(
  userId: string,
  postUrn: string,
  options: {
    like?: boolean;
    comment?: string;
    reactionType?: 'LIKE' | 'CELEBRATE' | 'SUPPORT' | 'LOVE' | 'INSIGHTFUL' | 'FUNNY';
  }
): Promise<{ success: boolean; liked?: boolean; commented?: boolean; error?: string }> {
  const results: { liked?: boolean; commented?: boolean } = {};
  const errors: string[] = [];

  // Like the post
  if (options.like) {
    const likeResult = await reactToPost(userId, postUrn, options.reactionType || 'LIKE');
    if (likeResult.success) {
      results.liked = true;
    } else {
      errors.push(`Like failed: ${likeResult.error}`);
    }
  }

  // Comment on the post
  if (options.comment) {
    const commentResult = await postComment(userId, postUrn, options.comment);
    if (commentResult.success) {
      results.commented = true;
    } else {
      errors.push(`Comment failed: ${commentResult.error}`);
    }
  }

  const success = errors.length === 0 || Boolean(results.liked || results.commented);
  
  return {
    success,
    ...results,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

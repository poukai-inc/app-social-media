import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import type { IPost, PlatformPublishResult} from '@/lib/models/Post';
import Post from '@/lib/models/Post';
import { postToLinkedIn } from '@/lib/linkedin';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import { platformRegistry } from '@/lib/platforms';
import type { PlatformType, PlatformConnection } from '@/lib/platforms/types';
import { withLock } from '@/lib/distributed-lock';
import { logger } from '@/lib/logger';

const log = logger.child('cron:publish');

// This API route processes scheduled posts
// You should call this endpoint via a cron job service (e.g., Vercel Cron, GitHub Actions, or external services)
// Recommended: Run every minute or every 5 minutes

const RETRY_DELAY_MS = [5000, 15000, 30000]; // Exponential backoff, one entry per retry
// Keep MAX_RETRIES tied to the delay array so every retry has a real delay slot.
// Worst case per platform ≈ sum of delays (~50s) plus request time; across
// serial platforms this must stay well under the 300s publish lock TTL. The
// per-post atomic claim (issue #16) guards correctness if it ever doesn't. (issue #46)
const MAX_RETRIES = RETRY_DELAY_MS.length;

interface PublishContext {
  post: IPost;
  user: typeof User.prototype;
  page?: typeof Page.prototype;
  connections: Map<PlatformType, PlatformConnection>;
}

/**
 * Attempt to refresh an expired token
 */
async function tryRefreshToken(
  platform: PlatformType,
  connection: PlatformConnection
): Promise<PlatformConnection | null> {
  try {
    const adapter = platformRegistry.getAdapter(platform);
    if (!adapter?.refreshToken) {
      log.info('No refresh method available', { platform });
      return null;
    }
    
    const refreshed = await adapter.refreshToken(connection);
    log.info('Successfully refreshed token', { platform });
    
    return {
      ...connection,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || connection.refreshToken,
      tokenExpiresAt: refreshed.expiresAt,
    };
  } catch (error) {
    log.error('Failed to refresh token', { platform, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Delay helper for retries
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function publishToPlatform(
  context: PublishContext,
  platform: PlatformType,
  content: string,
  retryCount: number = 0
): Promise<PlatformPublishResult> {
  const { post, connections } = context;
  let connection = connections.get(platform);
  
  if (!connection) {
    return {
      platform,
      status: 'skipped',
      error: `No ${platform} connection found`,
      retryCount,
    };
  }
  
  // Check if connection is expired and attempt refresh
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
    log.info('Token expired, attempting refresh', { platform });
    const refreshed = await tryRefreshToken(platform, connection);
    
    if (refreshed) {
      // Update the connection in the page
      connection = refreshed;
      connections.set(platform, refreshed);
      
      // Save refreshed token to database
      if (context.page) {
        try {
          await Page.findOneAndUpdate(
            // Match on platformId too, so the positional `$` updates THIS
            // connection — not the first connection of the same platform when a
            // page has more than one. (issue #34)
            {
              _id: context.page._id,
              connections: { $elemMatch: { platform, platformId: connection.platformId } },
            },
            {
              $set: {
                'connections.$.accessToken': refreshed.accessToken,
                'connections.$.refreshToken': refreshed.refreshToken,
                'connections.$.tokenExpiresAt': refreshed.tokenExpiresAt,
              }
            }
          );
        } catch (saveError) {
          log.error('Failed to save refreshed token', { error: saveError instanceof Error ? saveError.message : String(saveError) });
        }
      }
    } else {
      return {
        platform,
        status: 'failed',
        error: `${platform} token expired and refresh failed`,
        retryCount,
      };
    }
  }
  
  const adapter = platformRegistry.getAdapter(platform);
  
  if (!adapter) {
    return {
      platform,
      status: 'skipped',
      error: `No adapter available for ${platform}`,
      retryCount,
    };
  }
  
  try {
    // Adapt content for this platform
    const adaptedContent = await adapter.adaptContent(content, {});
    
    // Handle media uploads if needed
    const mediaResults: { success: boolean; mediaId?: string; error?: string }[] = [];
    if (post.media && post.media.length > 0 && adapter.uploadMedia) {
      for (const mediaItem of post.media) {
        try {
          const result = await adapter.uploadMedia(
            connection,
            mediaItem.url,
            mediaItem.type
          );
          mediaResults.push(result);
        } catch (mediaError) {
          log.error('Failed to upload media', { platform, error: mediaError instanceof Error ? mediaError.message : String(mediaError) });
          // Continue without this media item
        }
      }
    }
    
    // Publish to platform
    const result = await adapter.publish(connection, adaptedContent, mediaResults);
    
    if (result.success) {
      return {
        platform,
        status: 'published',
        postId: result.postId,
        postUrl: result.postUrl,
        publishedAt: new Date(),
        retryCount,
      };
    }
    
    // Check if we should retry
    const isRetryable = result.error?.includes('rate limit') || 
                        result.error?.includes('timeout') ||
                        result.error?.includes('503') ||
                        result.error?.includes('502');
    
    if (isRetryable && retryCount < MAX_RETRIES) {
      log.info('Retrying publish', { platform, attempt: retryCount + 1, maxRetries: MAX_RETRIES });
      await delay(RETRY_DELAY_MS[retryCount] || 30000);
      return publishToPlatform(context, platform, content, retryCount + 1);
    }
    
    return {
      platform,
      status: 'failed',
      error: result.error,
      retryCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if error is retryable
    const isRetryable = errorMessage.includes('ETIMEDOUT') || 
                        errorMessage.includes('ECONNRESET') ||
                        errorMessage.includes('fetch failed');
    
    if (isRetryable && retryCount < MAX_RETRIES) {
      log.info('Retrying publish after error', { platform, attempt: retryCount + 1, maxRetries: MAX_RETRIES });
      await delay(RETRY_DELAY_MS[retryCount] || 30000);
      return publishToPlatform(context, platform, content, retryCount + 1);
    }
    
    return {
      platform,
      status: 'failed',
      error: errorMessage,
      retryCount,
    };
  }
}

async function publishToAllPlatforms(context: PublishContext): Promise<{
  results: PlatformPublishResult[];
  overallStatus: 'published' | 'partially_published' | 'failed';
}> {
  const { post } = context;
  const targetPlatforms = post.targetPlatforms || ['linkedin'];
  const results: PlatformPublishResult[] = [];
  
  // Get platform-specific content versions or use original content
  const getContentForPlatform = (platform: PlatformType): string => {
    if (post.platformContent && post.platformContent.length > 0) {
      const platformVersion = post.platformContent.find(pc => pc.platform === platform);
      if (platformVersion) {
        return platformVersion.content;
      }
    }
    return post.content;
  };
  
  // Publish to each target platform
  for (const platform of targetPlatforms) {
    const content = getContentForPlatform(platform);
    const result = await publishToPlatform(context, platform, content);
    results.push(result);
  }
  
  // Determine overall status
  const publishedCount = results.filter(r => r.status === 'published').length;
  
  let overallStatus: 'published' | 'partially_published' | 'failed';
  
  if (publishedCount === targetPlatforms.length) {
    overallStatus = 'published';
  } else if (publishedCount > 0) {
    overallStatus = 'partially_published';
  } else {
    overallStatus = 'failed';
  }
  
  return { results, overallStatus };
}

export async function GET(request: Request) {
  // Verify the request is authorized (use a secret key for cron jobs)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  await connectToDatabase();

  // Use distributed lock to prevent concurrent execution
  const lockResult = await withLock(
    'publish',
    async () => {
      return await executePublish();
    },
    { ttlSeconds: 300 } // 5 minute lock timeout
  );

  if (lockResult.skipped) {
    return NextResponse.json({
      success: false,
      skipped: true,
      message: 'Another instance is already running publish',
    });
  }

  if (!lockResult.success) {
    return NextResponse.json(
      { error: lockResult.error || 'Publish failed' },
      { status: 500 }
    );
  }

  return NextResponse.json(lockResult.result);
}

/**
 * Main publish execution logic
 */
async function executePublish() {
  try {
    const now = new Date();

    // A post claimed for publishing but never finalized within this window is
    // treated as abandoned (worker crashed mid-run) and may be reclaimed. Must
    // exceed worst-case publish runtime (serial platforms × retry backoff). (issue #16)
    const STALE_CLAIM_MS = 10 * 60 * 1000; // 10 minutes
    const staleThreshold = new Date(now.getTime() - STALE_CLAIM_MS);

    // Discover due posts that are unclaimed or whose prior claim went stale.
    // Bounded per run; earliest scheduled first. (issue #31)
    const MAX_POSTS_PER_RUN = 200;
    const candidates = await Post.find({
      status: 'scheduled',
      scheduledFor: { $lte: now },
      $or: [
        { publishStartedAt: { $exists: false } },
        { publishStartedAt: { $lt: staleThreshold } },
      ],
    })
      .select('_id pageId')
      .sort({ scheduledFor: 1 })
      .limit(MAX_POSTS_PER_RUN)
      .lean();

    // Prefetch the pages these posts belong to (one query instead of a
    // Page.findById per post). (issue #31)
    const pageIds = candidates.flatMap(c => (c.pageId ? [c.pageId] : []));
    const pages = pageIds.length ? await Page.find({ _id: { $in: pageIds } }) : [];
    const pageMap = new Map(pages.map(p => [p._id.toString(), p]));

    const results = [];

    for (const candidate of candidates) {
      // Atomically claim the post: flip publishStartedAt only if it is still
      // unclaimed/stale. The DB guarantees a single winner, so a concurrent run
      // — or this endpoint re-entered after the 5-min lock TTL expired
      // mid-publish — gets null and skips, preventing double-publish. (issue #16)
      const post = await Post.findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'scheduled',
          $or: [
            { publishStartedAt: { $exists: false } },
            { publishStartedAt: { $lt: staleThreshold } },
          ],
        },
        { $set: { publishStartedAt: new Date() } },
        { new: true }
      );

      if (!post) {
        // Lost the race — another worker claimed this post.
        continue;
      }

      try {
        // Single user fetch (the claim above no longer redundantly populates). (issue #31)
        const user = await User.findById(post.userId);

        if (!user) {
          post.status = 'failed';
          post.error = 'User not found';
          post.publishStartedAt = undefined;
          await post.save();
          results.push({ postId: post._id, status: 'failed', error: 'User not found' });
          continue;
        }

        // Check if this is a new multi-platform post or legacy single-platform
        const hasMultiplePlatforms = post.targetPlatforms && post.targetPlatforms.length > 0;
        
        if (hasMultiplePlatforms && post.pageId) {
          // New multi-platform publishing flow — page came from the prefetch. (issue #31)
          const page = pageMap.get(post.pageId.toString());

          if (!page) {
            post.status = 'failed';
            post.error = 'Page not found';
            post.publishStartedAt = undefined;
            await post.save();
            results.push({ postId: post._id, status: 'failed', error: 'Page not found' });
            continue;
          }
          
          // Build connections map from page
          const connections = new Map<PlatformType, PlatformConnection>();
          for (const conn of page.connections || []) {
            if (conn.isActive) {
              connections.set(conn.platform, conn);
            }
          }
          
          // Publish to all platforms
          const context: PublishContext = { post, user, page, connections };
          const { results: platformResults, overallStatus } = await publishToAllPlatforms(context);
          
          // Update post with results
          post.status = overallStatus;
          post.platformResults = platformResults;
          post.publishedAt = overallStatus !== 'failed' ? new Date() : undefined;
          post.publishStartedAt = undefined;
          
          // For backward compatibility, set linkedinPostId if LinkedIn was successful
          const linkedinResult = platformResults.find(r => r.platform === 'linkedin');
          if (linkedinResult?.postId) {
            post.linkedinPostId = linkedinResult.postId;
          }
          
          // Set error message from failed platforms
          const errors = platformResults
            .filter(r => r.status === 'failed' && r.error)
            .map(r => `${r.platform}: ${r.error}`);
          
          if (errors.length > 0) {
            post.error = errors.join('; ');
          } else {
            post.error = undefined;
          }
          
          await post.save();
          results.push({
            postId: post._id,
            status: post.status,
            platformResults,
            error: post.error,
          });
        } else {
          // Legacy single-platform (LinkedIn) flow for backward compatibility
          const result = await postToLinkedIn(
            user.email, 
            post.content, 
            post.media || [],
            post.postAs || 'person',
            post.organizationId
          );

          if (result.success) {
            post.status = 'published';
            post.publishedAt = new Date();
            post.linkedinPostId = result.postId;
            post.error = undefined;
            
            // Also populate platformResults for consistency
            post.platformResults = [{
              platform: 'linkedin',
              status: 'published',
              postId: result.postId,
              postUrl: result.postUrl,
              publishedAt: new Date(),
              retryCount: 0,
            }];
          } else {
            post.status = 'failed';
            post.error = result.error;
            
            post.platformResults = [{
              platform: 'linkedin',
              status: 'failed',
              error: result.error,
              retryCount: 0,
            }];
          }

          post.publishStartedAt = undefined;
          await post.save();
          results.push({
            postId: post._id,
            status: post.status,
            error: post.error,
          });
        }
      } catch (error) {
        post.status = 'failed';
        post.error = error instanceof Error ? error.message : 'Unknown error';
        post.publishStartedAt = undefined;
        await post.save();
        results.push({
          postId: post._id,
          status: 'failed',
          error: post.error,
        });
      }
    }

    return {
      processed: results.length,
      results,
    };
  } catch (error) {
    log.error('Cron job error', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}


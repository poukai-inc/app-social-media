import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Post, { IPost, PlatformPublishResult, PlatformContent } from '@/lib/models/Post';
import { postToLinkedIn } from '@/lib/linkedin';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import { platformRegistry } from '@/lib/platforms';
import { PlatformType, PlatformConnection } from '@/lib/platforms/types';
import { withLock } from '@/lib/distributed-lock';

// This API route processes scheduled posts
// You should call this endpoint via a cron job service (e.g., Vercel Cron, GitHub Actions, or external services)
// Recommended: Run every minute or every 5 minutes

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [5000, 15000, 30000]; // Exponential backoff

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
      console.log(`No refresh method available for ${platform}`);
      return null;
    }
    
    const refreshed = await adapter.refreshToken(connection);
    console.log(`Successfully refreshed ${platform} token`);
    
    return {
      ...connection,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || connection.refreshToken,
      tokenExpiresAt: refreshed.expiresAt,
    };
  } catch (error) {
    console.error(`Failed to refresh ${platform} token:`, error);
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
    console.log(`${platform} token expired, attempting refresh...`);
    const refreshed = await tryRefreshToken(platform, connection);
    
    if (refreshed) {
      // Update the connection in the page
      connection = refreshed;
      connections.set(platform, refreshed);
      
      // Save refreshed token to database
      if (context.page) {
        try {
          await Page.findOneAndUpdate(
            { _id: context.page._id, 'connections.platform': platform },
            { 
              $set: { 
                'connections.$.accessToken': refreshed.accessToken,
                'connections.$.refreshToken': refreshed.refreshToken,
                'connections.$.tokenExpiresAt': refreshed.tokenExpiresAt,
              }
            }
          );
        } catch (saveError) {
          console.error('Failed to save refreshed token:', saveError);
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
          console.error(`Failed to upload media to ${platform}:`, mediaError);
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
      console.log(`Retrying ${platform} publish (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
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
      console.log(`Retrying ${platform} publish after error (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
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
  const failedCount = results.filter(r => r.status === 'failed').length;
  
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
    // Find all scheduled posts that are due
    const now = new Date();
    const scheduledPosts = await Post.find({
      status: 'scheduled',
      scheduledFor: { $lte: now },
    }).populate('userId');

    const results = [];

    for (const post of scheduledPosts) {
      try {
        // Get the user to get their email
        const user = await User.findById(post.userId);
        
        if (!user) {
          post.status = 'failed';
          post.error = 'User not found';
          await post.save();
          results.push({ postId: post._id, status: 'failed', error: 'User not found' });
          continue;
        }

        // Check if this is a new multi-platform post or legacy single-platform
        const hasMultiplePlatforms = post.targetPlatforms && post.targetPlatforms.length > 0;
        
        if (hasMultiplePlatforms && post.pageId) {
          // New multi-platform publishing flow
          const page = await Page.findById(post.pageId);
          
          if (!page) {
            post.status = 'failed';
            post.error = 'Page not found';
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
    console.error('Cron job error:', error);
    throw error;
  }
}


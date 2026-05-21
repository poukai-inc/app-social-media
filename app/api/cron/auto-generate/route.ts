import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import type { DatabaseSource } from '@/lib/models/Page';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import type { PostAngle } from '@/lib/models/Post';
import type { PageContentStrategy } from '@/lib/openai';
import { generatePostWithStrategy } from '@/lib/openai';
import mongoose from 'mongoose';
import type { ContentItem } from '@/lib/data-sources/database';
import { fetchContentForGeneration } from '@/lib/data-sources/database';
import type { PlatformType } from '@/lib/platforms/types';
import type {
  ReviewDecision} from '@/lib/learning';
import { 
  getPlatformLearningContext, 
  generateLearningPromptAdditions,
  getRecommendedAngle,
  getOptimalPostingTime,
  reviewContentForPublishing,
  meetsAutoPublishCriteria
} from '@/lib/learning';
import { withLock } from '@/lib/distributed-lock';
import { sendApprovalEmail, generateApprovalToken, getTokenExpiration } from '@/lib/email';
import { logger } from '@/lib/logger';

const log = logger.child('cron:auto-generate');

// This cron job runs daily to auto-generate posts for pages that have auto-generation enabled
// It checks each page's schedule and posting frequency to determine if a new post should be generated
// NEW: Uses per-platform learning to optimize content and timing

interface PlatformGenerationResult {
  platform: PlatformType;
  status: 'generated' | 'skipped' | 'failed';
  postId?: string;
  scheduledFor?: Date;
  error?: string;
  usedLearning: boolean;
  aiReview?: {
    decision: 'publish' | 'needs_revision' | 'reject';
    overallScore: number;
    reasoning: string;
  };
}

/**
 * Get the next occurrence of a specific day and hour
 */
function getNextOccurrence(dayOfWeek: number, hour: number, _timezone?: string): Date {
  const now = new Date();
  const result = new Date(now);
  
  // Set the hour
  result.setHours(hour, 0, 0, 0);
  
  // Calculate days until target day
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  
  if (daysUntil < 0 || (daysUntil === 0 && result <= now)) {
    daysUntil += 7; // Next week
  }
  
  result.setDate(result.getDate() + daysUntil);
  
  return result;
}

export async function GET(request: NextRequest) {
  // Verify cron secret for security
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
    'auto-generate',
    async () => {
      return await executeAutoGenerate();
    },
    { ttlSeconds: 600 } // 10 minute lock timeout
  );

  if (lockResult.skipped) {
    return NextResponse.json({
      success: false,
      skipped: true,
      message: 'Another instance is already running auto-generate',
    });
  }

  if (!lockResult.success) {
    return NextResponse.json(
      { error: lockResult.error || 'Auto-generate failed' },
      { status: 500 }
    );
  }

  return NextResponse.json(lockResult.result);
}

/**
 * Main auto-generate execution logic
 */
async function executeAutoGenerate() {
  try {
    // Find all active pages with auto-generate enabled
    const pages = await Page.find({
      isActive: true,
      'schedule.autoGenerate': true,
    }).populate('userId', 'email name');

    const results: Array<{
      pageId: string;
      pageName: string;
      action: string;
      postId?: string;
      platformResults?: PlatformGenerationResult[];
      error?: string;
    }> = [];

    const today = new Date();
    const currentDay = today.getDay(); // 0-6 (Sunday-Saturday)

    for (const page of pages) {
      try {
        // Check if today is a preferred posting day
        const preferredDays = page.schedule?.preferredDays || [1, 2, 3, 4, 5]; // Default to weekdays
        if (!preferredDays.includes(currentDay)) {
          results.push({
            pageId: page._id.toString(),
            pageName: page.name,
            action: 'skipped_wrong_day',
          });
          continue;
        }

        // Check posting frequency - how many posts this week?
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const postsThisWeek = await Post.countDocuments({
          pageId: page._id,
          createdAt: { $gte: weekStart },
          status: { $in: ['pending_approval', 'scheduled', 'published'] },
        });

        const targetFrequency = page.contentStrategy?.postingFrequency || 3;
        if (postsThisWeek >= targetFrequency) {
          results.push({
            pageId: page._id.toString(),
            pageName: page.name,
            action: 'skipped_frequency_met',
          });
          continue;
        }

        // REMOVED: Old check that prevented multi-platform posts on same day
        // We now check per-platform inside the loop instead

        // Get the user for this page
        const user = await User.findById(page.userId);
        if (!user) {
          results.push({
            pageId: page._id.toString(),
            pageName: page.name,
            action: 'skipped_user_not_found',
            error: 'User not found',
          });
          continue;
        }

        // Try to get content from data sources for inspiration
        let inspiration = '';
        let sourceContentItem: ContentItem | null = null;
        
        // Fetch page with dataSources using native MongoDB
        const pageWithDataSources = await mongoose.connection.db?.collection('pages').findOne({
          _id: page._id,
        });
        
        const dataSources = pageWithDataSources?.dataSources?.databases || [];
        const activeSource = dataSources.find((ds: DatabaseSource) => ds.isActive);
        
        if (activeSource) {
          try {
            // Get IDs of posts we've already generated from data sources
            const existingSourcePosts = await Post.find({
              pageId: page._id,
              'sourceContent.type': 'database',
            }).select('sourceContent.id');
            
            const usedIds = existingSourcePosts
              .map(p => p.sourceContent?.id)
              .filter(Boolean) as string[];
            
            // Fetch unused content from data source
            const fetchResult = await fetchContentForGeneration(activeSource as DatabaseSource, {
              limit: 10,
              randomize: true,
              unusedOnly: true,
              usedIds,
            });
            
            if (fetchResult.success && fetchResult.items && fetchResult.items.length > 0) {
              sourceContentItem = fetchResult.items[0];
              
              // Build inspiration from the content item
              inspiration = `
## Source Blog Post to Repurpose:

**Title:** ${sourceContentItem.title}

**Content:**
${sourceContentItem.body.slice(0, 3000)}

---
Transform this blog post into an engaging LinkedIn post. Extract the key insight or takeaway and present it in a way that's valuable for a LinkedIn audience. Don't just summarize - find the most interesting angle and lead with that.
`.trim();
            }
          } catch (dataSourceError) {
            log.error('Failed to fetch from data source', { pageId: page._id, error: dataSourceError instanceof Error ? dataSourceError.message : String(dataSourceError) });
            // Continue without data source - will generate from strategy only
          }
        }

        // Generate content using page strategy
        // NEW: Generate per-platform optimized content using learning
        // Get active platform connections to determine which platforms to generate for
        const activeConnections = page.connections?.filter((c: { isActive: boolean; platform: string }) => c.isActive) || [];
        const targetPlatforms = activeConnections.length > 0
          ? activeConnections.map((c: { isActive: boolean; platform: string }) => c.platform as PlatformType)
          : (page.publishTo?.platforms || ['linkedin']); // Fallback to publishTo or default
        
        const platformResults: PlatformGenerationResult[] = [];
        
        // Time boundaries for "today"
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        
        for (const platform of targetPlatforms as PlatformType[]) {
          try {
            // Check if we already created a post for THIS PLATFORM today
            const existingPlatformPost = await Post.findOne({
              pageId: page._id,
              targetPlatforms: platform,
              createdAt: { $gte: todayStart, $lte: todayEnd },
              status: { $in: ['pending_approval', 'scheduled', 'published'] },
            });

            if (existingPlatformPost) {
              log.info('Skipping platform, already created today', { platform, pageName: page.name });
              platformResults.push({
                platform,
                status: 'skipped',
                error: 'Post already created for this platform today',
                usedLearning: false,
              });
              continue;
            }

            // Get learning context for this specific platform
            const learningContext = await getPlatformLearningContext(page._id.toString(), platform);
            
            // Get recommended angle based on platform performance
            const recommendedAngle = learningContext.hasEnoughData && learningContext.topAngles.length > 0
              ? await getRecommendedAngle(
                  page._id.toString(),
                  platform,
                  page.contentStrategy?.preferredAngles || ['insight', 'war_story']
                )
              : undefined;
            
            // Build platform-specific inspiration with learning additions
            let platformInspiration = inspiration;
            if (learningContext.hasEnoughData) {
              platformInspiration += '\n\n' + generateLearningPromptAdditions(learningContext);
            }
            
            // Build content strategy with page type for proper voice (I vs We)
            const strategyWithPageType = {
              ...(page.contentStrategy || {}),
              pageType: page.pageType || 'personal', // Pass page type for voice selection
            } as PageContentStrategy;
            
            // Generate content optimized for this platform
            // RETRY LOOP: If AI reviewer rejects, regenerate with feedback (up to 3 attempts)
            const MAX_GENERATION_ATTEMPTS = 3;
            let generatedResult = { content: '', angle: '', topic: '' };
            let reviewDecision: ReviewDecision | null = null;
            let rejectionFeedback = '';

            for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
              // Build inspiration with rejection feedback from previous attempts
              let attemptInspiration = platformInspiration;
              if (rejectionFeedback) {
                attemptInspiration += `\n\n## IMPORTANT - YOUR PREVIOUS ATTEMPT WAS REJECTED:\n${rejectionFeedback}\n\nWrite something COMPLETELY DIFFERENT this time. Do NOT repeat the same patterns. Be more authentic, more opinionated, and avoid fabricated statistics.`;
              }

              generatedResult = await generatePostWithStrategy({
                strategy: strategyWithPageType,
                topic: sourceContentItem?.title ? `Repurposing: ${sourceContentItem.title}` : undefined,
                angle: attempt > 1 ? undefined : recommendedAngle, // Try different angle on retry
                inspiration: attemptInspiration,
                pageId: page._id.toString(),
                platform: platform as 'linkedin' | 'facebook' | 'twitter' | 'instagram',
              });

              // AI REVIEWER: Autonomous quality assessment and publish decision
              log.info('AI reviewing content', { platform, attempt, maxAttempts: MAX_GENERATION_ATTEMPTS });
              
              reviewDecision = await reviewContentForPublishing({
                content: generatedResult.content,
                platform,
                strategy: strategyWithPageType,
                topic: sourceContentItem?.title,
                angle: recommendedAngle,
                sourceContent: sourceContentItem ? {
                  title: sourceContentItem.title,
                  summary: sourceContentItem.body.slice(0, 500),
                } : undefined,
                recentPerformance: learningContext.hasEnoughData ? {
                  avgEngagement: learningContext.timingConfidence,
                  topPerformingAngles: learningContext.topAngles,
                  audiencePreferences: learningContext.platformTips,
                } : undefined,
              });

              log.info('AI review result', { platform, attempt, decision: reviewDecision.decision, score: reviewDecision.criteria.overallScore, confidence: reviewDecision.confidence });

              // If not rejected, break out of retry loop
              if (reviewDecision.decision !== 'reject') {
                break;
              }

              // Build feedback for next attempt
              rejectionFeedback = `REJECTION REASON: ${reviewDecision.reasoning}`;
              if (reviewDecision.suggestedRevisions?.length) {
                rejectionFeedback += `\nSUGGESTED FIXES: ${reviewDecision.suggestedRevisions.join('; ')}`;
              }
              if (reviewDecision.criteria.authenticity?.aiRedFlagsFound?.length) {
                rejectionFeedback += `\nAI RED FLAGS DETECTED: ${reviewDecision.criteria.authenticity.aiRedFlagsFound.join(', ')}`;
              }

              log.info('Attempt rejected', { platform, attempt, willRetry: attempt < MAX_GENERATION_ATTEMPTS });
            }

            // Use the final review decision (from last attempt)
            if (!reviewDecision) {
              throw new Error('No review decision generated');
            }

            // Build AI analysis from review
            const aiAnalysis = {
              angle: generatedResult.angle as PostAngle,
              confidence: reviewDecision.confidence,
              riskLevel: reviewDecision.criteria.riskAssessment.level === 'critical' ? 'high' as const :
                         reviewDecision.criteria.riskAssessment.level as 'low' | 'medium' | 'high',
              riskReasons: reviewDecision.criteria.riskAssessment.concerns,
              estimatedEngagement: reviewDecision.criteria.engagementPotential.score >= 7 ? 'high' as const :
                                   reviewDecision.criteria.engagementPotential.score >= 4 ? 'medium' as const : 'low' as const,
              aiReasoning: reviewDecision.reasoning,
              reviewScore: reviewDecision.criteria.overallScore,
              reviewDecision: reviewDecision.decision,
            };

            // AI DECIDES: Determine status based on AI review decision (fully autonomous)
            let status: 'pending_approval' | 'scheduled' | 'rejected' = 'pending_approval';
            let scheduledFor: Date | undefined;

            // Check if AI approved for automatic publishing
            const canAutoPublish = page.schedule?.autoApprove && meetsAutoPublishCriteria(reviewDecision);
            
            if (reviewDecision.decision === 'reject') {
              // AI rejected - mark as rejected, don't schedule
              status = 'rejected';
              log.info('AI rejected post', { platform, reasoning: reviewDecision.reasoning });
            } else if (reviewDecision.decision === 'publish' && canAutoPublish) {
              // AI approved and meets all thresholds - schedule automatically
              status = 'scheduled';
              
              // Determine optimal scheduling time
              const optimalTime = await getOptimalPostingTime(
                page._id.toString(),
                platform,
                page.schedule?.preferredDays
              );
              
              if (optimalTime && optimalTime.confidence > 0.5) {
                scheduledFor = getNextOccurrence(optimalTime.day, optimalTime.hour, page.schedule?.timezone);
                log.info('AI scheduled using learned optimal time', { platform, day: optimalTime.day, hour: optimalTime.hour });
              } else {
                // Use preferred times from settings
                const preferredTimes = page.schedule?.preferredTimes || ['09:00'];
                const preferredTime = preferredTimes[Math.floor(Math.random() * preferredTimes.length)];
                const [hours, minutes] = preferredTime.split(':').map(Number);
                
                scheduledFor = new Date(today);
                scheduledFor.setHours(hours, minutes, 0, 0);
                
                if (scheduledFor <= new Date()) {
                  scheduledFor.setDate(scheduledFor.getDate() + 1);
                }
              }
              
              log.info('AI auto-approved and scheduled', { platform, score: reviewDecision.criteria.overallScore });
            } else {
              // AI says needs revision OR auto-approve not enabled - needs human review
              status = 'pending_approval';
              log.info('AI flagged for human review', { platform, decision: reviewDecision.decision });
            }

            // Create the post with platform-specific targeting
            const post = await Post.create({
              userId: page.userId,
              pageId: page._id,
              content: generatedResult.content,
              status,
              mode: 'ai',
              postAs: page.type === 'organization' ? 'organization' : 'person',
              organizationId: page.organizationId,
              targetPlatforms: [platform], // Single platform per post for optimization
              scheduledFor,
              aiAnalysis,
              requiresApproval: status === 'pending_approval',
              approval: status === 'scheduled' ? {
                decision: 'approved',
                decidedAt: new Date(),
                decidedBy: 'ai-reviewer',
              } : status === 'rejected' ? {
                decision: 'rejected',
                decidedAt: new Date(),
                decidedBy: 'ai-reviewer',
                feedbackNote: reviewDecision.reasoning,
              } : {
                decision: 'pending',
              },
              // AI Review details
              aiReview: {
                decision: reviewDecision.decision,
                overallScore: reviewDecision.criteria.overallScore,
                confidence: reviewDecision.confidence,
                criteria: {
                  contentQuality: reviewDecision.criteria.contentQuality.score,
                  brandAlignment: reviewDecision.criteria.brandAlignment.score,
                  riskLevel: reviewDecision.criteria.riskAssessment.level,
                  riskConcerns: reviewDecision.criteria.riskAssessment.concerns,
                  engagementPotential: reviewDecision.criteria.engagementPotential.score,
                  platformFit: reviewDecision.criteria.platformFit.score,
                },
                reasoning: reviewDecision.reasoning,
                suggestedRevisions: reviewDecision.suggestedRevisions,
                reviewedAt: new Date(),
              },
              // Store source content reference if from data source
              ...(sourceContentItem && {
                sourceContent: {
                  id: sourceContentItem.id,
                  title: sourceContentItem.title,
                  type: 'database',
                  sourceId: activeSource?.id,
                  fetchedAt: new Date(),
                },
              }),
              // Store learning metadata
              learningMetadata: {
                usedLearning: learningContext.hasEnoughData,
                platform,
                recommendedAngle,
                timingSource: scheduledFor ? (
                  learningContext.hasEnoughData ? 'learned' : 'default'
                ) : undefined,
              },
            });

            platformResults.push({
              platform,
              status: reviewDecision.decision === 'publish' && status === 'scheduled' ? 'generated' : 'generated',
              postId: post._id.toString(),
              scheduledFor,
              usedLearning: learningContext.hasEnoughData,
              aiReview: {
                decision: reviewDecision.decision,
                overallScore: reviewDecision.criteria.overallScore,
                reasoning: reviewDecision.reasoning,
              },
            });

            // Send approval email if post needs human review
            if (status === 'pending_approval' && user?.email) {
              try {
                const approvalToken = generateApprovalToken();
                const tokenExpiration = getTokenExpiration();
                
                // Update post with approval token
                await Post.findByIdAndUpdate(post._id, {
                  'approval.token': approvalToken,
                  'approval.tokenExpiresAt': tokenExpiration,
                });
                
                // Send the email
                await sendApprovalEmail(user.email, {
                  postId: post._id.toString(),
                  postContent: generatedResult.content,
                  confidence: reviewDecision.confidence,
                  riskLevel: reviewDecision.criteria.riskAssessment.level === 'critical' ? 'high' :
                             reviewDecision.criteria.riskAssessment.level as 'low' | 'medium' | 'high',
                  riskReasons: reviewDecision.criteria.riskAssessment.concerns,
                  angle: generatedResult.angle,
                  aiReasoning: reviewDecision.reasoning,
                  scheduledFor,
                  includesLink: /https?:\/\//.test(generatedResult.content),
                  linkUrl: generatedResult.content.match(/https?:\/\/[^\s]+/)?.[0],
                  approvalToken,
                });
                
                log.info('Approval email sent', { postId: post._id, email: user.email });
              } catch (emailError) {
                log.error('Failed to send approval email', { error: emailError instanceof Error ? emailError.message : String(emailError) });
                // Don't fail the generation if email fails
              }
            }
            
          } catch (platformError) {
            log.error('Failed to generate for platform', { platform, error: platformError instanceof Error ? platformError.message : String(platformError) });
            platformResults.push({
              platform,
              status: 'failed',
              error: platformError instanceof Error ? platformError.message : 'Unknown error',
              usedLearning: false,
            });
          }
        }

        // Update page stats
        const successfulPosts = platformResults.filter(r => r.status === 'generated');
        if (successfulPosts.length > 0) {
          await Page.findByIdAndUpdate(page._id, {
            $inc: { 'stats.totalPosts': successfulPosts.length },
            lastGeneratedAt: new Date(),
          });
        }

        results.push({
          pageId: page._id.toString(),
          pageName: page.name,
          action: successfulPosts.length > 0 ? 'generated_per_platform' : 'failed_all_platforms',
          platformResults,
        });

      } catch (pageError) {
        log.error('Error processing page', { pageId: page._id, error: pageError instanceof Error ? pageError.message : String(pageError) });
        results.push({
          pageId: page._id.toString(),
          pageName: page.name,
          action: 'error',
          error: pageError instanceof Error ? pageError.message : 'Unknown error',
        });
      }
    }

    return {
      success: true,
      processed: pages.length,
      results,
    };

  } catch (error) {
    log.error('Auto-generate cron error', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

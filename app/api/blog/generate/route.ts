import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generatePostFromBlogAngle, type PostAngle } from '@/lib/openai';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Post from '@/lib/models/Post';
import { generateApprovalToken, getTokenExpiration, sendApprovalEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const log = logger.child('api:blog:generate');

// POST /api/blog/generate - Generate posts from a blog angle
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { 
      blogContent, 
      blogUrl,
      blogTitle,
      angle,
      hook,
      outline,
      includeLink = false,
      linkUrl,
      tone = 'professional',
      scheduledFor,
      autoSubmitForApproval = false,
    } = body;

    if (!blogContent || !angle || !hook || !outline) {
      return NextResponse.json(
        { error: 'blogContent, angle, hook, and outline are required' },
        { status: 400 }
      );
    }

    // Generate the post
    const { content, analysis } = await generatePostFromBlogAngle(
      blogContent,
      angle as PostAngle,
      hook,
      outline,
      { includeLink, linkUrl, tone }
    );

    // Determine if approval is needed
    const needsApproval = analysis.riskLevel === 'high' || 
                          includeLink || 
                          analysis.confidence < 0.7 ||
                          angle === 'opinionated_take';

    // Create the post
    const post = await Post.create({
      userId: user._id,
      mode: 'blog_repurpose',
      content,
      generatedContent: content,
      status: autoSubmitForApproval 
        ? (needsApproval ? 'pending_approval' : 'scheduled')
        : 'draft',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      aiAnalysis: {
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        riskReasons: analysis.riskReasons,
        angle: analysis.angle,
        estimatedEngagement: analysis.estimatedEngagement,
        suggestedTiming: analysis.suggestedTiming,
        aiReasoning: analysis.aiReasoning,
      },
      requiresApproval: needsApproval,
      includesLink: includeLink,
      linkUrl,
      blogSource: {
        url: blogUrl,
        title: blogTitle,
        extractedInsights: [],
        generatedAngles: [angle],
      },
      approval: needsApproval && autoSubmitForApproval ? {
        decision: 'pending',
        approvalToken: generateApprovalToken(),
        tokenExpiresAt: getTokenExpiration(),
      } : undefined,
    });

    // Send approval email if needed
    if (needsApproval && autoSubmitForApproval && post.approval?.approvalToken) {
      await sendApprovalEmail(session.user.email, {
        postId: post._id.toString(),
        postContent: content,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        riskReasons: analysis.riskReasons,
        angle: analysis.angle,
        aiReasoning: analysis.aiReasoning,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        includesLink: includeLink,
        linkUrl,
        approvalToken: post.approval.approvalToken,
      });
    }

    return NextResponse.json({
      success: true,
      post: {
        id: post._id,
        content,
        status: post.status,
        requiresApproval: needsApproval,
        analysis,
      },
    });
  } catch (error) {
    log.error('Post generation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to generate post' },
      { status: 500 }
    );
  }
}

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

    // Build the approval token before creating the post so we can reference it after
    const approvalTokenValue = needsApproval && autoSubmitForApproval ? generateApprovalToken() : null;

    // Build the aiAnalysis sub-document without undefined optional fields
    const aiAnalysisDoc: Record<string, unknown> = {
      confidence: analysis.confidence,
      riskLevel: analysis.riskLevel,
      angle: analysis.angle,
      estimatedEngagement: analysis.estimatedEngagement,
    };
    if (analysis.riskReasons !== undefined) aiAnalysisDoc.riskReasons = analysis.riskReasons;
    if (analysis.suggestedTiming !== undefined) aiAnalysisDoc.suggestedTiming = analysis.suggestedTiming;
    if (analysis.aiReasoning !== undefined) aiAnalysisDoc.aiReasoning = analysis.aiReasoning;

    // Build the create payload without undefined optional fields
    const createPayload: Record<string, unknown> = {
      userId: user._id,
      mode: 'blog_repurpose',
      content,
      generatedContent: content,
      status: autoSubmitForApproval
        ? (needsApproval ? 'pending_approval' : 'scheduled')
        : 'draft',
      aiAnalysis: aiAnalysisDoc,
      requiresApproval: needsApproval,
      includesLink: includeLink,
      linkUrl,
      blogSource: {
        url: blogUrl,
        title: blogTitle,
        extractedInsights: [],
        generatedAngles: [angle],
      },
    };
    if (scheduledFor !== undefined) createPayload.scheduledFor = new Date(scheduledFor);
    if (approvalTokenValue !== null) {
      createPayload.approval = {
        decision: 'pending',
        approvalToken: approvalTokenValue,
        tokenExpiresAt: getTokenExpiration(),
      };
    }

    // Create the post — cast because Mongoose's overloads don't resolve generics on
    // plain-object payloads and return `never`; the document is correct at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = (await Post.create(createPayload)) as any;

    // Send approval email if needed
    if (needsApproval && autoSubmitForApproval && approvalTokenValue) {
      const emailPayload: Parameters<typeof sendApprovalEmail>[1] = {
        postId: String(post._id),
        postContent: content,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        angle: analysis.angle,
        includesLink: includeLink,
        linkUrl,
        approvalToken: approvalTokenValue,
      };
      if (analysis.riskReasons !== undefined) emailPayload.riskReasons = analysis.riskReasons;
      if (analysis.aiReasoning !== undefined) emailPayload.aiReasoning = analysis.aiReasoning;
      if (scheduledFor !== undefined) emailPayload.scheduledFor = new Date(scheduledFor);
      await sendApprovalEmail(session.user.email, emailPayload);
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

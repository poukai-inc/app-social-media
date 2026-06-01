import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import type { CommentStatus } from '@/lib/models/CommentSuggestion';
import CommentSuggestion from '@/lib/models/CommentSuggestion';
import type { EngagementStyle } from '@/lib/openai';
import { generateComment, generateCommentVariations } from '@/lib/openai';
import { logger } from '@/lib/logger';

const log = logger.child('api:comments:suggestions');

// GET /api/comments/suggestions - Get pending comment suggestions
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate against allowed CommentStatus values before passing to Mongoose query
    const ALLOWED_COMMENT_STATUSES: ReadonlyArray<CommentStatus> = ['pending', 'approved', 'posted', 'skipped'];
    const status: CommentStatus = ALLOWED_COMMENT_STATUSES.includes(rawStatus as CommentStatus)
      ? (rawStatus as CommentStatus)
      : 'pending';

    const suggestions = await CommentSuggestion.find({
      userId: user._id,
      status,
    })
      .sort({ relevanceScore: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    // Get stats
    const stats = await CommentSuggestion.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts = stats.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {} as Record<string, number>);

    // Today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPosted = await CommentSuggestion.countDocuments({
      userId: user._id,
      status: 'posted',
      postedAt: { $gte: today },
    });

    return NextResponse.json({
      suggestions,
      statusCounts,
      todayPosted,
      dailyGoal: 10, // Per system.md: 5-10 comments/day
    });
  } catch (error) {
    log.error('Suggestions fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}

// POST /api/comments/suggestions - Create a new comment suggestion
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
      postContent,
      postAuthor,
      postAuthorHeadline,
      linkedinPostUrl,
      linkedinPostUrn,
      style = 'professional',
      source = 'feed',
      generateVariations = false,
    } = body;

    if (!postContent || !postAuthor) {
      return NextResponse.json(
        { error: 'postContent and postAuthor are required' },
        { status: 400 }
      );
    }

    // Generate comment(s)
    let suggestedComment: string;
    let alternativeComments: string[] | undefined;

    if (generateVariations) {
      const comments = await generateCommentVariations(
        {
          postContent,
          postAuthor,
          style: style as EngagementStyle,
        },
        3
      );
      suggestedComment = comments[0] ?? '';
      alternativeComments = comments.slice(1);
    } else {
      suggestedComment = await generateComment({
        postContent,
        postAuthor,
        style: style as EngagementStyle,
      });
    }

    // Calculate relevance score (basic heuristic - can be enhanced)
    // In production, you'd want to analyze against user's niche/interests
    const relevanceScore = calculateRelevanceScore(postContent, postAuthorHeadline);

    // Create suggestion
    const suggestion = await CommentSuggestion.create({
      userId: user._id,
      postContent,
      postContentSnippet: postContent.slice(0, 200) + (postContent.length > 200 ? '...' : ''),
      postAuthor,
      postAuthorHeadline,
      linkedinPostUrl,
      linkedinPostUrn,
      suggestedComment,
      ...(alternativeComments !== undefined && { alternativeComments }),
      relevanceScore,
      engagementPotential: relevanceScore >= 0.7 ? 'high' : relevanceScore >= 0.4 ? 'medium' : 'low',
      style,
      source,
      status: 'pending',
    });

    return NextResponse.json({
      success: true,
      suggestion,
    });
  } catch (error) {
    log.error('Suggestion creation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create suggestion' }, { status: 500 });
  }
}

// Basic relevance scoring - enhance based on your niche
function calculateRelevanceScore(postContent: string, authorHeadline?: string): number {
  const lowerContent = postContent.toLowerCase();
  const lowerHeadline = (authorHeadline || '').toLowerCase();
  
  // Keywords relevant to your target audience (founders, decision-makers)
  const targetKeywords = [
    'founder', 'ceo', 'cto', 'startup', 'building', 'product',
    'scale', 'growth', 'engineering', 'technical', 'architecture',
    'mvp', 'refactor', 'tech debt', 'team', 'hiring', 'leadership',
  ];

  let score = 0.3; // Base score

  // Check content relevance
  for (const keyword of targetKeywords) {
    if (lowerContent.includes(keyword)) score += 0.05;
    if (lowerHeadline.includes(keyword)) score += 0.1;
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

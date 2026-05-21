import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:performance');

// GET /api/posts/performance - Get performance overview for all posts
export async function GET(_request: NextRequest) {
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

    // Get published posts with performance data
    const posts = await Post.find({
      userId: user._id,
      status: 'published',
    })
      .sort({ publishedAt: -1 })
      .limit(50)
      .lean();

    // Calculate aggregate stats
    const postsWithPerformance = posts.filter(p => p.performance);
    const totalReactions = postsWithPerformance.reduce((sum, p) => sum + (p.performance?.reactions || 0), 0);
    const totalComments = postsWithPerformance.reduce((sum, p) => sum + (p.performance?.comments || 0), 0);
    const avgReactions = postsWithPerformance.length > 0 ? totalReactions / postsWithPerformance.length : 0;
    const avgComments = postsWithPerformance.length > 0 ? totalComments / postsWithPerformance.length : 0;

    // Performance by angle
    const byAngle = posts.reduce((acc, p) => {
      const angle = p.aiAnalysis?.angle || 'unknown';
      if (!acc[angle]) {
        acc[angle] = { count: 0, totalReactions: 0, totalComments: 0 };
      }
      acc[angle].count++;
      acc[angle].totalReactions += p.performance?.reactions || 0;
      acc[angle].totalComments += p.performance?.comments || 0;
      return acc;
    }, {} as Record<string, { count: number; totalReactions: number; totalComments: number }>);

    // Performance by includesLink
    const withLink = posts.filter(p => p.includesLink);
    const withoutLink = posts.filter(p => !p.includesLink);
    
    const linkPerformance = {
      withLink: {
        count: withLink.length,
        avgReactions: withLink.length > 0 
          ? withLink.reduce((sum, p) => sum + (p.performance?.reactions || 0), 0) / withLink.length 
          : 0,
      },
      withoutLink: {
        count: withoutLink.length,
        avgReactions: withoutLink.length > 0 
          ? withoutLink.reduce((sum, p) => sum + (p.performance?.reactions || 0), 0) / withoutLink.length 
          : 0,
      },
    };

    // Learning insights based on outcome ratings
    const ratedPosts = posts.filter(p => p.outcomeRating);
    const outcomeInsights = {
      total: ratedPosts.length,
      excellent: ratedPosts.filter(p => p.outcomeRating === 'excellent').length,
      good: ratedPosts.filter(p => p.outcomeRating === 'good').length,
      average: ratedPosts.filter(p => p.outcomeRating === 'average').length,
      poor: ratedPosts.filter(p => p.outcomeRating === 'poor').length,
    };

    // Confidence accuracy (compare AI confidence to actual outcome)
    const confidenceAccuracy = ratedPosts.map(p => ({
      confidence: p.aiAnalysis?.confidence || 0,
      outcome: p.outcomeRating,
      matched: (p.aiAnalysis?.confidence || 0) >= 0.7 
        ? ['good', 'excellent'].includes(p.outcomeRating || '')
        : ['poor', 'average'].includes(p.outcomeRating || ''),
    }));

    const accuracyRate = confidenceAccuracy.length > 0
      ? confidenceAccuracy.filter(c => c.matched).length / confidenceAccuracy.length
      : null;

    return NextResponse.json({
      overview: {
        totalPublished: posts.length,
        totalReactions,
        totalComments,
        avgReactions: Math.round(avgReactions * 10) / 10,
        avgComments: Math.round(avgComments * 10) / 10,
      },
      byAngle,
      linkPerformance,
      outcomeInsights,
      aiAccuracy: accuracyRate !== null ? Math.round(accuracyRate * 100) : null,
      recentPosts: posts.slice(0, 10).map(p => ({
        id: p._id,
        content: p.content.slice(0, 100) + '...',
        publishedAt: p.publishedAt,
        performance: p.performance,
        aiAnalysis: p.aiAnalysis,
        outcomeRating: p.outcomeRating,
        includesLink: p.includesLink,
      })),
    });
  } catch (error) {
    log.error('Performance overview error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch performance' }, { status: 500 });
  }
}

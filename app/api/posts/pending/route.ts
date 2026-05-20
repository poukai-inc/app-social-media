import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Post from '@/lib/models/Post';
import { logger } from '@/lib/logger';

const log = logger.child('api:posts:pending');

// GET /api/posts/pending - Get all posts pending approval
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

    const pendingPosts = await Post.find({
      userId: user._id,
      status: 'pending_approval',
    })
      .sort({ createdAt: -1 })
      .lean();

    // Get stats
    const stats = await Post.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = stats.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {} as Record<string, number>);

    // Get recent approval decisions for learning loop insights
    const recentDecisions = await Post.find({
      userId: user._id,
      'approval.decision': { $in: ['approved', 'rejected'] },
      'approval.decidedAt': { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    })
      .select('aiAnalysis approval')
      .sort({ 'approval.decidedAt': -1 })
      .limit(50)
      .lean();

    // Calculate approval patterns
    const approvalPatterns = {
      totalDecisions: recentDecisions.length,
      approved: recentDecisions.filter(p => p.approval?.decision === 'approved').length,
      rejected: recentDecisions.filter(p => p.approval?.decision === 'rejected').length,
      avgApprovedConfidence: 0,
      avgRejectedConfidence: 0,
    };

    const approvedPosts = recentDecisions.filter(p => p.approval?.decision === 'approved');
    const rejectedPosts = recentDecisions.filter(p => p.approval?.decision === 'rejected');

    if (approvedPosts.length > 0) {
      approvalPatterns.avgApprovedConfidence = 
        approvedPosts.reduce((sum, p) => sum + (p.aiAnalysis?.confidence || 0), 0) / approvedPosts.length;
    }
    if (rejectedPosts.length > 0) {
      approvalPatterns.avgRejectedConfidence = 
        rejectedPosts.reduce((sum, p) => sum + (p.aiAnalysis?.confidence || 0), 0) / rejectedPosts.length;
    }

    return NextResponse.json({
      posts: pendingPosts,
      statusCounts,
      approvalPatterns,
    });
  } catch (error) {
    log.error('Pending posts error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch pending posts' }, { status: 500 });
  }
}

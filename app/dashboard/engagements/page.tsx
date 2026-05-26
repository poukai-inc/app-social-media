import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import ICPEngagement from '@/lib/models/ICPEngagement';
import { EngagementTarget, CommentReply, EngagementSettings } from '@/lib/models/Engagement';
import Link from 'next/link';
import {
  Plus,
  MessageSquare,
  Heart,
  CheckCircle,
  Settings,
  MessageCircle,
  ThumbsUp,
  Zap,
  Twitter,
  ArrowRight,
  Target,
} from 'lucide-react';
import { EngagementCard } from '@/components/engagement-card';
import { ReplyCard } from '@/components/reply-card';

export default async function EngagementsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect('/login');
  }

  await connectToDatabase();
  
  const user = await User.findOne({ email: session.user.email });
  
  if (!user) {
    redirect('/login');
  }

  // Fetch engagement targets
  const engagements = await EngagementTarget.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Fetch comment replies
  const replies = await CommentReply.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Get settings
  let settings = await EngagementSettings.findOne({ userId: user._id });
  if (!settings) {
    settings = await EngagementSettings.create({ userId: user._id });
  }

  // Get user's pages for ICP stats
  const pages = await Page.find({ userId: user._id }).lean();
  const pageIds = pages.map(p => p._id);

  // Fetch ICP engagement stats (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const icpEngagements = await ICPEngagement.find({
    pageId: { $in: pageIds },
    engagedAt: { $gte: thirtyDaysAgo },
  }).lean();

  const icpStats = {
    total: icpEngagements.length,
    responses: icpEngagements.filter(e => ['got_reply', 'got_like', 'got_follow', 'conversation'].includes(e.status)).length,
    responseRate: icpEngagements.length > 0
      ? Math.round(
          (icpEngagements.filter(e => ['got_reply', 'got_like', 'got_follow', 'conversation'].includes(e.status)).length / 
          icpEngagements.length) * 100
        )
      : 0,
  };

  // Calculate stats
  const engagementStats = {
    total: engagements.length,
    pending: engagements.filter(e => e.status === 'pending' || e.status === 'approved').length,
    engaged: engagements.filter(e => e.status === 'engaged').length,
    failed: engagements.filter(e => e.status === 'failed').length,
  };

  const replyStats = {
    total: replies.length,
    pending: replies.filter(r => r.status === 'pending' || r.status === 'approved').length,
    replied: replies.filter(r => r.status === 'replied').length,
    failed: replies.filter(r => r.status === 'failed').length,
  };

  const serializedEngagements = engagements.map(e => ({
    _id: e._id.toString(),
    postUrl: e.postUrl,
    postUrn: e.postUrn,
    postAuthor: e.postAuthor,
    postContent: e.postContent,
    engagementType: e.engagementType,
    aiGeneratedComment: e.aiGeneratedComment,
    userEditedComment: e.userEditedComment,
    status: e.status,
    scheduledFor: e.scheduledFor?.toISOString(),
    engagedAt: e.engagedAt?.toISOString(),
    error: e.error,
    createdAt: e.createdAt.toISOString(),
  }));

  const serializedReplies = replies.map(r => ({
    _id: r._id.toString(),
    postId: r.postId?.toString(),
    linkedinPostUrn: r.linkedinPostUrn,
    commentUrn: r.commentUrn,
    commenterName: r.commenterName,
    commenterProfileUrl: r.commenterProfileUrl,
    commentText: r.commentText,
    aiGeneratedReply: r.aiGeneratedReply,
    userEditedReply: r.userEditedReply,
    status: r.status,
    repliedAt: r.repliedAt?.toISOString(),
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Engagements
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Auto-engage with posts and reply to comments
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/engagements/settings"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            href="/dashboard/engagements/add"
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--accent)]"
          >
            <Plus className="h-4 w-4" />
            Add Post
          </Link>
        </div>
      </div>

      {/* ICP Twitter Engagement Card */}
      <Link
        href="/dashboard/engagements/icp"
        className="mb-6 block rounded-xl border border-zinc-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 dark:border-zinc-800 dark:from-blue-950/30 dark:to-cyan-950/30 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#1DA1F2]/10 p-2">
              <Twitter className="h-5 w-5 text-[#1DA1F2]" />
            </div>
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                ICP Twitter Engagement
                <span className="px-2 py-0.5 rounded-full bg-[color:var(--surface)] text-[color:var(--accent)] text-xs">
                  NEW
                </span>
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {icpStats.total} engagements • {icpStats.responses} responses • {icpStats.responseRate}% response rate (30d)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                <Target className="h-4 w-4" />
                {icpStats.total}
              </span>
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <MessageCircle className="h-4 w-4" />
                {icpStats.responses}
              </span>
            </div>
            <ArrowRight className="h-5 w-5 text-zinc-400" />
          </div>
        </div>
      </Link>

      {/* Auto-engage Status */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${settings.autoEngageEnabled || settings.autoReplyEnabled ? 'bg-green-100 dark:bg-green-900' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
              <Zap className={`h-5 w-5 ${settings.autoEngageEnabled || settings.autoReplyEnabled ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'}`} />
            </div>
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                Auto-Engagement: {settings.autoEngageEnabled ? 'ON' : 'OFF'}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Auto-Reply: {settings.autoReplyEnabled ? 'ON' : 'OFF'} • 
                Approval: {settings.requireApproval ? 'Required' : 'Auto'}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/engagements/settings"
            className="text-sm font-medium text-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            Configure
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[color:var(--surface)] p-2">
              <ThumbsUp className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {engagementStats.pending}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Pending</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {engagementStats.engaged}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Engaged</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900">
              <MessageCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {replyStats.pending}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Replies Pending</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
              <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {replyStats.replied}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Replied</p>
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Queue Section */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Engagement Queue
          </h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {engagementStats.total} total
          </span>
        </div>
        
        {serializedEngagements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <Heart className="mx-auto h-10 w-10 text-zinc-400" />
            <h3 className="mt-3 text-base font-medium text-zinc-900 dark:text-zinc-100">
              No posts in queue
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Add LinkedIn post URLs to engage with them
            </p>
            <Link
              href="/dashboard/engagements/add"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--accent)]"
            >
              <Plus className="h-4 w-4" />
              Add Posts
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {serializedEngagements.slice(0, 10).map((engagement) => (
              <EngagementCard key={engagement._id} engagement={engagement} />
            ))}
            {serializedEngagements.length > 10 && (
              <p className="text-center text-sm text-zinc-500">
                And {serializedEngagements.length - 10} more...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Comment Replies Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Comment Replies
          </h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {replyStats.total} total
          </span>
        </div>
        
        {serializedReplies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <MessageSquare className="mx-auto h-10 w-10 text-zinc-400" />
            <h3 className="mt-3 text-base font-medium text-zinc-900 dark:text-zinc-100">
              No comments yet
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Comments on your published posts will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {serializedReplies.slice(0, 10).map((reply) => (
              <ReplyCard key={reply._id} reply={reply} />
            ))}
            {serializedReplies.length > 10 && (
              <p className="text-center text-sm text-zinc-500">
                And {serializedReplies.length - 10} more...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import ICPEngagement from '@/lib/models/ICPEngagement';
import Link from 'next/link';
import { 
  ArrowLeft,
  Twitter, 
  TrendingUp,
  MessageCircle,
  Heart,
  UserPlus,
  MessageSquare,
  BarChart3,
  Target,
  Clock,
  Filter,
} from 'lucide-react';
import { ICPEngagementCard } from '@/components/icp-engagement-card';

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function ICPEngagementsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.email) {
    redirect('/login');
  }

  await connectToDatabase();
  
  const user = await User.findOne({ email: session.user.email });
  
  if (!user) {
    redirect('/login');
  }

  // Get user's pages
  const pages = await Page.find({ userId: user._id }).lean();
  const pageIds = pages.map(p => p._id);

  // Parse query params
  const params = await searchParams;
  const statusFilter = params.status || 'all';
  const currentPage = parseInt(params.page || '1', 10);
  const pageSize = 20;

  // Build query
  const query: Record<string, unknown> = { pageId: { $in: pageIds } };
  if (statusFilter !== 'all') {
    query.status = statusFilter;
  }

  // Fetch ICP engagements with pagination
  const [engagements, totalCount] = await Promise.all([
    ICPEngagement.find(query)
      .sort({ engagedAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ICPEngagement.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Calculate stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentEngagements = await ICPEngagement.find({
    pageId: { $in: pageIds },
    engagedAt: { $gte: thirtyDaysAgo },
  }).lean();

  const stats = {
    total: recentEngagements.length,
    sent: recentEngagements.filter(e => e.status === 'sent').length,
    gotReply: recentEngagements.filter(e => e.status === 'got_reply' || e.status === 'conversation').length,
    gotLike: recentEngagements.filter(e => e.status === 'got_like').length,
    gotFollow: recentEngagements.filter(e => e.status === 'got_follow').length,
    avgRelevanceScore: recentEngagements.length > 0
      ? Math.round(recentEngagements.reduce((sum, e) => sum + (e.icpMatch?.relevanceScore || 0), 0) / recentEngagements.length * 10) / 10
      : 0,
    responseRate: recentEngagements.length > 0
      ? Math.round(
          (recentEngagements.filter(e => ['got_reply', 'got_like', 'got_follow', 'conversation'].includes(e.status)).length / 
          recentEngagements.length) * 100
        )
      : 0,
    dryRuns: recentEngagements.filter(e => e.dryRun).length,
  };

  // Serialize for client
  const serializedEngagements = engagements.map(e => ({
    _id: e._id.toString(),
    platform: e.platform,
    targetPost: e.targetPost,
    targetUser: e.targetUser,
    ourReply: e.ourReply,
    icpMatch: e.icpMatch,
    status: e.status,
    followUp: e.followUp,
    engagedAt: e.engagedAt?.toISOString() || new Date().toISOString(),
    dryRun: e.dryRun,
  }));

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'got_reply', label: 'Got Reply' },
    { value: 'got_like', label: 'Got Like' },
    { value: 'got_follow', label: 'Got Follow' },
    { value: 'conversation', label: 'Conversation' },
    { value: 'ignored', label: 'No Response' },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/engagements"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Engagements
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Twitter className="h-6 w-6 text-[#1DA1F2]" />
              ICP Twitter Engagement
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Automated engagement with your ideal customer profile on Twitter
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[color:var(--surface)] p-2">
              <Target className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.total}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total (30d)</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
              <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.gotReply}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Got Replies</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900">
              <Heart className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.gotLike}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Got Likes</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900">
              <UserPlus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.gotFollow}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Got Follows</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900">
              <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {stats.responseRate}%
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Response Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="mb-6 flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <BarChart3 className="h-4 w-4" />
          Avg Relevance: <strong className="text-zinc-900 dark:text-zinc-100">{stats.avgRelevanceScore}/10</strong>
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          Dry Runs: <strong className="text-zinc-900 dark:text-zinc-100">{stats.dryRuns}</strong>
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="h-4 w-4" />
          Awaiting Response: <strong className="text-zinc-900 dark:text-zinc-100">{stats.sent}</strong>
        </span>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Filter:</span>
          <div className="flex gap-1">
            {statusOptions.map(option => (
              <Link
                key={option.value}
                href={`/dashboard/engagements/icp?status=${option.value}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === option.value
                    ? 'bg-[color:var(--accent)] text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {totalCount} engagement{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Engagements List */}
      <div className="space-y-4">
        {serializedEngagements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <Twitter className="mx-auto h-12 w-12 text-zinc-400" />
            <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
              No ICP engagements yet
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              The ICP engagement agent will automatically find and engage with 
              tweets from your ideal customers. Run the agent to start engaging.
            </p>
          </div>
        ) : (
          <>
            {serializedEngagements.map((engagement) => (
              <ICPEngagementCard key={engagement._id} engagement={engagement} />
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {currentPage > 1 && (
            <Link
              href={`/dashboard/engagements/icp?status=${statusFilter}&page=${currentPage - 1}`}
              className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 text-sm font-medium"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`/dashboard/engagements/icp?status=${statusFilter}&page=${currentPage + 1}`}
              className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 text-sm font-medium"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

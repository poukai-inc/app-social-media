'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:pages:[id]');
import {
  ArrowLeft,
  Settings,
  Plus,
  User,
  Building2,
  Clock,
  CheckCircle,
  Edit3,
  FileText,
  TrendingUp,
  Eye,
  ThumbsUp,
  MessageSquare,
  Share2,
  Sparkles,
  Calendar,
  RefreshCw,
  MoreVertical,
  Linkedin,
  Facebook,
  Twitter,
  X,
  Expand,
  RotateCcw,
  ExternalLink,
  Loader2,
  Target,
  MessageCircle,
  Heart,
  UserPlus,
  ArrowRight,
  Trash2,
} from 'lucide-react';

interface PlatformConnection {
  platform: 'linkedin' | 'facebook' | 'twitter';
  platformId?: string;
  platformUsername?: string;
  isActive: boolean;
  connectedAt?: string;
}

interface Page {
  _id: string;
  type: 'personal' | 'organization' | 'manual';
  linkedinId?: string;
  organizationId?: string;
  name: string;
  avatar?: string;
  vanityName?: string;
  isManual?: boolean;
  connections?: PlatformConnection[];
  contentStrategy: {
    persona: string;
    topics: string[];
    tone: string;
    targetAudience: string;
    postingFrequency: number;
    preferredAngles: string[];
  };
  schedule: {
    timezone: string;
    preferredDays: number[];
    preferredTimes: string[];
    autoGenerate: boolean;
    autoApprove: boolean;
  };
  stats: {
    totalPosts: number;
    totalImpressions: number;
    totalEngagements: number;
    avgEngagementRate: number;
  };
  isActive: boolean;
  createdAt: string;
}

interface PlatformResult {
  platform: string;
  status: 'pending' | 'published' | 'failed';
  postId?: string;
  postUrl?: string;
  publishedAt?: string;
  error?: string;
}

interface Post {
  _id: string;
  content: string;
  status: 'pending_approval' | 'scheduled' | 'published' | 'failed' | 'draft' | 'rejected';
  confidenceScore?: number;
  scheduledFor?: string;
  publishedAt?: string;
  targetPlatforms?: string[];
  platformResults?: PlatformResult[];
  metrics?: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PageDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const pageId = params.id as string;

  const [page, setPage] = useState<Page | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [generating, setGenerating] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [postCounts, setPostCounts] = useState({
    pending: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  });
  const [icpStats, setIcpStats] = useState<{
    total: number;
    gotReply: number;
    gotLike: number;
    gotFollow: number;
    responseRate: number;
    recentEngagements: Array<{
      id: string;
      targetUser: { username?: string; name?: string };
      ourReply: { content: string };
      status: string;
      engagedAt: string;
    }>;
  } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session && pageId) {
      fetchPage();
      fetchPosts();
      fetchIcpStats();
    }
  }, [session, pageId, statusFilter]);

  const fetchPage = async () => {
    try {
      const response = await fetch(`/api/pages/${pageId}`);
      if (response.ok) {
        const data = await response.json();
        setPage(data.page);
      } else if (response.status === 404) {
        router.push('/dashboard/pages');
      }
    } catch (error) {
      log.error('Failed to fetch page', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    setPostsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('limit', '10');

      const response = await fetch(`/api/pages/${pageId}/posts?${params}`);
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
        setPostCounts(data.counts || {
          pending: 0,
          scheduled: 0,
          published: 0,
          failed: 0,
        });
      }
    } catch (error) {
      log.error('Failed to fetch posts', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setPostsLoading(false);
    }
  };

  const fetchIcpStats = async () => {
    try {
      const response = await fetch(`/api/icp-engagement?pageId=${pageId}`);
      if (response.ok) {
        const data = await response.json();
        setIcpStats({
          total: data.stats?.total || 0,
          gotReply: data.stats?.gotReply || 0,
          gotLike: data.stats?.gotLike || 0,
          gotFollow: data.stats?.gotFollow || 0,
          responseRate: data.stats?.total > 0
            ? Math.round(((data.stats?.gotReply || 0) + (data.stats?.gotLike || 0) + (data.stats?.gotFollow || 0)) / data.stats.total * 100)
            : 0,
          recentEngagements: data.recentEngagements || [],
        });
      }
    } catch (error) {
      log.error('Failed to fetch ICP stats', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleGeneratePost = async () => {
    if (!page) return;
    setGenerating(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: page._id,
          usePageStrategy: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Redirect to edit the new post
        router.push(`/dashboard/edit/${data.post._id}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to generate post');
      }
    } catch (error) {
      log.error('Failed to generate', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to generate post');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprovePost = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (response.ok) {
        await fetchPosts();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to approve post');
      }
    } catch (error) {
      log.error('Failed to approve', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to approve post');
    }
  };

  const handleRejectPost = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (response.ok) {
        await fetchPosts();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to reject post');
      }
    } catch (error) {
      log.error('Failed to reject', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to reject post');
    }
  };

  const handleRetryPost = async (postId: string) => {
    setRetrying(postId);
    try {
      const response = await fetch(`/api/posts/${postId}/retry`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh posts to show updated status
        await fetchPosts();
        // Close modal if open
        if (selectedPost?._id === postId) {
          const updatedResponse = await fetch(`/api/posts/${postId}`);
          if (updatedResponse.ok) {
            const data = await updatedResponse.json();
            setSelectedPost(data.post);
          }
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to retry post');
      }
    } catch (error) {
      log.error('Failed to retry', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to retry post');
    } finally {
      setRetrying(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Close modal if open
        if (selectedPost?._id === postId) {
          setSelectedPost(null);
        }
        // Refresh posts list
        await fetchPosts();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete post');
      }
    } catch (error) {
      log.error('Failed to delete', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to delete post');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <p className="text-gray-500">Page not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/pages"
            className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            All Pages
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {page.avatar ? (
                <img
                  src={page.avatar}
                  alt={page.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  {page.type === 'personal' ? (
                    <User className="h-8 w-8 text-white" />
                  ) : (
                    <Building2 className="h-8 w-8 text-white" />
                  )}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {page.name}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 capitalize">
                  {page.isManual ? 'Manual' : page.type} Profile
                  {page.vanityName && ` • @${page.vanityName}`}
                </p>
                {/* Connected Platforms */}
                <div className="flex items-center gap-2 mt-2">
                  {page.connections?.filter(c => c.isActive).map((conn) => (
                    <div
                      key={conn.platform}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        conn.platform === 'linkedin'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : conn.platform === 'facebook'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                      }`}
                    >
                      {conn.platform === 'linkedin' && <Linkedin className="h-3 w-3" />}
                      {conn.platform === 'facebook' && <Facebook className="h-3 w-3" />}
                      {conn.platform === 'twitter' && <Twitter className="h-3 w-3" />}
                      <span className="capitalize">{conn.platformUsername || conn.platform}</span>
                      <CheckCircle className="h-3 w-3" />
                    </div>
                  ))}
                  {(!page.connections || page.connections.filter(c => c.isActive).length === 0) && (
                    <Link
                      href={`/dashboard/pages/${page._id}/settings`}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      No platforms connected - Click to connect
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGeneratePost}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
              >
                {generating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Post
              </button>
              <Link
                href={`/dashboard/create?pageId=${page._id}`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create Post
              </Link>
              <Link
                href={`/dashboard/pages/${page._id}/settings`}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-sm">Impressions</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {page.stats?.totalImpressions?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <ThumbsUp className="h-4 w-4" />
              <span className="text-sm">Engagements</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {page.stats?.totalEngagements?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Engagement Rate</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {((page.stats?.avgEngagementRate || 0) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-sm">Total Posts</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {page.stats?.totalPosts || 0}
            </div>
          </div>
        </div>

        {/* ICP Twitter Engagement */}
        {icpStats && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Twitter className="h-5 w-5 text-[#1DA1F2]" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  ICP Twitter Engagement
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
                  30 days
                </span>
              </div>
              <Link
                href="/dashboard/engagements/icp"
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* ICP Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
                <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                  <Target className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {icpStats.total}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Outreach</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
                <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {icpStats.gotReply}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Replies</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
                <div className="flex items-center justify-center gap-1 text-purple-500 mb-1">
                  <Heart className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {icpStats.gotLike}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Likes</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
                <div className="flex items-center justify-center gap-1 text-emerald-500 mb-1">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {icpStats.gotFollow}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Follows</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
                <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {icpStats.responseRate}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Response Rate</div>
              </div>
            </div>

            {/* Recent Engagements Preview */}
            {icpStats.recentEngagements.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                  Recent Engagements
                </h3>
                <div className="space-y-2">
                  {icpStats.recentEngagements.slice(0, 3).map((engagement) => (
                    <div
                      key={engagement.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-zinc-800"
                    >
                      <Twitter className="h-4 w-4 text-[#1DA1F2] flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            @{engagement.targetUser.username || 'unknown'}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            engagement.status === 'got_reply' || engagement.status === 'conversation'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : engagement.status === 'got_like'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                              : engagement.status === 'got_follow'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400'
                          }`}>
                            {engagement.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-1 mt-1">
                          {engagement.ourReply.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Twitter className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No ICP engagements yet. The agent will find and engage with your ideal customers on Twitter.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Strategy Summary */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Content Strategy
            </h2>
            <Link
              href={`/dashboard/pages/${page._id}/settings`}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Edit
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Persona
              </h3>
              <p className="text-gray-900 dark:text-white">
                {page.contentStrategy?.persona || 'Not set'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Target Audience
              </h3>
              <p className="text-gray-900 dark:text-white">
                {page.contentStrategy?.targetAudience || 'Not set'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Tone
              </h3>
              <p className="text-gray-900 dark:text-white">
                {page.contentStrategy?.tone || 'Not set'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Topics
              </h3>
              <div className="flex flex-wrap gap-1">
                {page.contentStrategy?.topics?.length ? (
                  page.contentStrategy.topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-sm"
                    >
                      {topic}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">No topics specified</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">
                  {page.contentStrategy?.postingFrequency || 3}x per week
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">
                  {page.schedule?.preferredDays?.map((d) => DAYS[d]).join(', ') || 'Weekdays'}
                </span>
              </div>
              {page.schedule?.autoGenerate && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                  <Sparkles className="h-3 w-3" />
                  Auto-generate
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Posts */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800">
          <div className="p-4 border-b border-gray-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Posts</h2>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="all">All ({postCounts ? Object.values(postCounts).reduce((a, b) => a + b, 0) : 0})</option>
                  <option value="pending">Pending ({postCounts?.pending ?? 0})</option>
                  <option value="scheduled">Scheduled ({postCounts?.scheduled ?? 0})</option>
                  <option value="published">Published ({postCounts?.published ?? 0})</option>
                  <option value="failed">Failed ({postCounts?.failed ?? 0})</option>
                </select>
              </div>
            </div>
          </div>

          {postsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                No posts yet for this page
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleGeneratePost}
                  disabled={generating}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700"
                >
                  Generate First Post
                </button>
                <Link
                  href={`/dashboard/create?pageId=${page._id}`}
                  className="px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  Create Manually
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-zinc-800">
              {posts.map((post) => (
                <div key={post._id} className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-white line-clamp-2">
                        {post.content.substring(0, 200)}
                        {post.content.length > 200 && '...'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded capitalize ${
                            post.status === 'published'
                              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                              : post.status === 'scheduled'
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                              : post.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                              : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                          }`}
                        >
                          {post.status}
                        </span>
                        
                        {/* Platform badges */}
                        {post.targetPlatforms && post.targetPlatforms.length > 0 && (
                          <div className="flex items-center gap-1">
                            {post.targetPlatforms.map((platform) => {
                              const result = post.platformResults?.find(r => r.platform === platform);
                              const isSuccess = result?.status === 'published';
                              const isFailed = result?.status === 'failed';
                              
                              return (
                                <span
                                  key={platform}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                                    isSuccess
                                      ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                      : isFailed
                                      ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                      : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300'
                                  }`}
                                  title={result?.error || `${platform}: ${result?.status || 'pending'}`}
                                >
                                  {platform === 'facebook' && <Facebook className="h-3 w-3" />}
                                  {platform === 'twitter' && <Twitter className="h-3 w-3" />}
                                  {platform === 'linkedin' && <Linkedin className="h-3 w-3" />}
                                  {isSuccess && <CheckCircle className="h-2.5 w-2.5" />}
                                  {isFailed && <span className="text-[10px]">✕</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        
                        {post.confidenceScore !== undefined && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {(post.confidenceScore * 100).toFixed(0)}% confidence
                          </span>
                        )}
                        {post.scheduledFor && (
                          <span className="text-gray-500 dark:text-gray-400">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(post.scheduledFor).toLocaleDateString()}
                          </span>
                        )}
                        {post.metrics && (
                          <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <span><Eye className="h-3 w-3 inline" /> {post.metrics.impressions}</span>
                            <span><ThumbsUp className="h-3 w-3 inline" /> {post.metrics.likes}</span>
                            <span><MessageSquare className="h-3 w-3 inline" /> {post.metrics.comments}</span>
                          </span>
                        )}
                      </div>
                      
                      {/* Platform error details */}
                      {post.platformResults?.some(r => r.status === 'failed') && (
                        <div className="mt-2 space-y-1">
                          {post.platformResults.filter(r => r.status === 'failed').map((result) => (
                            <p key={result.platform} className="text-xs text-red-500 dark:text-red-400 flex items-start gap-1">
                              {result.platform === 'facebook' && <Facebook className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                              {result.platform === 'twitter' && <Twitter className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                              {result.platform === 'linkedin' && <Linkedin className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                              <span className="truncate">{result.error}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      {post.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => handleApprovePost(post._id)}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                            title="Approve post"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleRejectPost(post._id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                            title="Reject post"
                          >
                            ✗ Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setSelectedPost(post)}
                        className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="View full post"
                      >
                        <Expand className="h-4 w-4" />
                      </button>
                      {(post.status === 'failed' || post.platformResults?.some(r => r.status === 'failed')) && (
                        <button
                          onClick={() => handleRetryPost(post._id)}
                          disabled={retrying === post._id}
                          className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50"
                          title="Retry publishing"
                        >
                          {retrying === post._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <Link
                        href={`/dashboard/edit/${post._id}`}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Edit post"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDeletePost(post._id)}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {posts.length > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-zinc-800 text-center">
              <Link
                href={`/dashboard/scheduled?pageId=${page._id}`}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                View all posts →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded capitalize text-sm ${
                    selectedPost.status === 'published'
                      ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                      : selectedPost.status === 'scheduled'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : selectedPost.status === 'failed'
                      ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                      : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                  }`}
                >
                  {selectedPost.status}
                </span>
                {selectedPost.confidenceScore !== undefined && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {(selectedPost.confidenceScore * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                {selectedPost.content}
              </p>
            </div>

            {/* Platform Results */}
            {selectedPost.platformResults && selectedPost.platformResults.length > 0 && (
              <div className="px-4 pb-4 space-y-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Platform Status</h4>
                {selectedPost.platformResults.map((result) => (
                  <div
                    key={result.platform}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      result.status === 'published'
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : result.status === 'failed'
                        ? 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-gray-50 dark:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {result.platform === 'facebook' && <Facebook className="h-4 w-4" />}
                      {result.platform === 'twitter' && <Twitter className="h-4 w-4" />}
                      {result.platform === 'linkedin' && <Linkedin className="h-4 w-4" />}
                      <span className="capitalize font-medium">{result.platform}</span>
                      {result.status === 'published' && (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {result.status === 'published' && result.postUrl && (
                        <a
                          href={result.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {result.status === 'failed' && (
                        <span className="text-sm text-red-600 dark:text-red-400 max-w-xs truncate" title={result.error}>
                          {result.error}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {selectedPost.scheduledFor && (
                  <span>
                    <Clock className="h-3 w-3 inline mr-1" />
                    Scheduled: {new Date(selectedPost.scheduledFor).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(selectedPost.status === 'failed' || selectedPost.platformResults?.some(r => r.status === 'failed')) && (
                  <button
                    onClick={() => handleRetryPost(selectedPost._id)}
                    disabled={retrying === selectedPost._id}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    {retrying === selectedPost._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Retry Publishing
                  </button>
                )}
                <Link
                  href={`/dashboard/edit/${selectedPost._id}`}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Post
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

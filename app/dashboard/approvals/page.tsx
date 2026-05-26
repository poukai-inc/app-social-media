'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { Button } from '@poukai-inc/ui/atoms/Button';

const log = logger.child('dashboard:approvals');

interface AIAnalysis {
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskReasons?: string[];
  angle: string;
  estimatedEngagement: 'low' | 'medium' | 'high';
  aiReasoning?: string;
}

interface Post {
  _id: string;
  content: string;
  status: string;
  scheduledFor?: string;
  createdAt: string;
  aiAnalysis?: AIAnalysis;
  includesLink: boolean;
  linkUrl?: string;
  blogSource?: {
    url: string;
    title?: string;
  };
}

interface ApprovalPatterns {
  totalDecisions: number;
  approved: number;
  rejected: number;
  avgApprovedConfidence: number;
  avgRejectedConfidence: number;
}

function ApprovalsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [patterns, setPatterns] = useState<ApprovalPatterns | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const info = searchParams.get('info');
    if (success) return { type: 'success', text: success };
    if (error) return { type: 'error', text: error };
    if (info) return { type: 'info', text: info };
    return null;
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchPendingPosts = async () => {
    try {
      const response = await fetch('/api/posts/pending');
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts);
        setStatusCounts(data.statusCounts);
        setPatterns(data.approvalPatterns);
      }
    } catch (error) {
      log.error('Failed to fetch pending posts', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      setTimeout(() => fetchPendingPosts(), 0);
    }
  }, [session]); // fetchPendingPosts is stable (defined in component scope)

  const handleAction = async (postId: string, action: 'approve' | 'reject') => {
    setActionLoading(postId);
    try {
      const response = await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        setMessage({
          type: 'success',
          text: action === 'approve' ? 'Post approved and scheduled!' : 'Post rejected',
        });
        fetchPendingPosts();
      } else {
        setMessage({ type: 'error', text: 'Failed to process action' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setActionLoading(null);
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-[color:var(--surface)] text-[color:var(--fg)] border-[color:var(--hairline)]';
    }
  };

  const getAngleLabel = (angle: string) => {
    return angle.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--accent)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[color:var(--fg)]">Pending Approvals</h1>
            <p className="text-[color:var(--fg-muted)] mt-1">Review and approve AI-generated posts</p>
          </div>
          <Link
            href="/dashboard"
            className="text-[color:var(--accent)] hover:text-[color:var(--accent)] font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
              message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-[color:var(--accent-glow)] text-[color:var(--accent)] border border-[color:var(--accent)]'
            }`}
          >
            {message.text}
            <button
              onClick={() => setMessage(null)}
              className="float-right font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-[color:var(--bg-elevated)] p-4 rounded-lg shadow-sm border border-[color:var(--hairline)]">
            <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending_approval || 0}</div>
            <div className="text-sm text-[color:var(--fg-muted)]">Pending</div>
          </div>
          <div className="bg-[color:var(--bg-elevated)] p-4 rounded-lg shadow-sm border border-[color:var(--hairline)]">
            <div className="text-2xl font-bold text-[color:var(--accent)]">{statusCounts.scheduled || 0}</div>
            <div className="text-sm text-[color:var(--fg-muted)]">Scheduled</div>
          </div>
          <div className="bg-[color:var(--bg-elevated)] p-4 rounded-lg shadow-sm border border-[color:var(--hairline)]">
            <div className="text-2xl font-bold text-green-600">{statusCounts.published || 0}</div>
            <div className="text-sm text-[color:var(--fg-muted)]">Published</div>
          </div>
          <div className="bg-[color:var(--bg-elevated)] p-4 rounded-lg shadow-sm border border-[color:var(--hairline)]">
            <div className="text-2xl font-bold text-[color:var(--fg-muted)]">{statusCounts.draft || 0}</div>
            <div className="text-sm text-[color:var(--fg-muted)]">Drafts</div>
          </div>
          <div className="bg-[color:var(--bg-elevated)] p-4 rounded-lg shadow-sm border border-[color:var(--hairline)]">
            <div className="text-2xl font-bold text-red-600">{statusCounts.rejected || 0}</div>
            <div className="text-sm text-[color:var(--fg-muted)]">Rejected</div>
          </div>
        </div>

        {/* Learning Patterns */}
        {patterns && patterns.totalDecisions > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-[color:var(--accent)] mb-8">
            <h3 className="font-semibold text-[color:var(--accent)] mb-3">📊 Learning Insights (Last 30 Days)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-[color:var(--accent)]">Decisions Made:</span>
                <span className="ml-2 font-semibold">{patterns.totalDecisions}</span>
              </div>
              <div>
                <span className="text-green-700">Approved:</span>
                <span className="ml-2 font-semibold">{patterns.approved}</span>
              </div>
              <div>
                <span className="text-red-700">Rejected:</span>
                <span className="ml-2 font-semibold">{patterns.rejected}</span>
              </div>
              <div>
                <span className="text-[color:var(--fg-muted)]">Approval Rate:</span>
                <span className="ml-2 font-semibold">
                  {Math.round((patterns.approved / patterns.totalDecisions) * 100)}%
                </span>
              </div>
            </div>
            {patterns.avgApprovedConfidence > 0 && (
              <p className="mt-3 text-sm text-[color:var(--accent)]">
                💡 Approved posts average {Math.round(patterns.avgApprovedConfidence * 100)}% confidence
                {patterns.avgRejectedConfidence > 0 && 
                  `, rejected average ${Math.round(patterns.avgRejectedConfidence * 100)}%`}
              </p>
            )}
          </div>
        )}

        {/* Pending Posts */}
        {posts.length === 0 ? (
          <div className="bg-[color:var(--bg-elevated)] rounded-lg shadow-sm border border-[color:var(--hairline)] p-12 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-xl font-semibold text-[color:var(--fg)] mb-2">All caught up!</h3>
            <p className="text-[color:var(--fg-muted)] mb-6">No posts pending approval</p>
            <Button asChild variant="primary">
              <Link href="/dashboard/create">
                Create New Post
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <div key={post._id} className="bg-[color:var(--bg-elevated)] rounded-lg shadow-sm border border-[color:var(--hairline)] overflow-hidden">
                {/* Post Header */}
                <div className="px-6 py-4 bg-[color:var(--surface)] border-b border-[color:var(--hairline)] flex flex-wrap items-center gap-3">
                  {/* Confidence */}
                  {post.aiAnalysis && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-[color:var(--surface)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            post.aiAnalysis.confidence >= 0.7 ? 'bg-green-500' :
                            post.aiAnalysis.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${post.aiAnalysis.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {Math.round(post.aiAnalysis.confidence * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Risk Badge */}
                  {post.aiAnalysis?.riskLevel && (
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRiskBadgeColor(post.aiAnalysis.riskLevel)}`}>
                      {post.aiAnalysis.riskLevel.toUpperCase()} RISK
                    </span>
                  )}

                  {/* Angle */}
                  {post.aiAnalysis?.angle && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[color:var(--surface)] text-[color:var(--accent)] border border-[color:var(--accent)]">
                      {getAngleLabel(post.aiAnalysis.angle)}
                    </span>
                  )}

                  {/* Link indicator */}
                  {post.includesLink && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      🔗 Contains Link
                    </span>
                  )}

                  {/* Blog source */}
                  {post.blogSource?.url && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[color:var(--surface)] text-[color:var(--fg-muted)] border border-[color:var(--hairline)]">
                      📝 From Blog
                    </span>
                  )}
                </div>

                {/* AI Reasoning */}
                {post.aiAnalysis?.aiReasoning && (
                  <div className="px-6 py-3 bg-[color:var(--accent-glow)] border-b text-sm text-[color:var(--accent)]">
                    <strong>🤖 AI:</strong> {post.aiAnalysis.aiReasoning}
                  </div>
                )}

                {/* Risk Reasons */}
                {post.aiAnalysis?.riskReasons && post.aiAnalysis.riskReasons.length > 0 && (
                  <div className="px-6 py-3 bg-yellow-50 border-b text-sm text-yellow-800">
                    <strong>⚠️ Risk factors:</strong> {post.aiAnalysis.riskReasons.join(' • ')}
                  </div>
                )}

                {/* Content */}
                <div className="px-6 py-4">
                  <pre className="whitespace-pre-wrap font-sans text-[color:var(--fg)] text-sm leading-relaxed">
                    {post.content}
                  </pre>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[color:var(--surface)] border-t border-[color:var(--hairline)] flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-[color:var(--fg-muted)]">
                    {post.scheduledFor && (
                      <span>
                        ⏰ Scheduled: {new Date(post.scheduledFor).toLocaleString()}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAction(post._id, 'approve')}
                      disabled={actionLoading === post._id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                    >
                      {actionLoading === post._id ? '...' : '✓ Approve'}
                    </button>
                    <Button asChild variant="primary">
                      <Link href={`/dashboard/edit/${post._id}`}>
                        ✏️ Edit
                      </Link>
                    </Button>
                    <button
                      onClick={() => handleAction(post._id, 'reject')}
                      disabled={actionLoading === post._id}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                    >
                      {actionLoading === post._id ? '...' : '✗ Reject'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--accent)]"></div>
      </div>
    }>
      <ApprovalsContent />
    </Suspense>
  );
}

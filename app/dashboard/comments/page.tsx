'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:comments');

interface CommentSuggestion {
  _id: string;
  postAuthor: string;
  postAuthorHeadline?: string;
  postContentSnippet: string;
  postContent: string;
  linkedinPostUrl?: string;
  suggestedComment: string;
  alternativeComments?: string[];
  editedComment?: string;
  relevanceScore: number;
  engagementPotential: 'low' | 'medium' | 'high';
  style: string;
  status: string;
  source: string;
  createdAt: string;
}

export default function CommentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [suggestions, setSuggestions] = useState<CommentSuggestion[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [todayPosted, setTodayPosted] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'posted'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Add comment form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostAuthor, setNewPostAuthor] = useState('');
  const [newPostUrl, setNewPostUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [editingSuggestion, setEditingSuggestion] = useState<CommentSuggestion | null>(null);
  const [editedComment, setEditedComment] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchSuggestions = async (tab: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/comments/suggestions?status=${tab}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions);
        setStatusCounts(data.statusCounts);
        setTodayPosted(data.todayPosted);
        setDailyGoal(data.dailyGoal);
      }
    } catch (error) {
      log.error('Failed to fetch suggestions', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      setTimeout(() => fetchSuggestions(activeTab), 0);
    }
  }, [session, activeTab]);

  const handleAction = async (
    id: string,
    action: 'approve' | 'skip' | 'posted' | 'regenerate',
    extra?: { editedComment?: string; skippedReason?: string }
  ) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/comments/suggestions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });

      if (response.ok) {
        fetchSuggestions(activeTab);
        setEditingSuggestion(null);
      }
    } catch (error) {
      log.error('Action failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddSuggestion = async () => {
    if (!newPostContent || !newPostAuthor) return;

    setAddLoading(true);
    try {
      const response = await fetch('/api/comments/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postContent: newPostContent,
          postAuthor: newPostAuthor,
          linkedinPostUrl: newPostUrl || undefined,
          generateVariations: true,
        }),
      });

      if (response.ok) {
        setNewPostContent('');
        setNewPostAuthor('');
        setNewPostUrl('');
        setShowAddForm(false);
        fetchSuggestions('pending');
        setActiveTab('pending');
      }
    } catch (error) {
      log.error('Failed to add suggestion', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setAddLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getEngagementColor = (potential: string) => {
    switch (potential) {
      case 'high': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Comment Queue</h1>
            <p className="text-gray-600 mt-1">
              Daily engagement: thoughtful comments on founder posts
            </p>
          </div>
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 font-medium">
            ← Back
          </Link>
        </div>

        {/* Daily Progress */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Today&apos;s Progress</h3>
            <span className="text-2xl font-bold text-blue-600">
              {todayPosted} / {dailyGoal}
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                todayPosted >= dailyGoal ? 'bg-green-500' :
                todayPosted >= dailyGoal * 0.5 ? 'bg-blue-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${Math.min(100, (todayPosted / dailyGoal) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {todayPosted >= dailyGoal 
              ? '🎉 Goal achieved! Keep the momentum going.'
              : `${dailyGoal - todayPosted} more comments to hit your daily goal`}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
            <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending || 0}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
            <div className="text-2xl font-bold text-blue-600">{statusCounts.approved || 0}</div>
            <div className="text-sm text-gray-600">Approved</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
            <div className="text-2xl font-bold text-green-600">{statusCounts.posted || 0}</div>
            <div className="text-sm text-gray-600">Posted</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
            <div className="text-2xl font-bold text-gray-600">{statusCounts.skipped || 0}</div>
            <div className="text-sm text-gray-600">Skipped</div>
          </div>
        </div>

        {/* Add New Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + Add Post to Comment On
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <h3 className="font-semibold mb-4">Add a post to generate a comment for</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Post Author *
                </label>
                <input
                  type="text"
                  value={newPostAuthor}
                  onChange={(e) => setNewPostAuthor(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  LinkedIn Post URL (optional)
                </label>
                <input
                  type="url"
                  value={newPostUrl}
                  onChange={(e) => setNewPostUrl(e.target.value)}
                  placeholder="https://linkedin.com/feed/update/..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Post Content *
                </label>
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Paste the LinkedIn post content here..."
                  rows={6}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleAddSuggestion}
                  disabled={addLoading || !newPostContent || !newPostAuthor}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {addLoading ? 'Generating...' : 'Generate Comment'}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b mb-6">
          {(['pending', 'approved', 'posted'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Suggestions List */}
        {suggestions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {activeTab === 'pending' ? 'No pending comments' : `No ${activeTab} comments`}
            </h3>
            <p className="text-gray-600">
              {activeTab === 'pending' 
                ? 'Add posts from your LinkedIn feed to generate thoughtful comments'
                : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <div key={suggestion._id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{suggestion.postAuthor}</span>
                    {suggestion.postAuthorHeadline && (
                      <span className="text-sm text-gray-500">{suggestion.postAuthorHeadline}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${getEngagementColor(suggestion.engagementPotential)}`}>
                      {suggestion.engagementPotential} potential
                    </span>
                    <span className="text-xs text-gray-500">
                      {Math.round(suggestion.relevanceScore * 100)}% relevant
                    </span>
                  </div>
                </div>

                {/* Original Post Snippet */}
                <div className="px-4 py-3 border-b bg-blue-50">
                  <p className="text-sm text-gray-700 italic">
                    &ldquo;{suggestion.postContentSnippet}&rdquo;
                  </p>
                  {suggestion.linkedinPostUrl && (
                    <a
                      href={suggestion.linkedinPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                    >
                      View on LinkedIn →
                    </a>
                  )}
                </div>

                {/* Suggested Comment */}
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-gray-900">
                        {suggestion.editedComment || suggestion.suggestedComment}
                      </p>
                      {suggestion.editedComment && (
                        <span className="text-xs text-gray-500 mt-1 inline-block">
                          (edited)
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => copyToClipboard(suggestion.editedComment || suggestion.suggestedComment)}
                      className="text-gray-400 hover:text-gray-600 p-2"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>

                  {/* Alternative comments */}
                  {suggestion.alternativeComments && suggestion.alternativeComments.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-sm text-blue-600 cursor-pointer">
                        {suggestion.alternativeComments.length} alternative(s)
                      </summary>
                      <div className="mt-2 space-y-2">
                        {suggestion.alternativeComments.map((alt, i) => (
                          <div key={i} className="text-sm text-gray-600 bg-gray-50 p-2 rounded flex justify-between">
                            <span>{alt}</span>
                            <button
                              onClick={() => copyToClipboard(alt)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* Actions */}
                {activeTab === 'pending' && (
                  <div className="px-4 py-3 bg-gray-50 border-t flex gap-2">
                    <button
                      onClick={() => {
                        setEditingSuggestion(suggestion);
                        setEditedComment(suggestion.editedComment || suggestion.suggestedComment);
                      }}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      ✏️ Edit & Approve
                    </button>
                    <button
                      onClick={() => handleAction(suggestion._id, 'posted')}
                      disabled={actionLoading === suggestion._id}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      ✓ Mark Posted
                    </button>
                    <button
                      onClick={() => handleAction(suggestion._id, 'regenerate')}
                      disabled={actionLoading === suggestion._id}
                      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      🔄 Regenerate
                    </button>
                    <button
                      onClick={() => handleAction(suggestion._id, 'skip', { skippedReason: 'Not relevant' })}
                      disabled={actionLoading === suggestion._id}
                      className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                )}

                {activeTab === 'approved' && (
                  <div className="px-4 py-3 bg-gray-50 border-t flex gap-2">
                    <button
                      onClick={() => handleAction(suggestion._id, 'posted')}
                      disabled={actionLoading === suggestion._id}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      ✓ Mark Posted
                    </button>
                    <button
                      onClick={() => copyToClipboard(suggestion.editedComment || suggestion.suggestedComment)}
                      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
                    >
                      📋 Copy
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        {editingSuggestion && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Edit Comment</h3>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-500 mb-2">
                  Replying to {editingSuggestion.postAuthor}
                </p>
                <textarea
                  value={editedComment}
                  onChange={(e) => setEditedComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className={`text-xs mt-1 ${editedComment.length > 280 ? 'text-red-600' : 'text-gray-500'}`}>
                  {editedComment.length} / 280 characters
                </p>
              </div>
              <div className="p-4 border-t flex justify-end gap-3">
                <button
                  onClick={() => setEditingSuggestion(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction(editingSuggestion._id, 'approve', { editedComment })}
                  disabled={actionLoading === editingSuggestion._id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Save & Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

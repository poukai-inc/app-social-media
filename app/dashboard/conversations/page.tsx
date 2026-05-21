'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:conversations');

interface Conversation {
  id: string;
  targetPost: {
    id: string;
    content: string;
    url: string;
  };
  targetUser: {
    id: string;
    username?: string;
    name?: string;
    followersCount?: number;
  };
  ourReply: {
    content: string;
    url?: string;
  };
  conversation: {
    threadId: string;
    autoResponseEnabled: boolean;
    maxAutoResponses: number;
    currentAutoResponseCount: number;
    messageCount: number;
    lastCheckedAt?: string;
  };
  status: string;
  followUp?: {
    theyReplied: boolean;
    conversationLength: number;
  };
  icpMatch: {
    relevanceScore: number;
  };
  engagedAt: string;
}

interface ConversationStats {
  totalActiveConversations: number;
  conversationsWithReplies: number;
  averageConversationLength: number;
  autoResponsesEnabled: number;
  autoResponsesSent: number;
}

function ConversationsContent() {
  const searchParams = useSearchParams();
  const pageId = searchParams.get('pageId');
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [loading, setLoading] = useState(!!pageId);
  const [error, setError] = useState<string | null>(pageId ? null : 'Page ID is required');
  const [activeOnly, setActiveOnly] = useState(true);

  const fetchConversations = async () => {
    if (!pageId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/conversations?pageId=${pageId}&active=${activeOnly}&limit=50`);

      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }

      const data = await response.json();
      setConversations(data.conversations);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Refactor deferred — see BACKLOG #122 (move to TanStack Query / Suspense)
  useEffect(() => {
    if (pageId) {
      setTimeout(() => fetchConversations(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, activeOnly]);

  const toggleAutoResponse = async (conversationId: string, enable: boolean) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: enable ? 'enable_auto_response' : 'disable_auto_response',
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update conversation');
      }

      // Refresh conversations
      fetchConversations();
    } catch (err) {
      log.error('Error toggling auto response', { error: err instanceof Error ? err.message : String(err) });
      alert('Failed to update conversation settings');
    }
  };

  const resetResponseCount = async (conversationId: string) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_response_count',
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset count');
      }

      fetchConversations();
    } catch (err) {
      log.error('Error resetting count', { error: err instanceof Error ? err.message : String(err) });
      alert('Failed to reset response count');
    }
  };

  if (!pageId) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h3 className="text-red-800 font-medium">Page ID Required</h3>
          <p className="text-red-600">Please select a page to view conversations.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-600">{error}</p>
          <button 
            onClick={fetchConversations}
            className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Twitter Conversations</h1>
        <p className="text-gray-600">Monitor and manage bidirectional Twitter conversations from ICP engagement</p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.totalActiveConversations}</div>
            <div className="text-sm text-gray-500">Active Conversations</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{stats.conversationsWithReplies}</div>
            <div className="text-sm text-gray-500">Got Replies</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-purple-600">{stats.averageConversationLength.toFixed(1)}</div>
            <div className="text-sm text-gray-500">Avg Length</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-orange-600">{stats.autoResponsesEnabled}</div>
            <div className="text-sm text-gray-500">Auto-Response On</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{stats.autoResponsesSent}</div>
            <div className="text-sm text-gray-500">Auto Responses Sent</div>
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="flex items-center space-x-4 mb-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
          />
          <span className="ml-2 text-sm text-gray-700">Show only active conversations</span>
        </label>
        <button
          onClick={fetchConversations}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Conversations List */}
      <div className="space-y-4">
        {conversations.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-8 text-center">
            <p className="text-gray-500">No conversations found.</p>
            <p className="text-sm text-gray-400 mt-1">
              {activeOnly ? 'Try unchecking "Show only active conversations" or engage with more Twitter posts.' : 'Start engaging with Twitter posts to see conversations here.'}
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div key={conv.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-medium text-gray-900">
                      @{conv.targetUser.username || conv.targetUser.name || 'Unknown'}
                    </span>
                    <span className="text-sm text-gray-500">
                      {conv.targetUser.followersCount?.toLocaleString()} followers
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      conv.conversation.autoResponseEnabled 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {conv.conversation.autoResponseEnabled ? 'Auto-response ON' : 'Auto-response OFF'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <strong>Original post:</strong> {conv.targetPost.content.slice(0, 150)}...
                  </div>
                  <div className="text-sm text-gray-600">
                    <strong>Our reply:</strong> {conv.ourReply.content}
                  </div>
                </div>
                
                <div className="text-right space-y-1">
                  <div className="text-sm font-medium text-gray-900">
                    Score: {conv.icpMatch.relevanceScore}/10
                  </div>
                  <div className="text-xs text-gray-500">
                    {conv.followUp?.conversationLength || 1} messages
                  </div>
                  <div className="text-xs text-gray-500">
                    {conv.conversation.currentAutoResponseCount}/{conv.conversation.maxAutoResponses} auto-responses
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <a 
                    href={conv.targetPost.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View Original →
                  </a>
                  {conv.ourReply.url && (
                    <a 
                      href={conv.ourReply.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View Our Reply →
                    </a>
                  )}
                  <span className={`text-xs px-2 py-1 rounded ${
                    conv.followUp?.theyReplied 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {conv.followUp?.theyReplied ? 'They replied!' : 'No reply yet'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleAutoResponse(conv.id, !conv.conversation.autoResponseEnabled)}
                    className={`px-3 py-1 rounded text-sm ${
                      conv.conversation.autoResponseEnabled
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {conv.conversation.autoResponseEnabled ? 'Disable Auto' : 'Enable Auto'}
                  </button>
                  
                  {conv.conversation.currentAutoResponseCount > 0 && (
                    <button
                      onClick={() => resetResponseCount(conv.id)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-sm"
                      title="Reset response count to allow more auto-responses"
                    >
                      Reset Count
                    </button>
                  )}
                </div>
              </div>
              
              {conv.conversation.lastCheckedAt && (
                <div className="text-xs text-gray-400 mt-2">
                  Last checked: {new Date(conv.conversation.lastCheckedAt).toLocaleString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    }>
      <ConversationsContent />
    </Suspense>
  );
}
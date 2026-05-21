'use client';

import { useState } from 'react';
import { 
  Twitter,
  ExternalLink,
  MessageSquare,
  Heart,
  Repeat,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  MessageCircle,
  UserPlus,
  ThumbsUp,
  Minus,
} from 'lucide-react';

interface ICPEngagementData {
  _id: string;
  platform: 'twitter' | 'linkedin';
  targetPost: {
    id: string;
    content: string;
    url?: string;
    metrics?: {
      likes: number;
      retweets?: number;
      replies?: number;
    };
  };
  targetUser: {
    id: string;
    username?: string;
    name?: string;
    bio?: string;
    followersCount?: number;
  };
  ourReply: {
    id?: string;
    content: string;
    url?: string;
  };
  icpMatch: {
    relevanceScore: number;
    matchedPainPoints?: string[];
    matchedTopics?: string[];
    searchQuery?: string;
  };
  status: 'sent' | 'got_reply' | 'got_like' | 'got_follow' | 'conversation' | 'ignored';
  followUp?: {
    theyReplied: boolean;
    theyLiked: boolean;
    theyFollowed: boolean;
    conversationLength: number;
  };
  engagedAt: string;
  dryRun?: boolean;
}

const statusConfig = {
  sent: { 
    label: 'Sent', 
    icon: CheckCircle, 
    bg: 'bg-blue-100 dark:bg-blue-900', 
    text: 'text-blue-600 dark:text-blue-400' 
  },
  got_reply: { 
    label: 'Got Reply', 
    icon: MessageCircle, 
    bg: 'bg-green-100 dark:bg-green-900', 
    text: 'text-green-600 dark:text-green-400' 
  },
  got_like: { 
    label: 'Got Like', 
    icon: ThumbsUp, 
    bg: 'bg-purple-100 dark:bg-purple-900', 
    text: 'text-purple-600 dark:text-purple-400' 
  },
  got_follow: { 
    label: 'Got Follow', 
    icon: UserPlus, 
    bg: 'bg-emerald-100 dark:bg-emerald-900', 
    text: 'text-emerald-600 dark:text-emerald-400' 
  },
  conversation: { 
    label: 'Conversation', 
    icon: MessageSquare, 
    bg: 'bg-amber-100 dark:bg-amber-900', 
    text: 'text-amber-600 dark:text-amber-400' 
  },
  ignored: { 
    label: 'No Response', 
    icon: Minus, 
    bg: 'bg-zinc-100 dark:bg-zinc-800', 
    text: 'text-zinc-500 dark:text-zinc-400' 
  },
};

function getRelevanceColor(score: number): string {
  if (score >= 8) return 'text-green-600 dark:text-green-400';
  if (score >= 6) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function formatNumber(num?: number): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function ICPEngagementCard({ engagement }: { engagement: ICPEngagementData }) {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[engagement.status];
  const StatusIcon = status.icon;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* User info */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 rounded-full bg-zinc-100 p-2 dark:bg-zinc-800">
              <Twitter className="h-5 w-5 text-[#1DA1F2]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {engagement.targetUser.name || 'Unknown'}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                  @{engagement.targetUser.username || 'unknown'}
                </span>
                {engagement.targetUser.followersCount && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    • {formatNumber(engagement.targetUser.followersCount)} followers
                  </span>
                )}
              </div>
              {engagement.targetUser.bio && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                  {engagement.targetUser.bio}
                </p>
              )}
            </div>
          </div>

          {/* Status & Score */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {engagement.dryRun && (
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium dark:bg-amber-900 dark:text-amber-300">
                Dry Run
              </span>
            )}
            <span className={`font-semibold ${getRelevanceColor(engagement.icpMatch.relevanceScore)}`}>
              {engagement.icpMatch.relevanceScore}/10
            </span>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${status.bg}`}>
              <StatusIcon className={`h-3.5 w-3.5 ${status.text}`} />
              <span className={`text-xs font-medium ${status.text}`}>{status.label}</span>
            </div>
          </div>
        </div>

        {/* Original Tweet */}
        <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {expanded ? engagement.targetPost.content : engagement.targetPost.content.slice(0, 200)}
            {!expanded && engagement.targetPost.content.length > 200 && '...'}
          </p>
          
          {/* Tweet metrics */}
          {engagement.targetPost.metrics && (
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" />
                {formatNumber(engagement.targetPost.metrics.likes)}
              </span>
              {engagement.targetPost.metrics.retweets !== undefined && (
                <span className="flex items-center gap-1">
                  <Repeat className="h-3.5 w-3.5" />
                  {formatNumber(engagement.targetPost.metrics.retweets)}
                </span>
              )}
              {engagement.targetPost.metrics.replies !== undefined && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {formatNumber(engagement.targetPost.metrics.replies)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Our Reply */}
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Our Reply:</span>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/50">
            <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
              {engagement.ourReply.content}
            </p>
          </div>
        </div>

        {/* Expand/Collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show more details
            </>
          )}
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
            {/* Search Query */}
            {engagement.icpMatch.searchQuery && (
              <div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Search Query:</span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1">
                  &ldquo;{engagement.icpMatch.searchQuery}&rdquo;
                </p>
              </div>
            )}

            {/* Matched Topics */}
            {engagement.icpMatch.matchedTopics && engagement.icpMatch.matchedTopics.length > 0 && (
              <div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Matched Topics:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {engagement.icpMatch.matchedTopics.map((topic, i) => (
                    <span key={i} className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-400">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up status */}
            {engagement.followUp && (
              <div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Follow-up Status:</span>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className={engagement.followUp.theyReplied ? 'text-green-600' : 'text-zinc-400'}>
                    {engagement.followUp.theyReplied ? '✓' : '○'} Replied
                  </span>
                  <span className={engagement.followUp.theyLiked ? 'text-green-600' : 'text-zinc-400'}>
                    {engagement.followUp.theyLiked ? '✓' : '○'} Liked
                  </span>
                  <span className={engagement.followUp.theyFollowed ? 'text-green-600' : 'text-zinc-400'}>
                    {engagement.followUp.theyFollowed ? '✓' : '○'} Followed
                  </span>
                  {engagement.followUp.conversationLength > 1 && (
                    <span className="text-blue-600">
                      {engagement.followUp.conversationLength} messages
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="flex items-center gap-4">
              {engagement.targetPost.url && (
                <a
                  href={engagement.targetPost.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Original Tweet
                </a>
              )}
              {engagement.ourReply.url && (
                <a
                  href={engagement.ourReply.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Our Reply
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {timeAgo(engagement.engagedAt)}
        </div>
        <span>ID: {engagement.targetPost.id.slice(-8)}</span>
      </div>
    </div>
  );
}

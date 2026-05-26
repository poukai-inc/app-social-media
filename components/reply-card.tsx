'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger.child('component:reply-card');
import {
  CheckCircle,
  Clock,
  XCircle,
  MoreVertical,
  Play,
  RefreshCw,
  Loader2,
  User,
} from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';

interface Reply {
  _id: string;
  postId?: string;
  linkedinPostUrn: string;
  commentUrn: string;
  commenterName: string;
  commenterProfileUrl?: string;
  commentText: string;
  aiGeneratedReply?: string;
  userEditedReply?: string;
  status: 'pending' | 'approved' | 'replied' | 'skipped' | 'failed';
  repliedAt?: string;
  error?: string;
  createdAt: string;
}

interface ReplyCardProps {
  reply: Reply;
}

const statusConfig = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    className: 'bg-[color:var(--surface)] text-[color:var(--accent)]',
  },
  replied: {
    label: 'Replied',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
  skipped: {
    label: 'Skipped',
    icon: XCircle,
    className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

export function ReplyCard({ reply }: ReplyCardProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [editedReply, setEditedReply] = useState(reply.userEditedReply || reply.aiGeneratedReply || '');

  const status = statusConfig[reply.status];
  const StatusIcon = status.icon;

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/engagements/replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId: reply._id, status: 'approved' }),
      });
      router.refresh();
    } catch (error) {
      log.error('Error approving', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteNow = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/engagements/replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          replyId: reply._id, 
          userEditedReply: editedReply,
          executeNow: true 
        }),
      });
      router.refresh();
    } catch (error) {
      log.error('Error executing', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveReply = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/engagements/replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId: reply._id, userEditedReply: editedReply }),
      });
      setShowReply(false);
      router.refresh();
    } catch (error) {
      log.error('Error saving reply', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateReply = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/engagements/replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId: reply._id, regenerateReply: true }),
      });
      const data = await res.json();
      if (data.reply?.aiGeneratedReply) {
        setEditedReply(data.reply.aiGeneratedReply);
      }
      router.refresh();
    } catch (error) {
      log.error('Error regenerating', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/engagements/replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId: reply._id, status: 'skipped' }),
      });
      router.refresh();
    } catch (error) {
      log.error('Error skipping', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const replyText = reply.userEditedReply || reply.aiGeneratedReply;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Commenter Info */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <User className="h-4 w-4 text-zinc-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {reply.commenterName}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                commented on your post
              </p>
            </div>
          </div>

          {/* Comment Text */}
          <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              &ldquo;{reply.commentText}&rdquo;
            </p>
          </div>

          {/* AI Generated Reply */}
          {replyText && (
            <div className="mt-3">
              <button
                onClick={() => setShowReply(!showReply)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              >
                {showReply ? 'Hide reply' : 'View/Edit reply'}
              </button>
              {showReply && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editedReply}
                    onChange={(e) => setEditedReply(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveReply}
                      disabled={isLoading}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRegenerateReply}
                      disabled={isLoading}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
              {!showReply && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  → {replyText}
                </p>
              )}
            </div>
          )}

          {/* Meta info */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Received {format(new Date(reply.createdAt), 'MMM d, h:mm a')}</span>
            {reply.repliedAt && (
              <span>Replied {format(new Date(reply.repliedAt), 'MMM d, h:mm a')}</span>
            )}
          </div>

          {/* Error */}
          {reply.error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Error: {reply.error}
            </p>
          )}
        </div>

        {/* Right side: Status & Actions */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              ) : (
                <MoreVertical className="h-4 w-4 text-zinc-500" />
              )}
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  {reply.status === 'pending' && (
                    <button
                      onClick={() => { handleApprove(); setShowMenu(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                  )}
                  {(reply.status === 'pending' || reply.status === 'approved') && (
                    <>
                      <button
                        onClick={() => { handleExecuteNow(); setShowMenu(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <Play className="h-4 w-4" />
                        Reply Now
                      </button>
                      <button
                        onClick={() => { handleSkip(); setShowMenu(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Skip
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

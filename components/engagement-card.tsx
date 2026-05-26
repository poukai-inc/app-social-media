'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger.child('component:engagement-card');
import {
  Heart,
  MessageSquare,
  CheckCircle,
  Clock,
  XCircle,
  MoreVertical,
  Trash2,
  Play,
  RefreshCw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { useToast } from '@poukai-inc/ui/organisms';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Engagement {
  _id: string;
  postUrl: string;
  postUrn?: string;
  postAuthor?: string;
  postContent?: string;
  engagementType: 'like' | 'comment' | 'both';
  aiGeneratedComment?: string;
  userEditedComment?: string;
  status: 'pending' | 'approved' | 'engaged' | 'failed' | 'skipped';
  scheduledFor?: string;
  engagedAt?: string;
  error?: string;
  createdAt: string;
}

interface EngagementCardProps {
  engagement: Engagement;
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
  engaged: {
    label: 'Engaged',
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

const engagementTypeConfig = {
  like: { icon: Heart, label: 'Like' },
  comment: { icon: MessageSquare, label: 'Comment' },
  both: { icon: Heart, label: 'Like + Comment' },
};

export function EngagementCard({ engagement }: EngagementCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [editedComment, setEditedComment] = useState(engagement.userEditedComment || engagement.aiGeneratedComment || '');

  const status = statusConfig[engagement.status];
  const StatusIcon = status.icon;
  const engagementType = engagementTypeConfig[engagement.engagementType];
  const TypeIcon = engagementType.icon;

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await fetch(`/api/engagements/${engagement._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
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
      await fetch(`/api/engagements/${engagement._id}`, {
        method: 'POST',
      });
      router.refresh();
    } catch (error) {
      log.error('Error executing', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveComment = async () => {
    setIsLoading(true);
    try {
      await fetch(`/api/engagements/${engagement._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEditedComment: editedComment }),
      });
      setShowComment(false);
      router.refresh();
    } catch (error) {
      log.error('Error saving comment', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateComment = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/engagements/${engagement._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateComment: true }),
      });
      const data = await res.json();
      if (data.engagement?.aiGeneratedComment) {
        setEditedComment(data.engagement.aiGeneratedComment);
      }
      router.refresh();
    } catch (error) {
      log.error('Error regenerating', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/engagements/${engagement._id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.show({ tone: 'success', title: 'Engagement deleted', body: 'The engagement was removed.' });
        router.refresh();
      } else {
        toast.show({ tone: 'danger', title: 'Delete failed', body: 'Could not delete the engagement. Try again.' });
      }
    } catch (error) {
      log.error('Error deleting', { error: error instanceof Error ? error.message : String(error) });
      toast.show({ tone: 'danger', title: 'Delete failed', body: 'Something went wrong. Try again.' });
    } finally {
      setIsLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const comment = engagement.userEditedComment || engagement.aiGeneratedComment;

  return (
    <>
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Post URL */}
          <a
            href={engagement.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            <span className="truncate max-w-[300px]">{engagement.postUrl}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>

          {/* Post Author & Content Preview */}
          {(engagement.postAuthor || engagement.postContent) && (
            <div className="mt-2">
              {engagement.postAuthor && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  By: {engagement.postAuthor}
                </p>
              )}
              {engagement.postContent && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {engagement.postContent}
                </p>
              )}
            </div>
          )}

          {/* AI Generated Comment Preview */}
          {comment && (engagement.engagementType === 'comment' || engagement.engagementType === 'both') && (
            <div className="mt-3">
              <button
                onClick={() => setShowComment(!showComment)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              >
                {showComment ? 'Hide comment' : 'View/Edit comment'}
              </button>
              {showComment && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editedComment}
                    onChange={(e) => setEditedComment(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveComment}
                      disabled={isLoading}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRegenerateComment}
                      disabled={isLoading || !engagement.postContent}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meta info */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <TypeIcon className="h-3 w-3" />
              {engagementType.label}
            </span>
            <span>Added {format(new Date(engagement.createdAt), 'MMM d, h:mm a')}</span>
            {engagement.engagedAt && (
              <span>Engaged {format(new Date(engagement.engagedAt), 'MMM d, h:mm a')}</span>
            )}
          </div>

          {/* Error */}
          {engagement.error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Error: {engagement.error}
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
                  {(engagement.status === 'pending') && (
                    <button
                      onClick={() => { handleApprove(); setShowMenu(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                  )}
                  {(engagement.status === 'pending' || engagement.status === 'approved') && (
                    <button
                      onClick={() => { handleExecuteNow(); setShowMenu(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <Play className="h-4 w-4" />
                      Execute Now
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMenu(false); setDeleteDialogOpen(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      open={deleteDialogOpen}
      onOpenChange={setDeleteDialogOpen}
      title="Delete this engagement?"
      description="This action can't be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={handleDelete}
      isConfirming={isLoading}
    />
    </>
  );
}

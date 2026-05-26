'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NextImage from 'next/image';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger.child('component:post-card');
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  MoreVertical,
  Send,
  Trash2,
  XCircle,
  FileText,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Video,
  Building2,
  User,
  AlertCircle,
} from 'lucide-react';
import { Spinner } from '@poukai-inc/ui/atoms';
import { useToast } from '@poukai-inc/ui/organisms';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { PLATFORM_ICONS } from '@/components/icons/platforms';

const platformIcons = PLATFORM_ICONS;

const platformColors: Record<string, string> = {
  facebook: 'text-[color:var(--accent)]',
  twitter: 'text-zinc-900 dark:text-zinc-100',
  linkedin: 'text-[color:var(--accent)]',
  instagram: 'text-pink-600',
};

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  filename: string;
}

interface PlatformResult {
  platform: string;
  status: 'pending' | 'published' | 'failed';
  postId?: string;
  postUrl?: string;
  publishedAt?: string;
  error?: string;
  retryCount?: number;
}

interface Post {
  _id: string;
  mode?: 'manual' | 'structured' | 'ai' | 'blog_repurpose';
  content: string;
  media?: MediaItem[];
  status: 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'partially_published' | 'failed' | 'rejected';
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
  error?: string;
  postAs?: 'person' | 'organization';
  organizationName?: string;
  targetPlatforms?: string[];
  platformResults?: PlatformResult[];
}

interface PostCardProps {
  post: Post;
}

const statusConfig = {
  draft: {
    label: 'Draft',
    icon: Edit,
    className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  pending_approval: {
    label: 'Pending Approval',
    icon: Clock,
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  },
  scheduled: {
    label: 'Scheduled',
    icon: Clock,
    className: 'bg-[color:var(--surface)] text-[color:var(--accent)]',
  },
  published: {
    label: 'Published',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  partially_published: {
    label: 'Partially Published',
    icon: CheckCircle,
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
};

const modeConfig = {
  manual: { icon: FileText, label: 'Manual' },
  structured: { icon: Sparkles, label: 'Structured' },
  ai: { icon: Wand2, label: 'AI Generated' },
  blog_repurpose: { icon: Wand2, label: 'Blog Repurpose' },
};

export function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  const status = statusConfig[post.status];
  const StatusIcon = status.icon;
  const mode = modeConfig[post.mode || 'manual'];
  const ModeIcon = mode.icon;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/posts/${post._id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.show({ tone: 'success', title: 'Post deleted', body: 'The post was removed from your queue.' });
        router.refresh();
      } else {
        toast.show({ tone: 'danger', title: 'Delete failed', body: 'Could not delete the post. Try again.' });
      }
    } catch (error) {
      log.error('Error deleting post', { error: error instanceof Error ? error.message : String(error) });
      toast.show({ tone: 'danger', title: 'Delete failed', body: 'Something went wrong. Try again.' });
    } finally {
      setIsDeleting(false);
      setShowMenu(false);
      setDeleteDialogOpen(false);
    }
  };

  const handlePublishNow = async () => {
    setIsPublishing(true);
    try {
      const response = await fetch(`/api/posts/${post._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishNow: true }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      log.error('Error publishing post', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsPublishing(false);
      setShowMenu(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/posts/${post._id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      log.error('Error approving post', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsApproving(false);
      setShowMenu(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      const response = await fetch(`/api/posts/${post._id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (response.ok) {
        toast.show({ tone: 'success', title: 'Post rejected', body: 'The post will not be published.' });
        router.refresh();
      } else {
        toast.show({ tone: 'danger', title: 'Reject failed', body: 'Could not reject the post. Try again.' });
      }
    } catch (error) {
      log.error('Error rejecting post', { error: error instanceof Error ? error.message : String(error) });
      toast.show({ tone: 'danger', title: 'Reject failed', body: 'Something went wrong. Try again.' });
    } finally {
      setIsRejecting(false);
      setShowMenu(false);
      setRejectDialogOpen(false);
    }
  };

  const truncatedContent =
    post.content.length > 200 ? post.content.slice(0, 200) + '...' : post.content;

  const imageCount = post.media?.filter(m => m.type === 'image').length || 0;
  const videoCount = post.media?.filter(m => m.type === 'video').length || 0;

  return (
    <>
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              <ModeIcon className="h-3 w-3" />
              {mode.label}
            </span>
            {/* Post As indicator */}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              post.postAs === 'organization' 
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              {post.postAs === 'organization' ? (
                <>
                  <Building2 className="h-3 w-3" />
                  {post.organizationName || 'Organization'}
                </>
              ) : (
                <>
                  <User className="h-3 w-3" />
                  Personal
                </>
              )}
            </span>
            {(imageCount > 0 || videoCount > 0) && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                {imageCount > 0 && (
                  <span className="flex items-center gap-0.5">
                    <ImageIcon className="h-3 w-3" />
                    {imageCount}
                  </span>
                )}
                {videoCount > 0 && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <Video className="h-3 w-3" />
                    {videoCount}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Target Platforms */}
          {post.targetPlatforms && post.targetPlatforms.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Platforms:</span>
              <div className="flex items-center gap-1.5">
                {post.targetPlatforms.map((platform) => {
                  const PlatformIcon = platformIcons[platform];
                  const result = post.platformResults?.find(r => r.platform === platform);
                  const statusColor = result?.status === 'published' 
                    ? 'bg-green-100 dark:bg-green-900/30' 
                    : result?.status === 'failed' 
                      ? 'bg-red-100 dark:bg-red-900/30' 
                      : 'bg-zinc-100 dark:bg-zinc-800';
                  
                  return (
                    <div
                      key={platform}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${statusColor}`}
                      title={result?.error || `${platform}: ${result?.status || 'pending'}`}
                    >
                      {PlatformIcon && (
                        <PlatformIcon className={`h-3.5 w-3.5 ${platformColors[platform]}`} />
                      )}
                      {result?.status === 'published' && (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                      )}
                      {result?.status === 'failed' && (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      {!result && (
                        <Clock className="h-3 w-3 text-zinc-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platform Results Details */}
          {post.platformResults && post.platformResults.length > 0 && (
            <div className="space-y-1">
              {post.platformResults.map((result) => {
                const PlatformIcon = platformIcons[result.platform];
                return (
                  <div key={result.platform} className="flex items-start gap-2 text-xs">
                    <div className="flex items-center gap-1 min-w-[80px]">
                      {PlatformIcon && (
                        <PlatformIcon className={`h-3.5 w-3.5 ${platformColors[result.platform]}`} />
                      )}
                      <span className="capitalize">{result.platform}</span>
                    </div>
                    {result.status === 'published' ? (
                      <a 
                        href={result.postUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-green-600 hover:underline flex items-center gap-1"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Published
                        {result.publishedAt && (
                          <span className="text-zinc-400 ml-1">
                            {format(new Date(result.publishedAt), 'MMM d, h:mm a')}
                          </span>
                        )}
                      </a>
                    ) : result.status === 'failed' ? (
                      <div className="flex items-start gap-1 text-red-500">
                        <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="break-all">{result.error || 'Failed to publish'}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Scheduled time */}
          <div className="flex flex-wrap items-center gap-2">
            {post.scheduledFor && post.status === 'scheduled' && (
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(post.scheduledFor), 'MMM d, yyyy h:mm a')}
              </span>
            )}
            {post.publishedAt && post.status === 'published' && (
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <CheckCircle className="h-3.5 w-3.5" />
                Published {format(new Date(post.publishedAt), 'MMM d, yyyy h:mm a')}
              </span>
            )}
          </div>

          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {truncatedContent}
          </p>

          {/* Media preview */}
          {post.media && post.media.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {post.media.slice(0, 4).map((item, index) => (
                <div key={item.id} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  {item.type === 'image' ? (
                    <NextImage src={item.url} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
                  ) : (
                    <video src={item.url} className="h-full w-full object-cover" />
                  )}
                  {index === 3 && post.media && post.media.length > 4 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
                      +{post.media.length - 4}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {post.error && (
            <p className="text-xs text-red-500 dark:text-red-400">Error: {post.error}</p>
          )}

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Created {format(new Date(post.createdAt), 'MMM d, yyyy h:mm a')}
          </p>
        </div>

        <div className="flex items-start gap-2">
          {/* Approve/Reject buttons for pending approval posts */}
          {post.status === 'pending_approval' && (
            <>
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                title="Approve post"
              >
                {isApproving ? (
                  <Spinner size="sm" label="Approving" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
              <button
                onClick={() => setRejectDialogOpen(true)}
                disabled={isRejecting}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                title="Reject post"
              >
                {isRejecting ? (
                  <Spinner size="sm" label="Rejecting" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </>
          )}
          
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <MoreVertical className="h-4 w-4 text-zinc-500" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  {post.status === 'pending_approval' && (
                    <button
                      onClick={() => router.push(`/dashboard/edit/${post._id}`)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
                    <>
                      <button
                        onClick={() => router.push(`/dashboard/edit/${post._id}`)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        onClick={handlePublishNow}
                        disabled={isPublishing}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        {isPublishing ? (
                          <Spinner size="sm" label="Publishing" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Publish Now
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setDeleteDialogOpen(true);
                    }}
                    disabled={isDeleting}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {isDeleting ? (
                      <Spinner size="sm" label="Deleting" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
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
      title="Delete this post?"
      description="This action can't be undone. The post will be removed from your queue."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={handleDelete}
      isConfirming={isDeleting}
    />
    <ConfirmDialog
      open={rejectDialogOpen}
      onOpenChange={setRejectDialogOpen}
      title="Reject this post?"
      description="The post will not be published. You can still edit and resubmit it."
      confirmLabel="Reject"
      cancelLabel="Cancel"
      onConfirm={handleReject}
      isConfirming={isRejecting}
    />
    </>
  );
}

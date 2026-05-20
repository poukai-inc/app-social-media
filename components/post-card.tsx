'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger.child('component:post-card');
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  Loader2,
  MoreVertical,
  Send,
  Trash2,
  XCircle,
  FileText,
  Sparkles,
  Wand2,
  Image,
  Video,
  Building2,
  User,
  AlertCircle,
} from 'lucide-react';

// Platform icons as simple SVG components
const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const LinkedInIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  facebook: FacebookIcon,
  twitter: TwitterIcon,
  linkedin: LinkedInIcon,
  instagram: InstagramIcon,
};

const platformColors: Record<string, string> = {
  facebook: 'text-blue-600',
  twitter: 'text-zinc-900 dark:text-zinc-100',
  linkedin: 'text-blue-700',
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
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
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
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const status = statusConfig[post.status];
  const StatusIcon = status.icon;
  const mode = modeConfig[post.mode || 'manual'];
  const ModeIcon = mode.icon;

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/posts/${post._id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      log.error('Error deleting post', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsDeleting(false);
      setShowMenu(false);
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
    if (!confirm('Are you sure you want to reject this post?')) return;
    
    setIsRejecting(true);
    try {
      const response = await fetch(`/api/posts/${post._id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      log.error('Error rejecting post', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsRejecting(false);
      setShowMenu(false);
    }
  };

  const truncatedContent =
    post.content.length > 200 ? post.content.slice(0, 200) + '...' : post.content;

  const imageCount = post.media?.filter(m => m.type === 'image').length || 0;
  const videoCount = post.media?.filter(m => m.type === 'video').length || 0;

  return (
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
                    <Image className="h-3 w-3" />
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
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                title="Reject post"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
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
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Publish Now
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
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
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { Avatar } from '@poukai-inc/ui/atoms/Avatar';

const log = logger.child('dashboard:pages');
import {
  Plus,
  Settings,
  FileText,
  User,
  Building2,
  ChevronRight,
  Zap,
} from 'lucide-react';

interface PageStats {
  draft?: number;
  scheduled?: number;
  published?: number;
  pending_approval?: number;
  failed?: number;
}

interface Page {
  _id: string;
  type: 'personal' | 'organization';
  name: string;
  description?: string;
  avatar?: string;
  isActive: boolean;
  isSetupComplete: boolean;
  contentStrategy: {
    persona: string;
    topics: string[];
    postingFrequency: number;
  };
  schedule: {
    autoGenerate: boolean;
  };
  postStats?: PageStats;
  createdAt: string;
}

export default function PagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchPages = async () => {
    try {
      const response = await fetch('/api/pages?includeStats=true');
      if (response.ok) {
        const data = await response.json();
        setPages(data.pages);
      }
    } catch (error) {
      log.error('Failed to fetch pages', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      setTimeout(() => fetchPages(), 0);
    }
  }, [session]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg)]">
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
            <h1 className="text-3xl font-bold text-[color:var(--fg)]">Your Pages</h1>
            <p className="text-[color:var(--fg-muted)] mt-1">
              Manage your LinkedIn profiles and company pages
            </p>
          </div>
          <Button asChild variant="primary">
            <Link href="/dashboard/pages/new">
              <Plus className="h-4 w-4" />
              Add Page
            </Link>
          </Button>
        </div>

        {/* Pages Grid */}
        {pages.length === 0 ? (
          <div className="bg-[color:var(--bg-elevated)] rounded-xl shadow-sm border border-[color:var(--hairline)] p-12 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface)] rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-[color:var(--accent)]" />
            </div>
            <h3 className="text-xl font-semibold text-[color:var(--fg)] mb-2">
              No pages configured yet
            </h3>
            <p className="text-[color:var(--fg-muted)] mb-6 max-w-md mx-auto">
              Add your LinkedIn profile or company pages to start creating and scheduling content tailored to each audience.
            </p>
            <Button asChild variant="primary">
              <Link href="/dashboard/pages/new">
                <Plus className="h-5 w-5" />
                Add Your First Page
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <PageCard key={page._id} page={page} />
            ))}
            
            {/* Add Page Card */}
            <Link
              href="/dashboard/pages/new"
              className="bg-[color:var(--bg-elevated)] rounded-xl shadow-sm border-2 border-dashed border-[color:var(--hairline)] p-6 flex flex-col items-center justify-center min-h-[280px] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-glow)] transition-colors group"
            >
              <div className="w-12 h-12 bg-[color:var(--surface)] rounded-full flex items-center justify-center mb-3 group-hover:bg-[color:var(--accent-glow)] transition-colors">
                <Plus className="h-6 w-6 text-[color:var(--fg-muted)] group-hover:text-[color:var(--accent)]" />
              </div>
              <span className="text-[color:var(--fg-muted)] font-medium group-hover:text-[color:var(--accent)]">
                Add Another Page
              </span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function PageCard({ page }: { page: Page }) {
  const publishedPosts = page.postStats?.published || 0;
  const scheduledPosts = page.postStats?.scheduled || 0;
  const pendingPosts = page.postStats?.pending_approval || 0;

  return (
    <div className="bg-[color:var(--bg-elevated)] rounded-xl shadow-sm border border-[color:var(--hairline)] overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-5 border-b border-[color:var(--hairline)]">
        <div className="flex items-start gap-4">
          {page.avatar ? (
            <Avatar mode="image" src={page.avatar} alt={page.name} size="lg" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              {page.type === 'personal' ? (
                <User className="h-6 w-6 text-white" />
              ) : (
                <Building2 className="h-6 w-6 text-white" />
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[color:var(--fg)] truncate">
                {page.name}
              </h3>
              {!page.isActive && (
                <span className="px-2 py-0.5 text-xs bg-[color:var(--surface)] text-[color:var(--fg-muted)] rounded">
                  Paused
                </span>
              )}
            </div>
            <p className="text-sm text-[color:var(--fg-muted)] capitalize">
              {page.type} Profile
            </p>
          </div>
        </div>
      </div>

      {/* Strategy Preview */}
      <div className="p-4 bg-[color:var(--surface)]">
        <p className="text-sm text-[color:var(--fg-muted)] line-clamp-2">
          {page.contentStrategy.persona}
        </p>
        {page.contentStrategy.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {page.contentStrategy.topics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="px-2 py-0.5 text-xs bg-[color:var(--surface)] text-[color:var(--accent)] rounded"
              >
                {topic}
              </span>
            ))}
            {page.contentStrategy.topics.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-[color:var(--fg-muted)]">
                +{page.contentStrategy.topics.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-3 gap-4 text-center border-b border-[color:var(--hairline)]">
        <div>
          <div className="text-lg font-semibold text-[color:var(--fg)]">{publishedPosts}</div>
          <div className="text-xs text-[color:var(--fg-muted)]">Published</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[color:var(--accent)]">{scheduledPosts}</div>
          <div className="text-xs text-[color:var(--fg-muted)]">Scheduled</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-yellow-600">{pendingPosts}</div>
          <div className="text-xs text-[color:var(--fg-muted)]">Pending</div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {page.schedule.autoGenerate ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Zap className="h-3 w-3" />
              Auto-generating
            </span>
          ) : (
            <span className="text-xs text-[color:var(--fg-muted)]">
              {page.contentStrategy.postingFrequency}x/week target
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/pages/${page._id}/settings`}
            className="p-2 text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--surface)] rounded-lg transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <Button asChild variant="primary" size="sm">
            <Link href={`/dashboard/pages/${page._id}`}>
              View
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Your Pages</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage your LinkedIn profiles and company pages
            </p>
          </div>
          <Link
            href="/dashboard/pages/new"
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Page
          </Link>
        </div>

        {/* Pages Grid */}
        {pages.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No pages configured yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Add your LinkedIn profile or company pages to start creating and scheduling content tailored to each audience.
            </p>
            <Link
              href="/dashboard/pages/new"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Add Your First Page
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <PageCard key={page._id} page={page} />
            ))}
            
            {/* Add Page Card */}
            <Link
              href="/dashboard/pages/new"
              className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border-2 border-dashed border-gray-300 dark:border-zinc-700 p-6 flex flex-col items-center justify-center min-h-[280px] hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors group"
            >
              <div className="w-12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                <Plus className="h-6 w-6 text-gray-400 group-hover:text-blue-600" />
              </div>
              <span className="text-gray-600 dark:text-gray-400 font-medium group-hover:text-blue-600">
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
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-start gap-4">
          {page.avatar ? (
            <img
              src={page.avatar}
              alt={page.name}
              className="w-12 h-12 rounded-full object-cover"
            />
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
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {page.name}
              </h3>
              {!page.isActive && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 rounded">
                  Paused
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {page.type} Profile
            </p>
          </div>
        </div>
      </div>

      {/* Strategy Preview */}
      <div className="p-4 bg-gray-50 dark:bg-zinc-800/50">
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {page.contentStrategy.persona}
        </p>
        {page.contentStrategy.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {page.contentStrategy.topics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
              >
                {topic}
              </span>
            ))}
            {page.contentStrategy.topics.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-gray-500">
                +{page.contentStrategy.topics.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-3 gap-4 text-center border-b border-gray-100 dark:border-zinc-800">
        <div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">{publishedPosts}</div>
          <div className="text-xs text-gray-500">Published</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-blue-600">{scheduledPosts}</div>
          <div className="text-xs text-gray-500">Scheduled</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-yellow-600">{pendingPosts}</div>
          <div className="text-xs text-gray-500">Pending</div>
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
            <span className="text-xs text-gray-500">
              {page.contentStrategy.postingFrequency}x/week target
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/pages/${page._id}/settings`}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <Link
            href={`/dashboard/pages/${page._id}`}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            View
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

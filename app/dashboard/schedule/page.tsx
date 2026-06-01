'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ScheduleOptimizer from '@/components/schedule-optimizer';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { Spinner } from '@poukai-inc/ui/atoms';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:schedule');

interface Page {
  _id: string;
  name: string;
  connections: {
    platform: string;
    platformUsername: string;
    isActive: boolean;
  }[];
}

export default function SchedulePage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const response = await fetch('/api/pages');
        if (response.ok) {
          const data = await response.json();
          setPages(data.pages || []);
          if (data.pages?.length === 1) {
            setSelectedPageId(data.pages[0]._id);
          }
        }
      } catch (err) {
        log.error('Failed to fetch pages', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        setIsLoading(false);
      }
    };
    fetchPages();
  }, []);

  const selectedPage = pages.find(p => p._id === selectedPageId);
  const activeConnections = selectedPage?.connections.filter(c => c.isActive) || [];

  return (
    <div className="min-h-screen bg-[color:var(--bg)] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Link
                href="/dashboard"
                className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] text-sm"
              >
                ← Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-[color:var(--fg)]">Schedule Optimization</h1>
            <p className="text-[color:var(--fg-muted)] mt-1">
              Let AI analyze your engagement data and find the best times to post
            </p>
          </div>
        </div>

        {/* Page Selector */}
        {!isLoading && pages.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-[color:var(--fg-muted)] mb-2">
              Select Page to Analyze
            </label>
            <select
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              className="w-full max-w-md bg-[color:var(--bg-elevated)] border border-[color:var(--hairline)] rounded-lg px-4 py-2 text-[color:var(--fg)] focus:ring-2 focus:ring-[color:var(--accent-glow)]"
            >
              <option value="">All pages (aggregated)</option>
              {pages.map((page) => (
                <option key={page._id} value={page._id}>
                  {page.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Connected Platforms Summary */}
        {selectedPage && (
          <div className="mb-6 p-4 bg-[color:var(--bg-elevated)] rounded-lg">
            <h3 className="text-sm font-medium text-[color:var(--fg-muted)] mb-2">Active Platforms</h3>
            <div className="flex flex-wrap gap-2">
              {activeConnections.length === 0 ? (
                <p className="text-[color:var(--fg-muted)] text-sm">No active connections</p>
              ) : (
                activeConnections.map((conn) => (
                  <div
                    key={conn.platform}
                    className={`px-3 py-1 rounded-full text-sm ${
                      conn.platform === 'linkedin'
                        ? 'bg-[color:var(--accent)]/30 text-[color:var(--accent)]'
                        : conn.platform === 'facebook'
                        ? 'bg-[color:var(--accent)]/30 text-[color:var(--accent)]'
                        : conn.platform === 'twitter'
                        ? 'bg-sky-500/30 text-sky-300'
                        : 'bg-[color:var(--surface)] text-[color:var(--fg-muted)]'
                    }`}
                  >
                    {conn.platform.charAt(0).toUpperCase() + conn.platform.slice(1)}: {conn.platformUsername}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <Spinner size="lg" />
            <p className="text-[color:var(--fg-muted)] mt-4">Loading...</p>
          </div>
        )}

        {/* No Pages State */}
        {!isLoading && pages.length === 0 && (
          <div className="bg-[color:var(--bg-elevated)] rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">📄</div>
            <h2 className="text-xl font-bold text-[color:var(--fg)] mb-2">No Pages Found</h2>
            <p className="text-[color:var(--fg-muted)] mb-6">
              Create a page and connect some platforms to start optimizing your schedule.
            </p>
            <Button asChild variant="primary">
              <Link href="/dashboard">
                Go to Dashboard
              </Link>
            </Button>
          </div>
        )}

        {/* Schedule Optimizer */}
        {!isLoading && pages.length > 0 && (
          <ScheduleOptimizer {...(selectedPageId ? { pageId: selectedPageId } : {})} />
        )}

        {/* Tips Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-[color:var(--bg-elevated)]/50 rounded-lg border border-[color:var(--hairline)]">
            <div className="text-2xl mb-2">📈</div>
            <h3 className="font-medium text-[color:var(--fg)] mb-1">More Data = Better Insights</h3>
            <p className="text-sm text-[color:var(--fg-muted)]">
              The AI analyzes your historical engagement data. More posts = more accurate recommendations.
            </p>
          </div>
          <div className="p-4 bg-[color:var(--bg-elevated)]/50 rounded-lg border border-[color:var(--hairline)]">
            <div className="text-2xl mb-2">🔄</div>
            <h3 className="font-medium text-[color:var(--fg)] mb-1">Re-analyze Regularly</h3>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Audience behavior changes over time. Run analysis monthly for best results.
            </p>
          </div>
          <div className="p-4 bg-[color:var(--bg-elevated)]/50 rounded-lg border border-[color:var(--hairline)]">
            <div className="text-2xl mb-2">🎯</div>
            <h3 className="font-medium text-[color:var(--fg)] mb-1">Platform-Specific Times</h3>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Each platform has unique peak times. The AI considers this for cross-platform optimization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

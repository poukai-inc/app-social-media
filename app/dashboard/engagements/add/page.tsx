'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';

export default function AddEngagementPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [postUrl, setPostUrl] = useState('');
  const [postContent, setPostContent] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [engagementType, setEngagementType] = useState<'like' | 'comment' | 'both'>('both');
  const [generateAIComment, setGenerateAIComment] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<{ url: string; success: boolean; error?: string }[] | null>(null);
  const [error, setError] = useState('');

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postUrl.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postUrl: postUrl.trim(),
          postContent: postContent.trim() || undefined,
          engagementType,
          generateAIComment,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to add engagement');
        return;
      }

      router.push('/dashboard/engagements');
    } catch {
      setError('Failed to add engagement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkUrls.trim()) return;

    setIsSubmitting(true);
    setError('');
    setResults(null);

    const urls = bulkUrls
      .split('\n')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      setError('Please enter at least one URL');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/engagements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postUrls: urls,
          engagementType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to add engagements');
        return;
      }

      setResults(data.results);
    } catch {
      setError('Failed to add engagements');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/engagements"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Engagements
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Add Posts to Engage
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Paste LinkedIn post URLs to add them to your engagement queue
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="mb-6 flex rounded-lg border border-zinc-200 p-1 dark:border-zinc-700">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'single'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          Single Post
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'bulk'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          Bulk Import
        </button>
      </div>

      {/* Single Post Form */}
      {mode === 'single' && (
        <form onSubmit={handleSubmitSingle} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              LinkedIn Post URL
            </label>
            <input
              type="url"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://www.linkedin.com/feed/update/..."
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              required
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Copy the URL from a LinkedIn post you want to engage with
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Post Content <span className="text-zinc-400">(optional but recommended)</span>
            </label>
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="Copy and paste the post content here for better AI-generated comments..."
              rows={4}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              LinkedIn API doesn&apos;t allow reading other users&apos; posts. Paste the content for better AI comments.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Engagement Type
            </label>
            <select
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value as 'like' | 'comment' | 'both')}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="both">Like + Comment</option>
              <option value="like">Like Only</option>
              <option value="comment">Comment Only</option>
            </select>
          </div>

          {(engagementType === 'comment' || engagementType === 'both') && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="generateAI"
                checked={generateAIComment}
                onChange={(e) => setGenerateAIComment(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-[color:var(--accent)] focus:ring-[color:var(--accent-glow)]"
              />
              <label htmlFor="generateAI" className="text-sm text-zinc-700 dark:text-zinc-300">
                Generate AI comment automatically
              </label>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !postUrl.trim()}
            className="w-full justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add to Queue
              </>
            )}
          </Button>
        </form>
      )}

      {/* Bulk Import Form */}
      {mode === 'bulk' && (
        <form onSubmit={handleSubmitBulk} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              LinkedIn Post URLs (one per line)
            </label>
            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder="https://www.linkedin.com/feed/update/...&#10;https://www.linkedin.com/posts/...&#10;https://www.linkedin.com/feed/update/..."
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              rows={8}
              required
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Paste multiple URLs, one per line (max 20 at a time)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Engagement Type
            </label>
            <select
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value as 'like' | 'comment' | 'both')}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="both">Like + Comment</option>
              <option value="like">Like Only</option>
              <option value="comment">Comment Only</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !bulkUrls.trim()}
            className="w-full justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Import All
              </>
            )}
          </Button>

          {/* Results */}
          {results && (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Import Results
              </h3>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {results.map((result, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 dark:border-zinc-800"
                  >
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                    )}
                    <span className="truncate text-zinc-600 dark:text-zinc-400">
                      {result.url}
                    </span>
                    {result.error && (
                      <span className="ml-auto text-xs text-red-500">{result.error}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Link
                  href="/dashboard/engagements"
                  className="text-sm font-medium text-[color:var(--accent)] hover:text-[color:var(--accent)]"
                >
                  View Queue →
                </Link>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

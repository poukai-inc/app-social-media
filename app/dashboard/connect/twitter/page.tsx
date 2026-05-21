'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:connect:twitter');

interface TwitterData {
  platform: 'twitter';
  platformId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  metadata: {
    name: string;
    username: string;
    profileImageUrl?: string;
  };
}

function ConnectTwitterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [twitterData, _setTwitterData] = useState<TwitterData | null>(() => {
    const dataParam = searchParams.get('data');
    if (!dataParam) return null;
    try {
      return JSON.parse(Buffer.from(dataParam, 'base64').toString()) as TwitterData;
    } catch {
      return null;
    }
  });
  const [appPages, setAppPages] = useState<{ _id: string; name: string }[]>([]);
  const [targetAppPage, setTargetAppPage] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const dataParam = searchParams.get('data');
    if (!dataParam) return null;
    try {
      JSON.parse(Buffer.from(dataParam, 'base64').toString());
      return null;
    } catch {
      return 'Invalid data received';
    }
  });

  useEffect(() => {
    // Fetch user's app pages
    const fetchAppPages = async () => {
      try {
        const response = await fetch('/api/pages');
        if (response.ok) {
          const data = await response.json();
          setAppPages(data.pages || []);
          if (data.pages?.length === 1) {
            setTargetAppPage(data.pages[0]._id);
          }
        }
      } catch (err) {
        log.error('Failed to fetch pages', { error: err instanceof Error ? err.message : String(err) });
      }
    };
    fetchAppPages();
  }, []);

  const handleConnect = async () => {
    if (!targetAppPage || !twitterData) return;

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`/api/pages/${targetAppPage}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'twitter',
          platformId: twitterData.platformId,
          platformUsername: twitterData.platformUsername,
          accessToken: twitterData.accessToken,
          refreshToken: twitterData.refreshToken,
          tokenExpiresAt: new Date(Date.now() + twitterData.expiresIn * 1000).toISOString(),
          metadata: twitterData.metadata,
        }),
      });

      if (response.ok) {
        router.push(`/dashboard?success=twitter_connected`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to connect Twitter account');
      }
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  if (error && !twitterData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full text-center">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <Link
            href="/dashboard"
            className="text-blue-400 hover:text-blue-300"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!twitterData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="bg-gray-800 rounded-lg p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-sky-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Connect X (Twitter)</h1>
              <p className="text-gray-400">Link your Twitter account to a page</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* Twitter Account Info */}
          <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-4">
              {twitterData.metadata.profileImageUrl ? (
                <img
                  src={twitterData.metadata.profileImageUrl}
                  alt={twitterData.metadata.name}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-sky-600 rounded-full flex items-center justify-center">
                  <span className="text-xl text-white">🐦</span>
                </div>
              )}
              <div>
                <div className="font-medium text-white">{twitterData.metadata.name}</div>
                <div className="text-sm text-gray-400">{twitterData.platformUsername}</div>
              </div>
              <div className="ml-auto px-3 py-1 bg-green-600/30 text-green-400 text-sm rounded">
                Authorized
              </div>
            </div>
          </div>

          {/* Select App Page */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Connect to App Page
            </label>
            <select
              value={targetAppPage}
              onChange={(e) => setTargetAppPage(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Select an app page...</option>
              {appPages.map((page) => (
                <option key={page._id} value={page._id}>
                  {page.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-500">
              Choose which of your app pages should post to this Twitter account
            </p>
          </div>

          {/* Permissions Info */}
          <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
            <h3 className="font-medium text-white mb-2">Permissions Granted</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>✓ Read and write tweets</li>
              <li>✓ Read user profile information</li>
              <li>✓ Offline access (for scheduling)</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <Link
              href="/dashboard"
              className="flex-1 px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              onClick={handleConnect}
              disabled={!targetAppPage || isConnecting}
              className="flex-1 px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConnecting ? 'Connecting...' : 'Connect Twitter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  );
}

export default function ConnectTwitterPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConnectTwitterPageContent />
    </Suspense>
  );
}

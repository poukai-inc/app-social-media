'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:connect:facebook');

interface FacebookPage {
  id: string;
  name: string;
  category?: string;
  picture?: string;
  token: string;
}

interface PageData {
  pages: FacebookPage[];
  userToken: string;
  expiresIn: number;
  targetPageId?: string;
}

function ConnectFacebookPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [appPages, setAppPages] = useState<{ _id: string; name: string }[]>([]);
  const [targetAppPage, setTargetAppPage] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Decode the data from URL
    const dataParam = searchParams.get('data');
    if (dataParam) {
      try {
        const decoded = JSON.parse(Buffer.from(dataParam, 'base64').toString());
        setPageData(decoded);
        if (decoded.targetPageId) {
          setTargetAppPage(decoded.targetPageId);
        }
        if (decoded.pages.length === 1) {
          setSelectedPage(decoded.pages[0].id);
        }
      } catch {
        setError('Invalid data received');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    // Fetch user's app pages
    const fetchAppPages = async () => {
      try {
        const response = await fetch('/api/pages');
        if (response.ok) {
          const data = await response.json();
          setAppPages(data.pages || []);
          if (data.pages?.length === 1 && !targetAppPage) {
            setTargetAppPage(data.pages[0]._id);
          }
        }
      } catch (err) {
        log.error('Failed to fetch pages', { error: err instanceof Error ? err.message : String(err) });
      }
    };
    fetchAppPages();
  }, [targetAppPage]);

  const handleConnect = async () => {
    if (!selectedPage || !targetAppPage || !pageData) return;

    const fbPage = pageData.pages.find(p => p.id === selectedPage);
    if (!fbPage) return;

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`/api/pages/${targetAppPage}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'facebook',
          platformId: fbPage.id,
          platformUsername: fbPage.name,
          accessToken: fbPage.token,
          tokenExpiresAt: new Date(Date.now() + pageData.expiresIn * 1000).toISOString(),
          metadata: {
            category: fbPage.category,
            pictureUrl: fbPage.picture,
          },
        }),
      });

      if (response.ok) {
        router.push(`/dashboard/pages/${targetAppPage}?success=facebook_connected`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to connect Facebook page');
      }
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  if (error && !pageData) {
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

  if (!pageData) {
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
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Connect Facebook Page</h1>
              <p className="text-gray-400">Select which Facebook Page to connect</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* Select App Page */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Connect to App Page
            </label>
            <select
              value={targetAppPage}
              onChange={(e) => setTargetAppPage(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an app page...</option>
              {appPages.map((page) => (
                <option key={page._id} value={page._id}>
                  {page.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-500">
              Choose which of your app pages should post to this Facebook Page
            </p>
          </div>

          {/* Select Facebook Page */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Facebook Page
            </label>
            <div className="space-y-3">
              {pageData.pages.map((page) => (
                <label
                  key={page.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedPage === page.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="facebookPage"
                    value={page.id}
                    checked={selectedPage === page.id}
                    onChange={() => setSelectedPage(page.id)}
                    className="sr-only"
                  />
                  {page.picture ? (
                    <img
                      src={page.picture}
                      alt={page.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📄</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-white">{page.name}</div>
                    {page.category && (
                      <div className="text-sm text-gray-400">{page.category}</div>
                    )}
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedPage === page.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-500'
                    }`}
                  >
                    {selectedPage === page.id && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </label>
              ))}
            </div>
            
            {/* Missing pages warning */}
            <div className="mt-4 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
              <p className="text-sm text-amber-400">
                <strong>Missing a page?</strong> Facebook only returns pages where you have Admin/Editor access. 
                Pages managed through Business Manager may require additional permissions.
              </p>
            </div>
          </div>

          {/* Permissions Info */}
          <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
            <h3 className="font-medium text-white mb-2">Permissions Granted</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>✓ Create and manage posts on your Facebook Page</li>
              <li>✓ Read engagement data (likes, comments, shares)</li>
              <li>✓ Upload photos and videos</li>
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
              disabled={!selectedPage || !targetAppPage || isConnecting}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConnecting ? 'Connecting...' : 'Connect Facebook Page'}
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

export default function ConnectFacebookPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConnectFacebookPageContent />
    </Suspense>
  );
}

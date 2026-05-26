'use client';

import { useState } from 'react';
import type { PlatformType } from '@/lib/platforms/types';

interface PlatformConnectionDisplay {
  platform: PlatformType;
  platformId: string;
  platformUsername: string;
  isActive: boolean;
  connectedAt: string;
  tokenExpiresAt?: string;
  metadata?: Record<string, unknown>;
}

interface PlatformConnectionsProps {
  pageId: string;
  connections: PlatformConnectionDisplay[];
  onConnectionChange?: () => void;
}

const PLATFORM_INFO: Record<PlatformType, { name: string; icon: string; color: string; bgColor: string }> = {
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    color: 'text-[color:var(--accent)]',
    bgColor: 'bg-[color:var(--accent)]',
  },
  facebook: {
    name: 'Facebook',
    icon: '📘',
    color: 'text-[color:var(--accent)]',
    bgColor: 'bg-[color:var(--accent)]',
  },
  twitter: {
    name: 'Twitter / X',
    icon: '🐦',
    color: 'text-sky-400',
    bgColor: 'bg-sky-600',
  },
  instagram: {
    name: 'Instagram',
    icon: '📷',
    color: 'text-pink-400',
    bgColor: 'bg-gradient-to-r from-purple-600 to-pink-600',
  },
};

const AVAILABLE_PLATFORMS: PlatformType[] = ['linkedin', 'facebook', 'twitter'];
// Instagram coming soon

export default function PlatformConnections({
  pageId,
  connections,
  onConnectionChange,
}: PlatformConnectionsProps) {
  const [isLoading, setIsLoading] = useState<PlatformType | null>(null);

  const handleConnect = async (platform: PlatformType) => {
    if (platform === 'facebook') {
      // Redirect to Facebook OAuth
      window.location.assign(`/api/auth/facebook?pageId=${pageId}`);
    } else if (platform === 'twitter') {
      // Redirect to Twitter OAuth
      window.location.assign(`/api/auth/twitter?pageId=${pageId}`);
    } else if (platform === 'linkedin') {
      // For LinkedIn, we can use the current session's credentials
      // This will connect the page to the user's LinkedIn profile
      const confirmed = confirm(
        'This will connect your LinkedIn profile to this page using your current login credentials. Continue?'
      );
      if (confirmed) {
        setIsLoading('linkedin');
        try {
          const response = await fetch(`/api/pages/${pageId}/connections/linkedin`, {
            method: 'POST',
          });
          if (response.ok) {
            onConnectionChange?.();
          } else {
            const data = await response.json();
            alert(data.error || 'Failed to connect LinkedIn');
          }
        } catch {
          alert('Failed to connect LinkedIn. Please try again.');
        } finally {
          setIsLoading(null);
        }
      }
    } else {
      alert(`${PLATFORM_INFO[platform].name} connection coming soon!`);
    }
  };

  const handleDisconnect = async (platform: PlatformType) => {
    if (!confirm(`Are you sure you want to disconnect ${PLATFORM_INFO[platform].name}?`)) {
      return;
    }

    setIsLoading(platform);

    try {
      const response = await fetch(
        `/api/pages/${pageId}/connections?platform=${platform}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        onConnectionChange?.();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to disconnect');
      }
    } catch {
      alert('Failed to disconnect. Please try again.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleToggleActive = async (platform: PlatformType, currentState: boolean) => {
    setIsLoading(platform);

    try {
      const response = await fetch(`/api/pages/${pageId}/connections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          isActive: !currentState,
        }),
      });

      if (response.ok) {
        onConnectionChange?.();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update');
      }
    } catch {
      alert('Failed to update. Please try again.');
    } finally {
      setIsLoading(null);
    }
  };

  const isTokenExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const connectedPlatforms = new Set(connections.map(c => c.platform));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Platform Connections</h3>
      
      {/* Connected Platforms */}
      <div className="space-y-3">
        {connections.map((connection) => {
          const info = PLATFORM_INFO[connection.platform];
          const expired = isTokenExpired(connection.tokenExpiresAt);
          
          return (
            <div
              key={connection.platform}
              className={`p-4 rounded-lg border ${
                expired
                  ? 'border-yellow-600 bg-yellow-900/20'
                  : connection.isActive
                  ? 'border-green-600 bg-green-900/20'
                  : 'border-gray-600 bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${info.bgColor} rounded-lg flex items-center justify-center text-xl`}>
                    {info.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{info.name}</span>
                      {expired ? (
                        <span className="px-2 py-0.5 bg-yellow-600/50 text-yellow-300 text-xs rounded">
                          Token Expired
                        </span>
                      ) : connection.isActive ? (
                        <span className="px-2 py-0.5 bg-green-600/50 text-green-300 text-xs rounded">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-gray-600/50 text-gray-300 text-xs rounded">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">
                      {connection.platformUsername}
                      {connection.connectedAt && (
                        <span className="ml-2">• Connected {formatDate(connection.connectedAt)}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {expired ? (
                    <button
                      onClick={() => handleConnect(connection.platform)}
                      className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-500 transition-colors"
                    >
                      Reconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleActive(connection.platform, connection.isActive)}
                      disabled={isLoading === connection.platform}
                      className={`px-3 py-1.5 text-sm rounded transition-colors ${
                        connection.isActive
                          ? 'bg-gray-600 text-white hover:bg-gray-500'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      {isLoading === connection.platform ? '...' : connection.isActive ? 'Pause' : 'Enable'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(connection.platform)}
                    disabled={isLoading === connection.platform}
                    className="px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded hover:bg-red-600/30 transition-colors"
                  >
                    {isLoading === connection.platform ? '...' : 'Disconnect'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Available Platforms to Connect */}
      {AVAILABLE_PLATFORMS.some(p => !connectedPlatforms.has(p)) && (
        <div className="pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-3">Connect more platforms:</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_PLATFORMS.filter(p => !connectedPlatforms.has(p)).map((platform) => {
              const info = PLATFORM_INFO[platform];
              return (
                <button
                  key={platform}
                  onClick={() => handleConnect(platform)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span>{info.icon}</span>
                  <span className="text-white">Connect {info.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Coming Soon */}
      <div className="pt-4 border-t border-gray-700">
        <p className="text-sm text-gray-500">
          Coming soon: Instagram
        </p>
      </div>
    </div>
  );
}

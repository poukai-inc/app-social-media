'use client';

import { useState } from 'react';
import type { PlatformType } from '@/lib/platforms/types';
import { Button } from '@poukai-inc/ui/atoms/Button';

interface PlatformTiming {
  platform: PlatformType;
  bestDays: string[];
  bestHours: number[];
  peakEngagementTime: string;
  averageEngagement: number;
  recommendedFrequency: string;
  insights: string[];
}

interface OptimalSlot {
  day: string;
  hour: number;
  platforms: PlatformType[];
  score: number;
  reason: string;
}

interface ScheduleRecommendation {
  platformTimings: PlatformTiming[];
  optimalSlots: OptimalSlot[];
  globalInsights: string[];
  weeklySchedule: {
    day: string;
    slots: {
      time: string;
      platforms: PlatformType[];
      priority: 'high' | 'medium' | 'low';
    }[];
  }[];
}

interface ScheduleOptimizerProps {
  pageId?: string;
}

const PLATFORM_COLORS: Record<PlatformType, string> = {
  linkedin: 'bg-[color:var(--accent)]',
  facebook: 'bg-[color:var(--accent)]',
  twitter: 'bg-sky-500',
  instagram: 'bg-gradient-to-r from-purple-600 to-pink-500',
};

const PLATFORM_NAMES: Record<PlatformType, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'Twitter/X',
  instagram: 'Instagram',
};

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ScheduleOptimizer({ pageId }: ScheduleOptimizerProps) {
  const [recommendation, setRecommendation] = useState<ScheduleRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);

  const analyzeSchedule = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (pageId) params.append('pageId', pageId);
      if (quickMode) params.append('quick', 'true');

      const response = await fetch(`/api/schedule/optimize?${params}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to analyze schedule');
      }

      const data = await response.json();
      setRecommendation(data.recommendation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const applySchedule = async () => {
    if (!pageId || !recommendation) return;

    setIsApplying(true);
    setError(null);

    try {
      const response = await fetch('/api/schedule/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          schedule: recommendation.weeklySchedule,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to apply schedule');
      }

      alert('Schedule preferences saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply schedule');
    } finally {
      setIsApplying(false);
    }
  };

  const formatHour = (hour: number) => {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${suffix}`;
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'text-green-400 border-green-600';
      case 'medium': return 'text-yellow-400 border-yellow-600';
      case 'low': return 'text-gray-400 border-gray-600';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🤖</span>
            <span>AI Schedule Optimizer</span>
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Analyze your engagement data to find the best times to post
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={quickMode}
              onChange={(e) => setQuickMode(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-[color:var(--accent)] focus:ring-[color:var(--accent-glow)]"
            />
            Quick mode (no AI)
          </label>
          
          <Button
            variant="primary"
            onClick={analyzeSchedule}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <span>✨</span>
                Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {!recommendation && !isLoading && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-white mb-2">Ready to Optimize Your Schedule</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Click &quot;Analyze&quot; to let AI examine your engagement data across all platforms
            and find the optimal posting times.
          </p>
        </div>
      )}

      {recommendation && (
        <div className="space-y-6">
          {/* Global Insights */}
          {recommendation.globalInsights.length > 0 && (
            <div className="p-4 bg-[color:var(--accent)]/30 border border-[color:var(--accent)]/50 rounded-lg">
              <h3 className="text-sm font-medium text-[color:var(--accent)] mb-2">🧠 AI Insights</h3>
              <ul className="space-y-1">
                {recommendation.globalInsights.map((insight, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-[color:var(--accent)] mt-0.5">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Platform-specific recommendations */}
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Platform Timing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendation.platformTimings.map((platform) => (
                <div
                  key={platform.platform}
                  className="p-4 bg-gray-700/50 rounded-lg border border-gray-600"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 ${PLATFORM_COLORS[platform.platform]} rounded flex items-center justify-center text-white text-sm`}>
                      {platform.platform.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-white">
                      {PLATFORM_NAMES[platform.platform]}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-400">Best days:</span>
                      <span className="ml-2 text-white">
                        {platform.bestDays.slice(0, 3).join(', ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Best times:</span>
                      <span className="ml-2 text-white">
                        {platform.bestHours.slice(0, 3).map(h => formatHour(h)).join(', ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Peak:</span>
                      <span className="ml-2 text-green-400 font-medium">
                        {platform.peakEngagementTime}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Recommended:</span>
                      <span className="ml-2 text-white">
                        {platform.recommendedFrequency}
                      </span>
                    </div>
                  </div>
                  
                  {platform.insights.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      <p className="text-xs text-gray-400">{platform.insights[0]}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Optimal Slots */}
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Top Posting Slots</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recommendation.optimalSlots.slice(0, 8).map((slot, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-gray-700/50 rounded-lg border border-gray-600"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{slot.day}</span>
                    <span className="text-green-400 text-sm">{formatHour(slot.hour)}</span>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {slot.platforms.map((p) => (
                      <div
                        key={p}
                        className={`w-6 h-6 ${PLATFORM_COLORS[p]} rounded text-xs flex items-center justify-center text-white`}
                        title={PLATFORM_NAMES[p]}
                      >
                        {p.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">{slot.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Schedule */}
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Recommended Weekly Schedule</h3>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-2 min-w-[700px]">
                {DAYS_ORDER.map((day) => {
                  const daySchedule = recommendation.weeklySchedule.find(d => d.day === day);
                  return (
                    <div key={day} className="bg-gray-700/30 rounded-lg p-3">
                      <div className="text-sm font-medium text-white mb-2">{day.slice(0, 3)}</div>
                      <div className="space-y-2">
                        {daySchedule?.slots.map((slot, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border ${getPriorityColor(slot.priority)} bg-gray-800/50`}
                          >
                            <div className="text-xs font-medium">{slot.time}</div>
                            <div className="flex gap-1 mt-1">
                              {slot.platforms.map((p) => (
                                <div
                                  key={p}
                                  className={`w-4 h-4 ${PLATFORM_COLORS[p]} rounded text-[8px] flex items-center justify-center text-white`}
                                  title={PLATFORM_NAMES[p]}
                                >
                                  {p.charAt(0).toUpperCase()}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {(!daySchedule || daySchedule.slots.length === 0) && (
                          <div className="text-xs text-gray-500 text-center py-4">
                            No posts
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Apply Button */}
          {pageId && (
            <div className="flex justify-end pt-4 border-t border-gray-700">
              <button
                onClick={applySchedule}
                disabled={isApplying}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isApplying ? 'Saving...' : 'Save Schedule Preferences'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

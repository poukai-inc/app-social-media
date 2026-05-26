'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import NextImage from 'next/image';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:pages:[id]:settings');
import {
  ArrowLeft,
  Save,
  User,
  Building2,
  Trash2,
  Loader2,
  AlertTriangle,
  Database,
  ExternalLink,
} from 'lucide-react';
import PlatformConnections from '@/components/platform-connections';
import type { PlatformType } from '@/lib/platforms/types';

interface Page {
  _id: string;
  type: 'personal' | 'organization' | 'manual';
  name: string;
  avatar?: string;
  vanityName?: string;
  isManual?: boolean;
  connections?: {
    platform: PlatformType;
    platformId: string;
    platformUsername: string;
    isActive: boolean;
    connectedAt: string;
    tokenExpiresAt?: string;
    metadata?: Record<string, unknown>;
  }[];
  contentStrategy: {
    persona: string;
    topics: string[];
    tone: string;
    targetAudience: string;
    postingFrequency: number;
    preferredAngles: string[];
    avoidTopics: string[];
    customInstructions: string;
  };
  contentSources: {
    blogUrls: string[];
    rssFeeds: string[];
    keywords: string[];
  };
  schedule: {
    timezone: string;
    preferredDays: number[];
    preferredTimes: string[];
    autoGenerate: boolean;
    autoApprove: boolean;
    minConfidenceForAutoApprove: number;
  };
  isActive: boolean;
}

const POST_ANGLES = [
  { id: 'problem_recognition', label: 'Problem Recognition' },
  { id: 'war_story', label: 'War Stories' },
  { id: 'opinionated_take', label: 'Opinionated Takes' },
  { id: 'insight', label: 'Insights' },
  { id: 'how_to', label: 'How-To Guides' },
  { id: 'case_study', label: 'Case Studies' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  { value: 'UTC', label: 'UTC' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PageSettings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const pageId = params.id as string;

  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [contentStrategy, setContentStrategy] = useState({
    persona: '',
    topics: [] as string[],
    tone: '',
    targetAudience: '',
    postingFrequency: 3,
    preferredAngles: [] as string[],
    avoidTopics: [] as string[],
    customInstructions: '',
  });
  const [schedule, setSchedule] = useState({
    timezone: 'America/New_York',
    preferredDays: [1, 2, 3, 4, 5] as number[],
    preferredTimes: ['09:00', '17:00'] as string[],
    autoGenerate: false,
    autoApprove: false,
    minConfidenceForAutoApprove: 0.8,
  });
  const [contentSources, setContentSources] = useState({
    blogUrls: [] as string[],
    rssFeeds: [] as string[],
    keywords: [] as string[],
  });
  const [isActive, setIsActive] = useState(true);

  // Input helpers
  const [topicInput, setTopicInput] = useState('');
  const [blogInput, setBlogInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [timeInput, setTimeInput] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchPage = async () => {
    try {
      const response = await fetch(`/api/pages/${pageId}`);
      if (response.ok) {
        const data = await response.json();
        setPage(data.page);
        
        // Initialize form with existing data
        if (data.page.contentStrategy) {
          setContentStrategy({
            persona: data.page.contentStrategy.persona || '',
            topics: data.page.contentStrategy.topics || [],
            tone: data.page.contentStrategy.tone || '',
            targetAudience: data.page.contentStrategy.targetAudience || '',
            postingFrequency: data.page.contentStrategy.postingFrequency || 3,
            preferredAngles: data.page.contentStrategy.preferredAngles || [],
            avoidTopics: data.page.contentStrategy.avoidTopics || [],
            customInstructions: data.page.contentStrategy.customInstructions || '',
          });
        }
        if (data.page.schedule) {
          setSchedule({
            timezone: data.page.schedule.timezone || 'America/New_York',
            preferredDays: data.page.schedule.preferredDays || [1, 2, 3, 4, 5],
            preferredTimes: data.page.schedule.preferredTimes || ['09:00', '17:00'],
            autoGenerate: data.page.schedule.autoGenerate || false,
            autoApprove: data.page.schedule.autoApprove || false,
            minConfidenceForAutoApprove: data.page.schedule.minConfidenceForAutoApprove || 0.8,
          });
        }
        if (data.page.contentSources) {
          setContentSources({
            blogUrls: data.page.contentSources.blogUrls || [],
            rssFeeds: data.page.contentSources.rssFeeds || [],
            keywords: data.page.contentSources.keywords || [],
          });
        }
        setIsActive(data.page.isActive !== false);
      } else if (response.status === 404) {
        router.push('/dashboard/pages');
      }
    } catch (error) {
      log.error('Failed to fetch page', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  // Refactor deferred — see BACKLOG #122 (move to TanStack Query / Suspense)
  useEffect(() => {
    if (session && pageId) {
      setTimeout(() => fetchPage(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pageId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentStrategy,
          contentSources,
          schedule,
          isActive,
        }),
      });

      if (response.ok) {
        router.push(`/dashboard/pages/${pageId}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save settings');
      }
    } catch (error) {
      log.error('Failed to save', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/pages/${pageId}?force=true`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/dashboard/pages');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete page');
      }
    } catch (error) {
      log.error('Failed to delete', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to delete page');
    } finally {
      setDeleting(false);
    }
  };

  // Helper functions for array management
  const addItem = (
    array: string[],
    setter: (arr: string[]) => void,
    input: string,
    inputSetter: (val: string) => void
  ) => {
    if (input.trim() && !array.includes(input.trim())) {
      setter([...array, input.trim()]);
      inputSetter('');
    }
  };

  const removeItem = (array: string[], setter: (arr: string[]) => void, item: string) => {
    setter(array.filter((i) => i !== item));
  };

  const toggleAngle = (angle: string) => {
    setContentStrategy({
      ...contentStrategy,
      preferredAngles: contentStrategy.preferredAngles.includes(angle)
        ? contentStrategy.preferredAngles.filter((a) => a !== angle)
        : [...contentStrategy.preferredAngles, angle],
    });
  };

  const toggleDay = (day: number) => {
    setSchedule({
      ...schedule,
      preferredDays: schedule.preferredDays.includes(day)
        ? schedule.preferredDays.filter((d) => d !== day)
        : [...schedule.preferredDays, day].sort(),
    });
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--accent)]"></div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <p className="text-gray-500">Page not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/pages/${pageId}`}
            className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Page
          </Link>

          <div className="flex items-center gap-4">
            {page.avatar ? (
              <NextImage
                src={page.avatar}
                alt={page.name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover"
                unoptimized
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {page.name} Settings
              </h1>
              <p className="text-gray-500 dark:text-gray-400 capitalize">
                {page.type} Profile Settings
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Platform Connections */}
          <section className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
            <PlatformConnections
              pageId={pageId}
              connections={page.connections || []}
              onConnectionChange={fetchPage}
            />
          </section>

          {/* Content Strategy */}
          <section className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Content Strategy
            </h2>

            <div className="space-y-6">
              {/* Persona */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Persona / Voice
                </label>
                <textarea
                  value={contentStrategy.persona}
                  onChange={(e) =>
                    setContentStrategy({ ...contentStrategy, persona: e.target.value })
                  }
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>

              {/* Tone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tone & Style
                </label>
                <input
                  type="text"
                  value={contentStrategy.tone}
                  onChange={(e) =>
                    setContentStrategy({ ...contentStrategy, tone: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={contentStrategy.targetAudience}
                  onChange={(e) =>
                    setContentStrategy({ ...contentStrategy, targetAudience: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>

              {/* Topics */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Topics
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(),
                      addItem(
                        contentStrategy.topics,
                        (topics) => setContentStrategy({ ...contentStrategy, topics }),
                        topicInput,
                        setTopicInput
                      ))
                    }
                    placeholder="Add topic..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() =>
                      addItem(
                        contentStrategy.topics,
                        (topics) => setContentStrategy({ ...contentStrategy, topics }),
                        topicInput,
                        setTopicInput
                      )
                    }
                    className="px-4 py-2 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)]"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contentStrategy.topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-3 py-1 bg-[color:var(--surface)] text-[color:var(--accent)] rounded-full text-sm flex items-center gap-1"
                    >
                      {topic}
                      <button
                        onClick={() =>
                          removeItem(
                            contentStrategy.topics,
                            (topics) => setContentStrategy({ ...contentStrategy, topics }),
                            topic
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Preferred Angles */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Preferred Post Angles
                </label>
                <div className="flex flex-wrap gap-2">
                  {POST_ANGLES.map((angle) => (
                    <button
                      key={angle.id}
                      onClick={() => toggleAngle(angle.id)}
                      className={`px-3 py-1.5 rounded-lg border-2 text-sm transition-colors ${
                        contentStrategy.preferredAngles.includes(angle.id)
                          ? 'border-[color:var(--accent)] bg-[color:var(--accent-glow)] text-[color:var(--accent)]'
                          : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {angle.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Posting Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Posting Frequency: {contentStrategy.postingFrequency}x per week
                </label>
                <input
                  type="range"
                  min="1"
                  max="7"
                  value={contentStrategy.postingFrequency}
                  onChange={(e) =>
                    setContentStrategy({
                      ...contentStrategy,
                      postingFrequency: parseInt(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Custom Instructions (Optional)
                </label>
                <textarea
                  value={contentStrategy.customInstructions}
                  onChange={(e) =>
                    setContentStrategy({ ...contentStrategy, customInstructions: e.target.value })
                  }
                  rows={3}
                  placeholder="Any additional instructions for AI content generation..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </section>

          {/* Content Sources */}
          <section className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Content Sources
            </h2>

            <div className="space-y-6">
              {/* Blog URLs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Blog URLs (for repurposing)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="url"
                    value={blogInput}
                    onChange={(e) => setBlogInput(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(),
                      addItem(
                        contentSources.blogUrls,
                        (blogUrls) => setContentSources({ ...contentSources, blogUrls }),
                        blogInput,
                        setBlogInput
                      ))
                    }
                    placeholder="https://..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() =>
                      addItem(
                        contentSources.blogUrls,
                        (blogUrls) => setContentSources({ ...contentSources, blogUrls }),
                        blogInput,
                        setBlogInput
                      )
                    }
                    className="px-4 py-2 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)]"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-1">
                  {contentSources.blogUrls.map((url) => (
                    <div
                      key={url}
                      className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-zinc-800 rounded text-sm"
                    >
                      <span className="text-gray-700 dark:text-gray-300 truncate">{url}</span>
                      <button
                        onClick={() =>
                          removeItem(
                            contentSources.blogUrls,
                            (blogUrls) => setContentSources({ ...contentSources, blogUrls }),
                            url
                          )
                        }
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Keywords (for content inspiration)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(),
                      addItem(
                        contentSources.keywords,
                        (keywords) => setContentSources({ ...contentSources, keywords }),
                        keywordInput,
                        setKeywordInput
                      ))
                    }
                    placeholder="Add keyword..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() =>
                      addItem(
                        contentSources.keywords,
                        (keywords) => setContentSources({ ...contentSources, keywords }),
                        keywordInput,
                        setKeywordInput
                      )
                    }
                    className="px-4 py-2 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)]"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contentSources.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full text-sm flex items-center gap-1"
                    >
                      {keyword}
                      <button
                        onClick={() =>
                          removeItem(
                            contentSources.keywords,
                            (keywords) => setContentSources({ ...contentSources, keywords }),
                            keyword
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Database Sources */}
          <section className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                  <Database className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Database Sources
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Connect MySQL/PostgreSQL databases to pull content
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard/pages/${pageId}/data-sources`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                Configure
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* Schedule */}
          <section className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Posting Schedule
            </h2>


            <div className="space-y-6">
              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Timezone
                </label>
                <select
                  value={schedule.timezone}
                  onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Posting Days
                </label>
                <div className="flex gap-2">
                  {DAYS.map((day, index) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(index)}
                      className={`flex-1 py-2 rounded-lg border-2 font-medium text-sm transition-colors ${
                        schedule.preferredDays.includes(index)
                          ? 'border-[color:var(--accent)] bg-[color:var(--accent-glow)] text-[color:var(--accent)]'
                          : 'border-gray-200 dark:border-zinc-700 text-gray-500'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Times */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Preferred Times
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="time"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() => {
                      if (timeInput && !schedule.preferredTimes.includes(timeInput)) {
                        setSchedule({
                          ...schedule,
                          preferredTimes: [...schedule.preferredTimes, timeInput].sort(),
                        });
                        setTimeInput('');
                      }
                    }}
                    className="px-4 py-2 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)]"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {schedule.preferredTimes.map((time) => (
                    <span
                      key={time}
                      className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full text-sm flex items-center gap-1"
                    >
                      {time}
                      <button
                        onClick={() =>
                          setSchedule({
                            ...schedule,
                            preferredTimes: schedule.preferredTimes.filter((t) => t !== time),
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Auto-generation */}
              <div className="border-t border-gray-200 dark:border-zinc-700 pt-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedule.autoGenerate}
                    onChange={(e) =>
                      setSchedule({ ...schedule, autoGenerate: e.target.checked })
                    }
                    className="w-5 h-5 rounded border-gray-300"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Auto-generate posts
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Automatically create draft posts based on your content strategy
                    </div>
                  </div>
                </label>

                {schedule.autoGenerate && (
                  <div className="mt-4 ml-8 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schedule.autoApprove}
                        onChange={(e) =>
                          setSchedule({ ...schedule, autoApprove: e.target.checked })
                        }
                        className="w-5 h-5 rounded border-gray-300"
                      />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          Auto-approve high confidence posts
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Posts meeting confidence threshold will be scheduled automatically
                        </div>
                      </div>
                    </label>

                    {schedule.autoApprove && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Minimum Confidence: {(schedule.minConfidenceForAutoApprove * 100).toFixed(0)}%
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="1"
                          step="0.05"
                          value={schedule.minConfidenceForAutoApprove}
                          onChange={(e) =>
                            setSchedule({
                              ...schedule,
                              minConfidenceForAutoApprove: parseFloat(e.target.value),
                            })
                          }
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Page Status */}
          <section className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Page Status
            </h2>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  Page Active
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Deactivating will pause all auto-generation and scheduling for this page
                </div>
              </div>
            </label>
          </section>

          {/* Danger Zone */}
          <section className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900 p-6">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-4">
              Danger Zone
            </h2>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete Page
              </button>
            ) : (
              <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-red-300 dark:border-red-800">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Are you sure you want to delete this page?
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      This action cannot be undone. All page settings will be permanently deleted.
                      Posts will remain but will be unlinked from this page.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Yes, Delete Page
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Link
              href={`/dashboard/pages/${pageId}`}
              className="px-6 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

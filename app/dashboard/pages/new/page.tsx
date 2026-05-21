'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NextImage from 'next/image';
import { logger } from '@/lib/logger';

const log = logger.child('dashboard:pages:new');
import {
  ArrowLeft,
  ArrowRight,
  User,
  Building2,
  Check,
  Sparkles,
  Target,
  Calendar,
  Loader2,
  PenLine,
} from 'lucide-react';

interface AvailableAccount {
  id: string;
  type: 'personal' | 'organization' | 'manual';
  name: string;
  avatar?: string;
  vanityName?: string;
  organizationId?: string;
  alreadyAdded: boolean;
  isManual?: boolean;
}

const POST_ANGLES = [
  { id: 'problem_recognition', label: 'Problem Recognition', desc: 'Highlight problems your audience faces' },
  { id: 'war_story', label: 'War Stories', desc: 'Personal experiences and lessons learned' },
  { id: 'opinionated_take', label: 'Opinionated Takes', desc: 'Strong stances on industry topics' },
  { id: 'insight', label: 'Insights', desc: 'Educational tips and observations' },
  { id: 'how_to', label: 'How-To Guides', desc: 'Step-by-step tutorials' },
  { id: 'case_study', label: 'Case Studies', desc: 'Specific examples with results' },
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

export default function NewPagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<AvailableAccount[]>([]);
  const [creationMode, setCreationMode] = useState<'select' | 'manual'>('select');

  // Form state
  const [selectedAccount, setSelectedAccount] = useState<AvailableAccount | null>(null);
  const [manualPageName, setManualPageName] = useState('');
  const [manualPageDescription, setManualPageDescription] = useState('');
  const [contentStrategy, setContentStrategy] = useState({
    persona: '',
    topics: [] as string[],
    tone: '',
    targetAudience: '',
    postingFrequency: 3,
    preferredAngles: ['insight', 'war_story'] as string[],
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
  const [contentSources] = useState({
    blogUrls: [] as string[],
    keywords: [] as string[],
  });

  // Input helpers
  const [topicInput, setTopicInput] = useState('');
  const [timeInput, setTimeInput] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchAvailableAccounts = async () => {
    try {
      const response = await fetch('/api/pages/available');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts);
      }
    } catch (error) {
      log.error('Failed to fetch accounts', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      setTimeout(() => fetchAvailableAccounts(), 0);
    }
  }, [session]);

  const handleSubmit = async () => {
    // For manual mode, we don't need a selected account
    if (creationMode === 'select' && !selectedAccount) return;
    if (creationMode === 'manual' && !manualPageName.trim()) return;

    setSaving(true);
    try {
      const payload = creationMode === 'manual'
        ? {
            isManual: true,
            name: manualPageName.trim(),
            description: manualPageDescription.trim(),
            contentStrategy,
            contentSources,
            schedule,
          }
        : {
            type: selectedAccount!.type,
            linkedinId: selectedAccount!.id,
            organizationId: selectedAccount!.organizationId,
            name: selectedAccount!.name,
            avatar: selectedAccount!.avatar,
            vanityName: selectedAccount!.vanityName,
            contentStrategy,
            contentSources,
            schedule,
          };

      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/dashboard/pages/${data.page._id}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create page');
      }
    } catch (error) {
      log.error('Failed to create page', { error: error instanceof Error ? error.message : String(error) });
      alert('Failed to create page');
    } finally {
      setSaving(false);
    }
  };

  const addTopic = () => {
    if (topicInput.trim() && !contentStrategy.topics.includes(topicInput.trim())) {
      setContentStrategy({
        ...contentStrategy,
        topics: [...contentStrategy.topics, topicInput.trim()],
      });
      setTopicInput('');
    }
  };

  const removeTopic = (topic: string) => {
    setContentStrategy({
      ...contentStrategy,
      topics: contentStrategy.topics.filter((t) => t !== topic),
    });
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

  const addTime = () => {
    if (timeInput && !schedule.preferredTimes.includes(timeInput)) {
      setSchedule({
        ...schedule,
        preferredTimes: [...schedule.preferredTimes, timeInput].sort(),
      });
      setTimeInput('');
    }
  };

  const removeTime = (time: string) => {
    setSchedule({
      ...schedule,
      preferredTimes: schedule.preferredTimes.filter((t) => t !== time),
    });
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        if (creationMode === 'manual') {
          return manualPageName.trim().length > 0;
        }
        return selectedAccount !== null;
      case 2:
        return contentStrategy.persona && contentStrategy.tone && contentStrategy.targetAudience;
      case 3:
        return schedule.preferredDays.length > 0 && schedule.preferredTimes.length > 0;
      default:
        return true;
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const availableAccounts = accounts.filter((a) => !a.alreadyAdded);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/pages"
            className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Pages
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Add New Page</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configure a LinkedIn profile or company page for content creation
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s < step
                    ? 'bg-green-500 text-white'
                    : s === step
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 4 && (
                <div
                  className={`w-12 h-1 ${
                    s < step ? 'bg-green-500' : 'bg-gray-200 dark:bg-zinc-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
          {/* Step 1: Select Account */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Create Your Page
                </h2>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Choose how you want to create your page
              </p>

              {/* Creation Mode Toggle */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => {
                    setCreationMode('select');
                    setManualPageName('');
                    setManualPageDescription('');
                  }}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    creationMode === 'select'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-white">Connect LinkedIn</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Use existing profile/page</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setCreationMode('manual');
                    setSelectedAccount(null);
                  }}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    creationMode === 'manual'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                      <PenLine className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-white">Create Manually</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Connect platforms later</div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Manual Page Creation Form */}
              {creationMode === 'manual' && (
                <div className="space-y-4 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-lg">
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Note:</strong> You can connect this page to LinkedIn, Facebook, Twitter, or other platforms later from the page settings.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Page Name *
                    </label>
                    <input
                      type="text"
                      value={manualPageName}
                      onChange={(e) => setManualPageName(e.target.value)}
                      placeholder="e.g., My Brand, Tech Insights, Personal Blog"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description (optional)
                    </label>
                    <textarea
                      value={manualPageDescription}
                      onChange={(e) => setManualPageDescription(e.target.value)}
                      placeholder="What is this page about?"
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              )}

              {/* LinkedIn Account Selection */}
              {creationMode === 'select' && (
                <>
                  {availableAccounts.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-zinc-800/50 rounded-lg">
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        All your LinkedIn accounts have already been added as pages.
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                        You can create a page manually and connect platforms later.
                      </p>
                      <button
                        onClick={() => setCreationMode('manual')}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Create page manually →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {availableAccounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => setSelectedAccount(account)}
                          className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
                            selectedAccount?.id === account.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                              : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                          }`}
                        >
                          {account.avatar ? (
                            <NextImage
                              src={account.avatar}
                              alt={account.name}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                              {account.type === 'personal' ? (
                                <User className="h-6 w-6 text-white" />
                              ) : (
                                <Building2 className="h-6 w-6 text-white" />
                              )}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {account.name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                              {account.type} Profile
                              {account.vanityName && ` • @${account.vanityName}`}
                            </div>
                          </div>
                          {selectedAccount?.id === account.id && (
                            <Check className="h-5 w-5 text-blue-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Content Strategy */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Content Strategy
                </h2>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Define your content voice and focus areas
              </p>

              <div className="space-y-6">
                {/* Persona */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Persona / Voice *
                  </label>
                  <textarea
                    value={contentStrategy.persona}
                    onChange={(e) =>
                      setContentStrategy({ ...contentStrategy, persona: e.target.value })
                    }
                    placeholder="E.g., Founder building in public, sharing real lessons from growing a SaaS startup"
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Tone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tone & Style *
                  </label>
                  <input
                    type="text"
                    value={contentStrategy.tone}
                    onChange={(e) =>
                      setContentStrategy({ ...contentStrategy, tone: e.target.value })
                    }
                    placeholder="E.g., Authentic, direct, no marketing fluff, occasional humor"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Target Audience */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Audience *
                  </label>
                  <input
                    type="text"
                    value={contentStrategy.targetAudience}
                    onChange={(e) =>
                      setContentStrategy({ ...contentStrategy, targetAudience: e.target.value })
                    }
                    placeholder="E.g., Technical founders, PMs, early-stage startup people"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Topics */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Topics to Cover
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
                      placeholder="Add a topic..."
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={addTopic}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contentStrategy.topics.map((topic) => (
                      <span
                        key={topic}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm flex items-center gap-1"
                      >
                        {topic}
                        <button
                          onClick={() => removeTopic(topic)}
                          className="hover:text-blue-900 dark:hover:text-blue-100"
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
                  <div className="grid grid-cols-2 gap-2">
                    {POST_ANGLES.map((angle) => (
                      <button
                        key={angle.id}
                        onClick={() => toggleAngle(angle.id)}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          contentStrategy.preferredAngles.includes(angle.id)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                            : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-gray-900 dark:text-white text-sm">
                          {angle.label}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {angle.desc}
                        </div>
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
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>1x/week</span>
                    <span>Daily</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Posting Schedule
                </h2>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Set your preferred posting times
              </p>

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
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-zinc-700 text-gray-500 hover:border-gray-300'
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
                      onClick={addTime}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                          onClick={() => removeTime(time)}
                          className="hover:text-gray-900 dark:hover:text-white"
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
                    <label className="flex items-center gap-3 cursor-pointer mt-4 ml-8">
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
                          Posts with {schedule.minConfidenceForAutoApprove * 100}%+ confidence will be scheduled automatically
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Review & Create
                </h2>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Review your page settings before creating
              </p>

              <div className="space-y-6">
                {/* Account */}
                <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Account</h3>
                  <div className="flex items-center gap-3">
                    {selectedAccount?.avatar ? (
                      <NextImage
                        src={selectedAccount.avatar}
                        alt={selectedAccount.name}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full"
                        unoptimized
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                        {selectedAccount?.type === 'personal' ? (
                          <User className="h-5 w-5 text-white" />
                        ) : (
                          <Building2 className="h-5 w-5 text-white" />
                        )}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {selectedAccount?.name}
                      </div>
                      <div className="text-sm text-gray-500 capitalize">
                        {selectedAccount?.type} Profile
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strategy */}
                <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Content Strategy</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Persona:</strong> {contentStrategy.persona}</p>
                    <p><strong>Tone:</strong> {contentStrategy.tone}</p>
                    <p><strong>Audience:</strong> {contentStrategy.targetAudience}</p>
                    <p><strong>Topics:</strong> {contentStrategy.topics.join(', ') || 'None specified'}</p>
                    <p><strong>Frequency:</strong> {contentStrategy.postingFrequency}x per week</p>
                  </div>
                </div>

                {/* Schedule */}
                <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Schedule</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Timezone:</strong> {schedule.timezone}</p>
                    <p><strong>Days:</strong> {schedule.preferredDays.map(d => DAYS[d]).join(', ')}</p>
                    <p><strong>Times:</strong> {schedule.preferredTimes.join(', ')}</p>
                    <p><strong>Auto-generate:</strong> {schedule.autoGenerate ? 'Yes' : 'No'}</p>
                    {schedule.autoGenerate && (
                      <p><strong>Auto-approve:</strong> {schedule.autoApprove ? 'Yes (≥80% confidence)' : 'No'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Create Page
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { logger } from '@/lib/logger';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const log = logger.child('dashboard:engagements:settings');

interface EngagementSettings {
  autoReplyEnabled: boolean;
  autoEngageEnabled: boolean;
  requireApproval: boolean;
  dailyEngagementLimit: number;
  dailyReplyLimit: number;
  engagementDelay: number;
  engagementStyle: 'professional' | 'casual' | 'friendly' | 'thoughtful';
}

export default function EngagementSettingsPage() {
  const [settings, setSettings] = useState<EngagementSettings>({
    autoReplyEnabled: false,
    autoEngageEnabled: false,
    requireApproval: true,
    dailyEngagementLimit: 20,
    dailyReplyLimit: 30,
    engagementDelay: 15,
    engagementStyle: 'professional',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/engagements/settings');
      const data = await response.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      log.error('Error fetching settings', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => fetchSettings(), 0);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/engagements/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save settings');
      }
    } catch {
      setMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

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
          Engagement Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure how auto-engagement works
        </p>
      </div>

      <div className="space-y-8">
        {/* Auto-Engagement Toggle */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Automation
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Enable or disable automatic engagement features
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="autoEngageEnabled" className="cursor-pointer">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Auto-Engage with Posts
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Automatically like and comment on queued posts
                </p>
              </Label>
              <Checkbox
                id="autoEngageEnabled"
                checked={settings.autoEngageEnabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, autoEngageEnabled: Boolean(checked) })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="autoReplyEnabled" className="cursor-pointer">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Auto-Reply to Comments
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Automatically reply to comments on your posts
                </p>
              </Label>
              <Checkbox
                id="autoReplyEnabled"
                checked={settings.autoReplyEnabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, autoReplyEnabled: Boolean(checked) })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="requireApproval" className="cursor-pointer">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Require Approval
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Review AI-generated comments before posting
                </p>
              </Label>
              <Checkbox
                id="requireApproval"
                checked={settings.requireApproval}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, requireApproval: Boolean(checked) })
                }
              />
            </div>
          </div>
        </div>

        {/* Limits */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Daily Limits
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Set limits to avoid looking like a bot
          </p>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Daily Engagement Limit
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                value={settings.dailyEngagementLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dailyEngagementLimit: parseInt(e.target.value) || 20,
                  })
                }
                className="mt-1"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Max likes/comments on others&apos; posts per day
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Daily Reply Limit
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                value={settings.dailyReplyLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dailyReplyLimit: parseInt(e.target.value) || 30,
                  })
                }
                className="mt-1"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Max replies to comments on your posts per day
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Delay Between Actions (minutes)
              </label>
              <Input
                type="number"
                min="1"
                max="60"
                value={settings.engagementDelay}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    engagementDelay: parseInt(e.target.value) || 15,
                  })
                }
                className="mt-1"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Minimum time between engagements
              </p>
            </div>
          </div>
        </div>

        {/* AI Style */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            AI Comment Style
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            How should AI-generated comments sound?
          </p>

          <div className="mt-6">
            <Select
              value={settings.engagementStyle}
              onValueChange={(v) =>
                setSettings({
                  ...settings,
                  engagementStyle: v as EngagementSettings['engagementStyle'],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional - Business-focused, insightful</SelectItem>
                <SelectItem value="casual">Casual - Relaxed, conversational</SelectItem>
                <SelectItem value="friendly">Friendly - Warm, supportive</SelectItem>
                <SelectItem value="thoughtful">Thoughtful - Reflective, asks deeper questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          {message && (
            <p
              className={`text-sm ${
                message.includes('success') ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {message}
            </p>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

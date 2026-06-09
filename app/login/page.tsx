'use client';

import { signIn } from 'next-auth/react';
import { Linkedin } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--accent)]">
            <Linkedin className="h-10 w-10 text-white" />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Welcome to AutoPost
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Connect your LinkedIn account to start scheduling and publishing posts
          </p>
        </div>

        <div className="space-y-4">
          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={() => signIn('pouk', { callbackUrl: '/dashboard' })}
          >
            Sign in with Pouk
          </Button>

          <button
            onClick={() => signIn('linkedin', { callbackUrl: '/dashboard' })}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#0077B5] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-[#006097]"
          >
            <Linkedin className="h-6 w-6" />
            Sign in with LinkedIn
          </button>

          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            By signing in, you agree to allow AutoPost to post on your behalf
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
            What you can do:
          </h3>
          <ul className="mt-4 space-y-3 text-left text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
              Create and edit LinkedIn posts
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
              Schedule posts for future publication
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
              Publish posts directly to LinkedIn
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
              Track your post history and status
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

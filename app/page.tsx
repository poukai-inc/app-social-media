import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Linkedin,
  Calendar,
  Clock,
  Send,
  BarChart3,
  Shield,
  ArrowRight
} from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)] bg-[color:var(--accent-glow)] px-4 py-2 text-sm font-medium text-[color:var(--accent)]">
            <Linkedin className="h-4 w-4" />
            LinkedIn Automation Made Simple
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl md:text-6xl dark:text-zinc-100">
            Schedule & Automate Your{' '}
            <span className="text-[color:var(--accent)]">LinkedIn Posts</span>
          </h1>
          
          <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
            Create, schedule, and automatically publish your LinkedIn content.
            Save time, stay consistent, and grow your professional presence.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild variant="primary">
              <Link href="/login">
                <Linkedin className="h-5 w-5" />
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-zinc-200 bg-white px-4 py-20 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Everything you need to manage your LinkedIn content
          </h2>
          <p className="mt-4 text-center text-zinc-600 dark:text-zinc-400">
            Simple, powerful tools to help you stay active on LinkedIn
          </p>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[color:var(--surface)]">
                <Calendar className="h-6 w-6 text-[color:var(--accent)]" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Schedule Posts
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Plan your content in advance. Schedule posts for the perfect time to maximize engagement.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900">
                <Send className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Auto-Publish
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Set it and forget it. Your posts will be published automatically at the scheduled time.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Draft & Edit
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Save drafts and edit your posts until they&apos;re perfect before publishing.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900">
                <BarChart3 className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Track Status
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Monitor all your posts in one place. See what&apos;s scheduled, published, or needs attention.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900">
                <Shield className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Secure & Private
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Your LinkedIn credentials are handled securely through official OAuth authentication.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-900">
                <Linkedin className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                LinkedIn Native
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Built specifically for LinkedIn. Uses official APIs for reliable posting.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-zinc-200 px-4 py-20 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Ready to automate your LinkedIn presence?
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Connect your LinkedIn account and start scheduling posts in minutes.
          </p>
          <Button asChild variant="primary" className="mt-8">
            <Link href="/login">
              <Linkedin className="h-5 w-5" />
              Connect LinkedIn
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 px-4 py-8 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>© 2026 AutoPost. Built for LinkedIn content creators.</p>
        </div>
      </footer>
    </div>
  );
}

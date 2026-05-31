'use client';

/**
 * Route-segment error boundary. Catches render/data errors below the root
 * layout and offers a recovery action instead of the bare Next.js screen.
 * (issue #41) Next.js logs the error server-side; no client console needed.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-[color:var(--fg-muted)]">
        An unexpected error occurred. You can try again, or head back and retry.
      </p>
      {error.digest ? (
        <p className="text-xs text-[color:var(--fg-muted)]">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-[color:var(--brand-primary)] px-4 py-2 text-white"
      >
        Try again
      </button>
    </main>
  );
}

import { Spinner } from '@/components/ui/spinner';

/**
 * Suspense fallback for the dashboard segment so async data does not render a
 * blank screen while loading. (issue #41)
 */
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <Spinner size="lg" label="Loading dashboard" />
    </div>
  );
}

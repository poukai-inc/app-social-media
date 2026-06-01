import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PostForm } from '@/components/post-form';

interface Props {
  searchParams: Promise<{ pageId?: string }>;
}

export default async function CreatePostPage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.email) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Create Post
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Write and schedule your LinkedIn post
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <PostForm {...(params.pageId !== undefined && { initialPageId: params.pageId })} />
      </div>
    </div>
  );
}

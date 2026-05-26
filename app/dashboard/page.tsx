import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import { PostCard } from '@/components/post-card';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { Stat } from '@poukai-inc/ui/atoms/Stat';
import { NumberFormat } from '@poukai-inc/ui/atoms/NumberFormat';
import { Heading } from '@poukai-inc/ui/atoms/Heading';
import { Text } from '@poukai-inc/ui/atoms/Text';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect('/login');
  }

  await connectToDatabase();
  
  const user = await User.findOne({ email: session.user.email });
  
  if (!user) {
    redirect('/login');
  }

  const posts = await Post.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .lean();

  const stats = {
    total: posts.length,
    drafts: posts.filter((p) => p.status === 'draft').length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => p.status === 'published').length,
    failed: posts.filter((p) => p.status === 'failed').length,
  };

  const serializedPosts = posts.map((post) => ({
    _id: post._id.toString(),
    content: post.content,
    status: post.status,
    scheduledFor: post.scheduledFor?.toISOString(),
    publishedAt: post.publishedAt?.toISOString(),
    createdAt: post.createdAt.toISOString(),
    error: post.error,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading as="h1">Dashboard</Heading>
          <Text size="caption" tone="muted">Manage your LinkedIn posts</Text>
        </div>
        <Button asChild variant="primary">
          <Link href="/dashboard/create">
            <Plus className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
      </div>

      <dl className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-5">
        <Stat value={<NumberFormat value={stats.total} locale="en-US" />} caption="Total" />
        <Stat value={<NumberFormat value={stats.drafts} locale="en-US" />} caption="Drafts" />
        <Stat value={<NumberFormat value={stats.scheduled} locale="en-US" />} caption="Scheduled" />
        <Stat value={<NumberFormat value={stats.published} locale="en-US" />} caption="Published" />
        <Stat value={<NumberFormat value={stats.failed} locale="en-US" />} caption="Failed" />
      </dl>

      <div className="space-y-4">
        <Heading as="h2" size="h3">Recent Posts</Heading>
        {serializedPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <FileText className="mx-auto h-12 w-12 text-zinc-400" />
            <Heading as="h3" size="h4" className="mt-4">No posts yet</Heading>
            <Text size="caption" tone="muted" className="mt-2">Create your first post to get started</Text>
            <div className="mt-6 inline-flex">
              <Button asChild variant="primary">
                <Link href="/dashboard/create">
                  <Plus className="h-4 w-4" />
                  Create Post
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          serializedPosts.map((post) => <PostCard key={post._id} post={post} />)
        )}
      </div>
    </div>
  );
}

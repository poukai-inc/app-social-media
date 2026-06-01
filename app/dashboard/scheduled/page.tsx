import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import { PostCard } from '@/components/post-card';
import Link from 'next/link';
import { Plus, Clock } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { Heading } from '@poukai-inc/ui/atoms/Heading';
import { Text } from '@poukai-inc/ui/atoms/Text';

export default async function ScheduledPostsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect('/login');
  }

  await connectToDatabase();
  
  const user = await User.findOne({ email: session.user.email });
  
  if (!user) {
    redirect('/login');
  }

  const posts = await Post.find({ userId: user._id, status: 'scheduled' })
    .sort({ scheduledFor: 1 })
    .lean();

  const serializedPosts = posts.map((post) => ({
    _id: post._id.toString(),
    content: post.content,
    status: post.status,
    ...(post.scheduledFor !== undefined && { scheduledFor: post.scheduledFor.toISOString() }),
    ...(post.publishedAt !== undefined && { publishedAt: post.publishedAt.toISOString() }),
    createdAt: post.createdAt.toISOString(),
    ...(post.error !== undefined && { error: post.error }),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading as="h1">Scheduled Posts</Heading>
          <Text size="caption" tone="muted">Posts waiting to be published</Text>
        </div>
        <Button asChild variant="primary">
          <Link href="/dashboard/create">
            <Plus className="h-4 w-4" />
            Schedule New Post
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        {serializedPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <Clock className="mx-auto h-12 w-12 text-zinc-400" />
            <Heading as="h3" size="h4" className="mt-4">No scheduled posts</Heading>
            <Text size="caption" tone="muted" className="mt-2">Schedule a post to have it automatically published</Text>
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

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { analyzeBlog, generatePostFromBlogAngle, PostAngle } from '@/lib/openai';
import { logger } from '@/lib/logger';

const log = logger.child('api:blog:analyze');

// POST /api/blog/analyze - Analyze a blog URL or content
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, content } = body;

    if (!url && !content) {
      return NextResponse.json(
        { error: 'Either url or content is required' },
        { status: 400 }
      );
    }

    let blogContent = content;

    // If URL provided, fetch the content
    if (url && !content) {
      try {
        // Use a simple fetch - for production you might want to use a service like Jina Reader
        const jinaUrl = `https://r.jina.ai/${url}`;
        const response = await fetch(jinaUrl, {
          headers: {
            'Accept': 'text/plain',
          },
        });

        if (!response.ok) {
          // Fallback: try direct fetch
          const directResponse = await fetch(url);
          if (!directResponse.ok) {
            return NextResponse.json(
              { error: 'Failed to fetch blog content' },
              { status: 400 }
            );
          }
          blogContent = await directResponse.text();
        } else {
          blogContent = await response.text();
        }
      } catch (fetchError) {
        log.error('Failed to fetch blog', { error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
        return NextResponse.json(
          { error: 'Failed to fetch blog content from URL' },
          { status: 400 }
        );
      }
    }

    // Analyze the blog
    const analysis = await analyzeBlog(blogContent, url);

    return NextResponse.json({
      success: true,
      analysis,
      blogUrl: url,
    });
  } catch (error) {
    log.error('Blog analysis error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to analyze blog' },
      { status: 500 }
    );
  }
}

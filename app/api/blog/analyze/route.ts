import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { analyzeBlog } from '@/lib/openai';
import { logger } from '@/lib/logger';

const log = logger.child('api:blog:analyze');

/**
 * Validate that a URL is safe to fetch from the server (SSRF prevention).
 * Blocks loopback, link-local, private RFC-1918 ranges, and non-http(s) schemes.
 */
function isSafeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    // Block loopback, link-local, private ranges, unspecified
    if (
      host === 'localhost' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^0\.0\.0\.0/.test(host) ||
      host === '::1' ||
      /^fe80:/i.test(host) ||
      /^fd[0-9a-f]{2}:/i.test(host)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

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
      // SSRF prevention — validate URL before any server-side fetch (AUDIT-C2)
      if (!isSafeUrl(url)) {
        return NextResponse.json(
          { error: 'Invalid or disallowed URL' },
          { status: 400 }
        );
      }

      try {
        // Proxy through Jina Reader for clean text extraction
        const jinaUrl = `https://r.jina.ai/${url}`;
        const response = await fetch(jinaUrl, {
          headers: { 'Accept': 'text/plain' },
        });

        if (!response.ok) {
          // Do NOT fall back to direct fetch — that opens SSRF to internal network
          return NextResponse.json(
            { error: 'Failed to fetch blog content from URL' },
            { status: 400 }
          );
        }

        blogContent = await response.text();
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

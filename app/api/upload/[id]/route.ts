import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteFromS3, getS3KeyFromUrl } from '@/lib/s3';
import { uploadOwnerToken, uploadKeyPrefix } from '@/lib/upload-owner';
import { logger } from '@/lib/logger';

const log = logger.child('api:upload:[id]');

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Bind deletion to the requesting user: only media stored under this user's
    // owner-namespaced prefix may be deleted. Legacy unprefixed keys fail closed.
    // (review H1)
    const ownerToken = uploadOwnerToken(session);
    if (!ownerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Extract the S3 key from the URL
    const key = getS3KeyFromUrl(url);

    if (!key) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Ownership: key must live under this user's prefix and reference this id.
    if (!key.startsWith(uploadKeyPrefix(ownerToken)) || !key.includes(id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await deleteFromS3(key);

    return NextResponse.json({ message: 'File deleted successfully' });
  } catch (error) {
    log.error('Error deleting file', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}

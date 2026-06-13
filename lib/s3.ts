import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

let _s3Client: S3Client | null = null;
let _bucket: string | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY are required');
  }
  _s3Client = new S3Client({
    endpoint,
    region: 'us-east-1', // MinIO doesn't care about region, but SDK requires it
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // Required for MinIO
  });
  return _s3Client;
}

function getBucket(): string {
  if (_bucket) return _bucket;
  _bucket = process.env.S3_BUCKET || 'uploads';
  return _bucket;
}

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await getS3Client().send(command);

  // Return the public URL
  const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  return `${endpoint}/${getBucket()}/${key}`;
}

export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  await getS3Client().send(command);
}

export async function getFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  const response = await getS3Client().send(command);
  const stream = response.Body;

  if (!stream) {
    throw new Error('No body in response');
  }

  // Convert stream to buffer with a hard size cap so a large/malicious object
  // cannot exhaust process memory. (review L9)
  const MAX_BYTES = 250 * 1024 * 1024; // 250MB (above the 200MB upload ceiling)
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) {
      throw new Error(`S3 object ${key} exceeds maximum allowed size of ${MAX_BYTES} bytes`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export function getS3KeyFromUrl(url: string): string | null {
  const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  const prefix = `${endpoint}/${getBucket()}/`;

  if (url.startsWith(prefix)) {
    return url.slice(prefix.length);
  }

  // Also try to extract key from URLs with different hosts (e.g., host.docker.internal vs IP)
  // Pattern: http(s)://[any-host]:[port]/[bucket]/[key]
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Check if first path segment is the bucket name
    if (pathParts[0] === getBucket() && pathParts.length > 1) {
      return pathParts.slice(1).join('/');
    }
  } catch {
    // Invalid URL, return null
  }

  return null;
}

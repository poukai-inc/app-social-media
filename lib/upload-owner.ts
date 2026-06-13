import crypto from 'crypto';
import type { SessionLike } from '@/lib/page-access';

/**
 * Stable per-user token used to namespace uploaded media under
 * `media/<token>/...` in S3. Deletion verifies the key carries the requesting
 * user's token, giving ownership without a separate uploads table. (review H1)
 *
 * Derived from the session user id when present, else the email — hashed so the
 * raw identifier never appears in object keys. Returns null when the session
 * cannot be identified (caller must reject).
 */
export function uploadOwnerToken(session: SessionLike | null): string | null {
  const id = session?.user?.id;
  if (id) {
    return crypto.createHash('sha256').update(`id:${id}`).digest('hex').slice(0, 24);
  }
  const email = session?.user?.email;
  if (email) {
    return crypto.createHash('sha256').update(`email:${email.toLowerCase()}`).digest('hex').slice(0, 24);
  }
  return null;
}

/** S3 key prefix that scopes media to a given owner token. */
export function uploadKeyPrefix(token: string): string {
  return `media/${token}/`;
}

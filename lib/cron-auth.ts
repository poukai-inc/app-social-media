import crypto from 'crypto';

/**
 * Shared cron authentication. FAIL CLOSED: if CRON_SECRET is not configured,
 * every cron request is rejected. Comparison is constant-time to avoid leaking
 * the secret via timing side-channels. (review: C2)
 */

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // Length check first; timingSafeEqual throws on length mismatch.
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Returns true only when CRON_SECRET is set AND the request carries a matching
 * `Authorization: Bearer <secret>` header. Returns false when the secret is
 * unset (fail closed) or the header does not match.
 */
export function verifyCronSecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false; // fail closed — no secret configured
  const authHeader = request.headers.get('authorization') ?? '';
  return timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`);
}

/**
 * Reason a cron request was rejected, or null when authorized.
 * `misconfigured` => 500 (operator error: secret not set).
 * `unauthorized`  => 401 (bad/absent credential).
 */
export function cronAuthError(request: Request): 'misconfigured' | 'unauthorized' | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return 'misconfigured';
  const authHeader = request.headers.get('authorization') ?? '';
  return timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`) ? null : 'unauthorized';
}

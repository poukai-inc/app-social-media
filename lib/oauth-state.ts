import crypto from 'crypto';

/**
 * HMAC-signed OAuth state param helpers. Mitigates state forgery —
 * an authenticated user crafting state targeting another user's
 * pageId/email. Verifier must match issuer's secret.
 *
 * Format: `<base64url-payload>.<base64url-hmac>`
 *
 * See decisions/0005-ui-path.md + BACKLOG #111 (AUDIT-H2).
 */

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for OAuth state signing');
  }
  return secret;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function hmac(payload: string): string {
  return base64UrlEncode(crypto.createHmac('sha256', getSecret()).update(payload).digest());
}

/**
 * Sign an OAuth state payload with HMAC-SHA256.
 * Returns `<payload>.<signature>` (both base64url).
 */
export function signState<T extends Record<string, unknown>>(payload: T): string {
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  return `${encoded}.${hmac(encoded)}`;
}

/**
 * Verify + parse an HMAC-signed state. Returns `null` if signature
 * mismatches or shape is wrong. Throws nothing — caller must
 * handle null and redirect to an error page.
 */
export function verifyState<T extends Record<string, unknown>>(state: string): T | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = hmac(encoded);
  // Constant-time compare
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = base64UrlDecode(encoded).toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

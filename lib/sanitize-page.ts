/**
 * Page sanitization helpers.
 *
 * Platform connections embed OAuth secrets (access/refresh tokens, OAuth 1.0a
 * token + secret). These must NEVER be serialized to the client. Mongoose
 * `.lean()` queries bypass schema `toJSON` transforms, so sanitization is done
 * explicitly here and applied at every client-facing response that returns a
 * Page (or list of Pages).
 *
 * See SECURITY: BACKLOG #123 (AUDIT2-C1) / GitHub issue #15.
 */

/** Connection secret fields stripped before any response leaves the server. */
const SECRET_CONNECTION_FIELDS = [
  'accessToken',
  'refreshToken',
  'oauthToken',
  'oauthTokenSecret',
] as const;

type UnknownRecord = Record<string, unknown>;

/**
 * Return a new connection object with all OAuth secret fields removed.
 * Immutable — the input is never mutated.
 */
export function stripConnectionSecrets<T extends UnknownRecord>(
  connection: T
): Omit<T, (typeof SECRET_CONNECTION_FIELDS)[number]> {
  const safe: UnknownRecord = { ...connection };
  for (const field of SECRET_CONNECTION_FIELDS) {
    delete safe[field];
  }
  return safe as Omit<T, (typeof SECRET_CONNECTION_FIELDS)[number]>;
}

/**
 * Return a new Page object with every connection's OAuth secrets removed.
 * Immutable — the input is never mutated. Safe on plain (`.lean()`) objects
 * and hydrated documents alike; non-object / connection-less inputs pass
 * through unchanged.
 */
export function stripPageSecrets<T extends { connections?: unknown }>(page: T): T {
  if (!page || typeof page !== 'object' || !Array.isArray(page.connections)) {
    return page;
  }
  return {
    ...page,
    connections: page.connections.map((conn) =>
      conn && typeof conn === 'object'
        ? stripConnectionSecrets(conn as UnknownRecord)
        : conn
    ),
  };
}

/** Strip secrets from a list of Pages. Immutable. */
export function stripPagesSecrets<T extends { connections?: unknown }>(
  pages: T[]
): T[] {
  return pages.map((page) => stripPageSecrets(page));
}

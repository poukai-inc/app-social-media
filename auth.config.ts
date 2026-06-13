import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe NextAuth config for middleware. (review M8)
 *
 * Deliberately imports NOTHING heavy — no mongoose, pg, drizzle, or the
 * DrizzleAdapter — so it runs in the edge middleware runtime. Middleware only
 * needs to verify the existing JWT session cookie (signed with AUTH_SECRET by
 * the full config in lib/auth.ts) and gate access; it never initiates sign-in,
 * so an empty providers list is sufficient here.
 */
export const authConfig = {
  ...(process.env.AUTH_SECRET !== undefined ? { secret: process.env.AUTH_SECRET } : {}),
  trustHost: true,
  session: { strategy: 'jwt' as const },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    // The matcher scopes this to /dashboard/**; require an authenticated
    // session there. Returning false redirects to pages.signIn ('/login').
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;

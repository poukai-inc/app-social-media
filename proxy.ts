import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

/**
 * Central auth gate for the dashboard. Previously every /dashboard page checked
 * the session itself, so a new page that forgot the check would be exposed.
 * The matcher below routes all /dashboard/** requests through the `authorized`
 * callback, which redirects unauthenticated users to /login. (review M8)
 *
 * API routes are intentionally NOT matched — they keep their own auth() checks,
 * and the cron endpoints authenticate with CRON_SECRET.
 */
const { auth } = NextAuth(authConfig);

// Default export so Next.js recognizes the middleware function (a destructured
// `export const` is not statically detected as a function export).
export default auth;

export const config = {
  matcher: ['/dashboard/:path*'],
};

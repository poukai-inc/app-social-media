import NextAuth from 'next-auth';
import LinkedIn from 'next-auth/providers/linkedin';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import { logger } from '@/lib/logger';

const log = logger.child('auth');

/**
 * Drizzle/Postgres adapter for user+account persistence. OFF by default — set
 * AUTH_ADAPTER=drizzle to enable during the cutover (see docs/cutover.md, #26).
 * Session strategy stays JWT either way, so the existing stateless-session
 * flow + the jwt/session callbacks are unchanged.
 */
const useDrizzleAdapter = process.env.AUTH_ADAPTER === 'drizzle';

export const { handlers, signIn, signOut, auth } = NextAuth(() => {
  // Base scopes for personal posting
  const baseScopes = 'openid profile email w_member_social';
  // Organization scopes require Marketing Developer Platform access
  // Set LINKEDIN_ORG_ENABLED=true once your app is approved
  const orgScopes = process.env.LINKEDIN_ORG_ENABLED === 'true'
    ? ' w_organization_social r_organization_social'
    : '';

  return {
    ...(process.env.AUTH_SECRET !== undefined ? { secret: process.env.AUTH_SECRET } : {}),
    trustHost: true,
    // Stateless JWT sessions (current behavior). Kept explicit so enabling the
    // adapter below does NOT switch NextAuth to database sessions.
    session: { strategy: 'jwt' as const },
    ...(useDrizzleAdapter
      ? {
          adapter: DrizzleAdapter(db, {
            usersTable: users,
            accountsTable: accounts,
            sessionsTable: sessions,
            verificationTokensTable: verificationTokens,
          }),
        }
      : {}),
    providers: [
      LinkedIn({
        clientId: process.env.LINKEDIN_CLIENT_ID!,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        authorization: {
          params: {
            scope: baseScopes + orgScopes,
          },
        },
      }),
    ],
    callbacks: {
      async jwt({ token, account, profile }) {
        if (account && profile) {
          token.accessToken = account.access_token;
          token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
          token.linkedinId = profile.sub;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.sub as string;
          session.accessToken = token.accessToken as string;
          session.linkedinId = token.linkedinId as string;
        }
        return session;
      },
      async signIn({ user, account, profile }) {
        if (account?.provider === 'linkedin') {
          try {
            await connectToDatabase();

            if (!user.email) return false;
            const existingUser = await User.findOne({ email: user.email });

            if (existingUser) {
              // Update existing user with LinkedIn info
              await User.findByIdAndUpdate(existingUser._id, {
                linkedinId: profile?.sub,
                linkedinAccessToken: account.access_token,
                linkedinAccessTokenExpires: account.expires_at
                  ? new Date(account.expires_at * 1000)
                  : undefined,
                name: user.name || existingUser.name,
                image: user.image || existingUser.image,
              });
            } else {
              // Create new user
              await User.create({
                name: user.name || 'LinkedIn User',
                email: user.email,
                ...(user.image != null ? { image: user.image } : {}),
                ...(profile?.sub != null ? { linkedinId: profile.sub } : {}),
                ...(account.access_token != null ? { linkedinAccessToken: account.access_token } : {}),
                ...(account.expires_at != null ? { linkedinAccessTokenExpires: new Date(account.expires_at * 1000) } : {}),
              });
            }
            return true;
          } catch (error) {
            log.error('Error during sign in', { error: error instanceof Error ? error.message : String(error) });
            return false;
          }
        }
        return true;
      },
    },
    pages: {
      signIn: '/login',
    },
  };
});

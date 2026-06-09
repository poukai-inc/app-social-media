'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { SiteShell, type SiteShellRoute } from '@poukai-inc/ui/organisms/SiteShell';
import { Footer } from '@poukai-inc/ui/organisms/Footer';
import { Button } from '@poukai-inc/ui/atoms/Button';

const AUTH_ROUTES: SiteShellRoute[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/pages', label: 'Pages' },
  { href: '/dashboard/create', label: 'Create' },
  { href: '/dashboard/scheduled', label: 'Scheduled' },
  { href: '/dashboard/engagements', label: 'Engagements' },
  { href: '/dashboard/approvals', label: 'Approvals' },
  { href: '/dashboard/blog', label: 'Blog → Post' },
  { href: '/dashboard/comments', label: 'Comments' },
  { href: '/dashboard/schedule', label: 'Schedule AI' },
];

const PUBLIC_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/login', label: 'Sign in' },
];

// pouk-auth RP-initiated logout endpoint. Clearing the local next-auth session
// alone leaves the IdP (id.pouk.ai) session live, so re-login is instant — to
// fully sign out we must also end the pouk session (ADR-0008).
const POUK_END_SESSION = 'https://id.pouk.ai/session/end';

async function handleSignOut(idToken?: string): Promise<void> {
  // Clear the local session first (no redirect), then hand off to pouk's
  // end_session endpoint, which bounces back to post_logout_redirect_uri.
  await signOut({ redirect: false });
  if (idToken) {
    const url = new URL(POUK_END_SESSION);
    url.searchParams.set('id_token_hint', idToken);
    url.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/login`);
    url.searchParams.set('client_id', 'social');
    window.location.href = url.toString();
  } else {
    // LinkedIn (non-SSO) login: local sign-out is sufficient.
    window.location.href = '/login';
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const routes = session ? AUTH_ROUTES : [];

  const footer = (
    <Footer
      as="div"
      copyright="© 2026 AutoPost"
      email="hello@autopost.app"
      links={session ? [] : PUBLIC_LINKS}
    />
  );

  const end = session ? (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => handleSignOut(session?.idToken)}
    >
      Sign out
    </Button>
  ) : undefined;

  return (
    <SiteShell currentRoute={pathname} routes={routes} footer={footer}>
      {end ? <div className="mb-4 flex justify-end">{end}</div> : null}
      {children}
    </SiteShell>
  );
}

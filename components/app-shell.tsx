'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { SiteShell, type SiteShellRoute } from '@poukai-inc/ui/organisms/SiteShell';
import { Footer } from '@poukai-inc/ui/organisms/Footer';

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const routes = session ? AUTH_ROUTES : [];

  const footer = (
    <Footer
      as="footer"
      copyright="© 2026 AutoPost"
      email="hello@autopost.app"
      links={session ? [] : PUBLIC_LINKS}
    />
  );

  return (
    <SiteShell currentRoute={pathname} routes={routes} footer={footer}>
      {children}
    </SiteShell>
  );
}

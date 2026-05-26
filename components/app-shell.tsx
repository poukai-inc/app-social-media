'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import {
  Linkedin,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Users,
  Clock,
  FileText,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@poukai-inc/ui/atoms/Wordmark';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { Avatar } from '@poukai-inc/ui/atoms/Avatar';
import { cn } from '@/lib/cn';

interface NavLink {
  href: string;
  label: string;
  icon?: typeof Users;
}

const PRIMARY_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/pages', label: 'Pages' },
  { href: '/dashboard/create', label: 'Create' },
  { href: '/dashboard/scheduled', label: 'Scheduled' },
];

const MORE_LINKS: NavLink[] = [
  { href: '/dashboard/engagements', label: 'Engagements', icon: Users },
  { href: '/dashboard/approvals', label: 'Approvals', icon: Clock },
  { href: '/dashboard/blog', label: 'Blog → Post', icon: FileText },
  { href: '/dashboard/comments', label: 'Comments', icon: MessageSquare },
  { href: '/dashboard/schedule', label: 'Schedule AI', icon: Sparkles },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => pathname === path;

  const navLinkClass = (path: string) =>
    cn(
      'rounded-md px-3 py-2 text-[length:var(--fs-meta)] font-medium transition-colors',
      isActive(path)
        ? 'text-[color:var(--accent)]'
        : 'text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]',
    );

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)]">
      <nav className="sticky top-0 z-50 border-b border-[color:var(--hairline)] bg-[color:var(--bg-elevated)]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            {/* Wordmark */}
            <Link
              href="/"
              className="flex items-center gap-2 text-[color:var(--fg)]"
              aria-label="AutoPost — home"
            >
              <Wordmark height={20} />
            </Link>

            {/* Desktop nav */}
            {session && (
              <div className="hidden md:flex md:items-center md:gap-1">
                {PRIMARY_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className={navLinkClass(link.href)}>
                    {link.label}
                  </Link>
                ))}

                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-3 py-2 text-[length:var(--fs-meta)] font-medium transition-colors',
                      MORE_LINKS.some((l) => isActive(l.href))
                        ? 'text-[color:var(--accent)]'
                        : 'text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]',
                    )}
                  >
                    More
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        moreMenuOpen && 'rotate-180',
                      )}
                    />
                  </button>

                  {moreMenuOpen && (
                    <div className="absolute right-0 mt-1 w-48 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--bg-elevated)] py-1 shadow-lg">
                      {MORE_LINKS.map((link) => {
                        const Icon = link.icon;
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMoreMenuOpen(false)}
                            className={cn(
                              'flex items-center gap-2 px-4 py-2 text-[length:var(--fs-meta)]',
                              isActive(link.href)
                                ? 'bg-[color:var(--surface)] text-[color:var(--accent)]'
                                : 'text-[color:var(--fg)] hover:bg-[color:var(--surface)]',
                            )}
                          >
                            {Icon && <Icon className="h-4 w-4" aria-hidden />}
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* User area */}
            <div className="hidden md:flex md:items-center md:gap-3">
              {status === 'loading' ? (
                <div className="h-8 w-24 animate-pulse rounded-lg bg-[color:var(--surface)]" />
              ) : session ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {session.user?.image ? (
                      <Avatar mode="image" src={session.user.image} alt={session.user.name || 'User'} size="sm" />
                    ) : (
                      <Avatar
                        mode="initials"
                        initials={(session.user?.name || 'U').slice(0, 2).toUpperCase()}
                        name={session.user?.name || 'User'}
                        size="sm"
                      />
                    )}
                    <span className="text-[length:var(--fs-meta)] font-medium text-[color:var(--fg)]">
                      {session.user?.name?.split(' ')[0]}
                    </span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => signOut()}>
                    <LogOut className="h-4 w-4" aria-hidden />
                    <span className="hidden lg:inline">Sign Out</span>
                  </Button>
                </div>
              ) : (
                <Button variant="primary" size="sm" onClick={() => signIn('linkedin')}>
                  <Linkedin className="h-4 w-4" aria-hidden />
                  Connect LinkedIn
                </Button>
              )}
            </div>

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-md p-2 text-[color:var(--fg-muted)] hover:bg-[color:var(--surface)] md:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="border-t border-[color:var(--hairline)] py-3 md:hidden">
              {session ? (
                <div className="space-y-1">
                  <div className="mb-2 flex items-center gap-3 px-3 py-2">
                    {session.user?.image ? (
                      <Avatar mode="image" src={session.user.image} alt={session.user.name || 'User'} size="md" />
                    ) : (
                      <Avatar
                        mode="initials"
                        initials={(session.user?.name || 'U').slice(0, 2).toUpperCase()}
                        name={session.user?.name || 'User'}
                        size="md"
                      />
                    )}
                    <div>
                      <div className="text-[length:var(--fs-meta)] font-medium text-[color:var(--fg)]">
                        {session.user?.name}
                      </div>
                      <div className="text-[length:var(--fs-micro)] text-[color:var(--fg-muted)]">
                        {session.user?.email}
                      </div>
                    </div>
                  </div>

                  <div className="mx-3 my-2 h-px bg-[color:var(--hairline)]" />

                  {[...PRIMARY_LINKS, ...MORE_LINKS].map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'block rounded-md px-3 py-2 text-[length:var(--fs-meta)] font-medium',
                        isActive(link.href)
                          ? 'bg-[color:var(--surface)] text-[color:var(--accent)]'
                          : 'text-[color:var(--fg-muted)] hover:bg-[color:var(--surface)]',
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}

                  <div className="mx-3 my-2 h-px bg-[color:var(--hairline)]" />

                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[length:var(--fs-meta)] font-medium text-[color:var(--danger)] hover:bg-[color:var(--bg-danger)]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign Out
                  </button>
                </div>
              ) : (
                <Button variant="primary" className="w-full" onClick={() => signIn('linkedin')}>
                  <Linkedin className="h-4 w-4" aria-hidden />
                  Connect LinkedIn
                </Button>
              )}
            </div>
          )}
        </div>
      </nav>

      <main>{children}</main>
    </div>
  );
}

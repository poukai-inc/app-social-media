'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { Linkedin, LogOut, Menu, X, ChevronDown, Users, Clock, FileText, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import NextImage from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close dropdown when clicking outside
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
    `text-sm font-medium transition-colors ${
      isActive(path)
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
    }`;

  const primaryLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/pages', label: 'Pages' },
    { href: '/dashboard/create', label: 'Create' },
    { href: '/dashboard/scheduled', label: 'Scheduled' },
  ];

  const moreLinks = [
    { href: '/dashboard/engagements', label: 'Engagements', icon: Users },
    { href: '/dashboard/approvals', label: 'Approvals', icon: Clock },
    { href: '/dashboard/blog', label: 'Blog → Post', icon: FileText },
    { href: '/dashboard/comments', label: 'Comments', icon: MessageSquare },
    { href: '/dashboard/schedule', label: 'Schedule AI', icon: Sparkles },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Linkedin className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              AutoPost
            </span>
          </Link>

          {/* Desktop Navigation */}
          {session && (
            <div className="hidden md:flex md:items-center md:gap-1">
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-2 ${navLinkClass(link.href)}`}
                >
                  {link.label}
                </Link>
              ))}
              
              {/* More Dropdown */}
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    moreLinks.some(l => isActive(l.href))
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  More
                  <ChevronDown className={`h-4 w-4 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {moreMenuOpen && (
                  <div className="absolute right-0 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {moreLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMoreMenuOpen(false)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm ${
                          isActive(link.href)
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                            : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Side - User */}
          <div className="hidden md:flex md:items-center md:gap-3">
            {status === 'loading' ? (
              <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            ) : session ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {session.user?.image && (
                    <NextImage
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full ring-2 ring-zinc-100 dark:ring-zinc-800"
                      unoptimized
                    />
                  )}
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {session.user?.name?.split(' ')[0]}
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn('linkedin')}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Linkedin className="h-4 w-4" />
                Connect LinkedIn
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-md p-2 md:hidden hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            ) : (
              <Menu className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-zinc-200 py-3 md:hidden dark:border-zinc-800">
            {session ? (
              <div className="space-y-1">
                {/* User Info */}
                <div className="flex items-center gap-3 px-3 py-2 mb-2">
                  {session.user?.image && (
                    <NextImage
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full"
                      unoptimized
                    />
                  )}
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {session.user?.name}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {session.user?.email}
                    </div>
                  </div>
                </div>
                
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 mx-3 my-2" />
                
                {/* All Links */}
                {[...primaryLinks, ...moreLinks].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive(link.href)
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 mx-3 my-2" />
                
                <button
                  onClick={() => signOut()}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn('linkedin')}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Linkedin className="h-4 w-4" />
                Connect LinkedIn
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@poukai-inc/ui/organisms';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider position="bottom-right" defaultDuration={5000} max={4}>
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}

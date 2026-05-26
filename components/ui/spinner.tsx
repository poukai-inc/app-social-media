import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZE_MAP = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };

export function Spinner({ size = 'md', label = 'Loading', className, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center text-[color:var(--fg-muted)]', className)}
      {...rest}
    >
      <Loader2 className={cn('animate-spin', SIZE_MAP[size])} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', invalid, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-invalid={invalid || undefined}
      className={cn(
        'flex h-10 w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--bg-elevated)] px-3 py-2',
        'text-[length:var(--fs-body)] text-[color:var(--fg)] placeholder:text-[color:var(--fg-muted)]',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-glow)] focus-visible:border-[color:var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[invalid=true]:border-[color:var(--danger)] data-[invalid=true]:focus-visible:ring-[color:var(--danger)]/20',
        'file:border-0 file:bg-transparent file:text-[length:var(--fs-meta)] file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };

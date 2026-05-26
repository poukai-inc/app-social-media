'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      data-invalid={invalid || undefined}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--bg-elevated)] px-3 py-2',
        'text-[length:var(--fs-body)] text-[color:var(--fg)] placeholder:text-[color:var(--fg-muted)]',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-glow)] focus-visible:border-[color:var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[invalid=true]:border-[color:var(--danger)] data-[invalid=true]:focus-visible:ring-[color:var(--danger)]/20',
        'resize-y',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };

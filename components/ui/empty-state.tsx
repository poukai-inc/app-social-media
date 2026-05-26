import * as React from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-[color:var(--hairline)] bg-[color:var(--surface)] px-6 py-12 text-center',
        className,
      )}
      {...rest}
    >
      {icon && (
        <div className="mb-4 text-[color:var(--fg-muted)]" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-[length:var(--fs-h3)] font-semibold text-[color:var(--fg)]">{title}</h3>
      {description && (
        <p className="mt-1 text-[length:var(--fs-meta)] text-[color:var(--fg-muted)] max-w-md">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

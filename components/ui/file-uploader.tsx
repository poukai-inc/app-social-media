'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FileUploaderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  invalid?: boolean;
}

export const FileUploader = React.forwardRef<HTMLInputElement, FileUploaderProps>(
  ({ className, label, hint, invalid, ...props }, ref) => {
    const id = React.useId();
    return (
      <label
        htmlFor={props.id ?? id}
        data-invalid={invalid || undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[color:var(--hairline)] bg-[color:var(--surface)] px-6 py-8 cursor-pointer transition-colors',
          'hover:border-[color:var(--accent)] hover:bg-[color:var(--bg-elevated)]',
          'data-[invalid=true]:border-[color:var(--danger)]',
          className,
        )}
      >
        <Upload className="h-6 w-6 text-[color:var(--fg-muted)]" aria-hidden />
        <span className="text-[length:var(--fs-meta)] font-medium text-[color:var(--fg)]">
          {label ?? 'Click to upload or drag and drop'}
        </span>
        {hint && (
          <span className="text-[length:var(--fs-micro)] text-[color:var(--fg-muted)]">{hint}</span>
        )}
        <input ref={ref} id={props.id ?? id} type="file" className="sr-only" {...props} />
      </label>
    );
  },
);
FileUploader.displayName = 'FileUploader';

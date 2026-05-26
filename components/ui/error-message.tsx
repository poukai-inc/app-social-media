import * as React from 'react';
import { cn } from '@/lib/cn';

const ErrorMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      role="alert"
      className={cn('text-[length:var(--fs-micro)] text-[color:var(--danger)]', className)}
      {...props}
    />
  ),
);
ErrorMessage.displayName = 'ErrorMessage';

export { ErrorMessage };

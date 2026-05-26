import * as React from 'react';
import { cn } from '@/lib/cn';

const HelperText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-[length:var(--fs-micro)] text-[color:var(--fg-muted)]', className)}
      {...props}
    />
  ),
);
HelperText.displayName = 'HelperText';

export { HelperText };

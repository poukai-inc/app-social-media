'use client';

import * as React from 'react';
import { Input } from './input';
import { cn } from '@/lib/cn';

interface TimePickerProps extends Omit<React.ComponentProps<typeof Input>, 'type' | 'onChange' | 'value'> {
  value?: string;
  onChange?: (value: string) => void;
}

export const TimePicker = React.forwardRef<HTMLInputElement, TimePickerProps>(
  ({ className, value, onChange, ...props }, ref) => (
    <Input
      ref={ref}
      type="time"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={cn('w-auto', className)}
      {...props}
    />
  ),
);
TimePicker.displayName = 'TimePicker';

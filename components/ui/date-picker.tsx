'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export type DatePickerProps = React.ComponentProps<typeof DayPicker>;

export function DatePicker({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: DatePickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-[length:var(--fs-meta)] font-medium',
        nav: 'space-x-1 flex items-center',
        nav_button:
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-[color:var(--hairline)]',
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell:
          'text-[color:var(--fg-muted)] rounded-md w-9 font-normal text-[length:var(--fs-micro)]',
        row: 'flex w-full mt-2',
        cell: 'h-9 w-9 text-center text-[length:var(--fs-meta)] p-0 relative',
        day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-[color:var(--surface)] inline-flex items-center justify-center',
        day_selected:
          'bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent)] focus:bg-[color:var(--accent)]',
        day_today: 'bg-[color:var(--surface)] text-[color:var(--fg)]',
        day_outside: 'text-[color:var(--fg-muted)] opacity-50',
        day_disabled: 'text-[color:var(--fg-muted)] opacity-50',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}

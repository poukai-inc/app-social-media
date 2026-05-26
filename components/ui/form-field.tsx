'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { Label } from './label';
import { HelperText } from './helper-text';
import { ErrorMessage } from './error-message';

interface FormFieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export function useFormField() {
  const ctx = React.useContext(FormFieldContext);
  if (!ctx) throw new Error('useFormField must be used within <FormField>');
  return ctx;
}

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}

export function FormField({
  label,
  helper,
  error,
  required,
  htmlFor,
  className,
  children,
  ...rest
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = htmlFor ?? generatedId;
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FormFieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn('flex flex-col gap-1.5', className)} {...rest}>
        {label && (
          <Label htmlFor={id}>
            {label}
            {required && (
              <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden>
                *
              </span>
            )}
          </Label>
        )}
        {children}
        {helper && !error && <HelperText id={helperId}>{helper}</HelperText>}
        {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
      </div>
    </FormFieldContext.Provider>
  );
}

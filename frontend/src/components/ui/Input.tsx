import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  rightElement?: React.ReactNode;
  inputId?: string;
}

/**
 * Reusable Input component with label, error, help text, and right element.
 * Forwards ref for React Hook Form compatibility. Fully theme-aware.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helpText, rightElement, inputId, className = '', ...props },
  ref,
) {
  const id = inputId ?? props.name ?? `input_${Math.random().toString(36).slice(2)}`;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-semibold text-text-primary">
          {label}
          {props.required && <span className="ml-1 text-semantic-critical">*</span>}
        </label>
      )}
      <div className="relative group">
        <input
          id={id}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}_error` : helpText ? `${id}_help` : undefined}
          className={[
            'w-full rounded-xl border px-3.5 py-2.5 text-sm text-text-primary',
            'bg-input-bg placeholder:text-text-muted',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-brand-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error
              ? 'border-semantic-critical bg-red-500/5 focus:ring-semantic-critical/40'
              : 'border-input-border hover:border-text-secondary',
            rightElement ? 'pr-10' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p id={`${id}_error`} role="alert" className="text-xs font-medium text-semantic-critical">
          {error}
        </p>
      )}
      {!error && helpText && (
        <p id={`${id}_help`} className="text-xs text-text-secondary">
          {helpText}
        </p>
      )}
    </div>
  );
});

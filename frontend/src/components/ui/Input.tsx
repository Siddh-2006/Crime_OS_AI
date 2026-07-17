import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  rightElement?: React.ReactNode;
  inputId?: string;
}

/**
 * Reusable Input component with label, error, help text, and right element (e.g. show/hide icon).
 * Forwards ref for React Hook Form compatibility.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helpText, rightElement, inputId, className = '', ...props },
  ref,
) {
  const id = inputId ?? props.name ?? `input_${Math.random().toString(36).slice(2)}`;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label}
          {props.required && <span className="ml-1 text-danger-600">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}_error` : helpText ? `${id}_help` : undefined}
          className={[
            'w-full rounded-md border px-3 py-2.5 text-sm text-neutral-900',
            'placeholder:text-neutral-400',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
            error
              ? 'border-danger-500 bg-danger-50 focus:ring-danger-400'
              : 'border-neutral-300 bg-white hover:border-neutral-400',
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
        <p id={`${id}_error`} role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      )}
      {!error && helpText && (
        <p id={`${id}_help`} className="text-xs text-neutral-500">
          {helpText}
        </p>
      )}
    </div>
  );
});

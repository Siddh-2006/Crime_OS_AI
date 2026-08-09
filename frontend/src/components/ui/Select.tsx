import React, { forwardRef } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  inputId?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, inputId, className = '', ...props },
  ref,
) {
  const id = inputId ?? props.name ?? `select_${Math.random().toString(36).slice(2)}`;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
          {props.required && <span className="ml-1 text-semantic-critical">*</span>}
        </label>
      )}
      <select
        id={id}
        ref={ref}
        aria-invalid={!!error}
        className={[
          'w-full rounded-md border px-3 py-2.5 text-sm text-text-primary',
          'transition-colors duration-150 bg-[#0a0f1c]',
          'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
          'disabled:cursor-not-allowed disabled:bg-neutral-800 dark:disabled:bg-neutral-800 disabled:text-text-secondary',
          error
            ? 'border-semantic-critical bg-red-500/10'
            : 'border-neutral-800 hover:border-neutral-600',
          className,
        ].join(' ')}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-semantic-critical">
          {error}
        </p>
      )}
    </div>
  );
});

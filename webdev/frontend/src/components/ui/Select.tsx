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
        <label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label}
          {props.required && <span className="ml-1 text-danger-600">*</span>}
        </label>
      )}
      <select
        id={id}
        ref={ref}
        aria-invalid={!!error}
        className={[
          'w-full rounded-md border px-3 py-2.5 text-sm text-neutral-900',
          'transition-colors duration-150 bg-white',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
          'disabled:cursor-not-allowed disabled:bg-neutral-100',
          error
            ? 'border-danger-500 bg-danger-50'
            : 'border-neutral-300 hover:border-neutral-400',
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
        <p role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});

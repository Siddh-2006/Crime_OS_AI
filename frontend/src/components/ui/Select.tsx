import React, { forwardRef, useId } from 'react';

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
  const generatedId = useId();
  const id = inputId ?? props.name ?? `select_${generatedId.replace(/:/g, '')}`;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-semibold text-text-primary">
          {label}
          {props.required && <span className="ml-1 text-semantic-critical">*</span>}
        </label>
      )}
      <select
        id={id}
        ref={ref}
        aria-invalid={!!error}
        className={[
          'w-full rounded-xl border px-3.5 py-2.5 text-sm text-text-primary',
          'transition-all duration-200 bg-input-bg',
          'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-brand-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-semantic-critical bg-red-500/5'
            : 'border-input-border hover:border-text-secondary',
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
        <p role="alert" className="text-xs font-medium text-semantic-critical">
          {error}
        </p>
      )}
    </div>
  );
});

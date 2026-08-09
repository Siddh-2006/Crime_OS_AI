import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-primary text-white hover:opacity-90 active:opacity-80 focus-visible:ring-brand-primary disabled:bg-neutral-300 dark:disabled:bg-neutral-700',
  secondary:
    'bg-brand-accent text-white hover:opacity-90 active:opacity-80 focus-visible:ring-brand-accent disabled:bg-neutral-800 dark:disabled:bg-neutral-700',
  ghost:
    'bg-transparent text-text-primary hover:bg-neutral-800 dark:hover:bg-neutral-800 active:bg-neutral-800 dark:active:bg-neutral-700 focus-visible:ring-brand-primary',
  danger:
    'bg-semantic-critical text-white hover:opacity-90 active:opacity-80 focus-visible:ring-semantic-critical disabled:opacity-50',
  outline:
    'bg-transparent text-text-primary hover:bg-neutral-800 dark:hover:bg-neutral-800 active:bg-neutral-800 dark:active:bg-neutral-700 focus-visible:ring-brand-primary border border-neutral-700 dark:border-neutral-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

/**
 * Reusable Button component with variant, size, loading, and icon support.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button
      disabled={disabled || isLoading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {isLoading ? (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        leftIcon
      )}
      {children}
      {rightIcon}
    </button>
  );
}

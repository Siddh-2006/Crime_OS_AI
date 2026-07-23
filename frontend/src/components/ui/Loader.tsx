import React from 'react';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | number;
  label?: string;
  fullPage?: boolean;
  color?: string;
}

const sizeMap = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

/**
 * Spinner loader with optional label and full-page overlay.
 */
export function Loader({ size = 'md', label = 'Loading...', fullPage = false, color }: LoaderProps): React.ReactElement {
  const resolvedSizeClass = typeof size === 'number' ? '' : sizeMap[size as 'sm' | 'md' | 'lg'];
  const resolvedStyle = typeof size === 'number'
    ? { width: size, height: size, color }
    : { color };
  const spinner = (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label}>
      <svg
        className={['animate-spin', color ? '' : 'text-primary-700', resolvedSizeClass].join(' ')}
        style={resolvedStyle}
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
      <span className="sr-only">{label}</span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
}

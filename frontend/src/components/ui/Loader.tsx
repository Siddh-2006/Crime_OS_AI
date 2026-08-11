import React from 'react';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | number;
  label?: string;
  fullPage?: boolean;
  color?: string;
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

/**
 * Logo-based loader with pulsing glow, scanning line, and animated label.
 */
export function Loader({ size = 'md', label = 'Loading...', fullPage = false, color }: LoaderProps): React.ReactElement {
  const resolvedSizeClass = typeof size === 'number' ? '' : sizeMap[size as 'sm' | 'md' | 'lg'];
  const resolvedStyle = typeof size === 'number'
    ? { width: size, height: size, color }
    : { color };

  const spinner = (
    <div className="flex flex-col items-center gap-4" role="status" aria-label={label}>
      <div className={['relative', resolvedSizeClass].join(' ')} style={resolvedStyle}>
        {/* Pulsing glow ring */}
        <div className="absolute inset-[-4px] rounded-full border border-brand-primary/20 animate-pulse" />

        {/* Scanning line */}
        <div
          className="absolute left-0 right-0 h-[1px] z-10 animate-scan-line"
          style={{ background: 'linear-gradient(90deg, transparent, var(--brand-primary), transparent)' }}
        />

        {/* Logo */}
        <img
          src="/logo.svg"
          alt="Loading"
          className="w-full h-full object-contain animate-pulse drop-shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.3)]"
        />
      </div>
      <span className="text-[10px] font-heading font-bold tracking-[0.2em] uppercase text-brand-primary/70 animate-pulse">
        {label}
      </span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-md">
        {spinner}
      </div>
    );
  }

  return spinner;
}

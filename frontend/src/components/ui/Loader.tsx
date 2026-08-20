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

export function Loader({ size = 'md', label = 'Loading...', fullPage = false, color }: LoaderProps): React.ReactElement {
  const resolvedSizeClass = typeof size === 'number' ? '' : sizeMap[size as 'sm' | 'md' | 'lg'];
  const resolvedStyle = typeof size === 'number' ? { width: size, height: size } : undefined;

  const spinner = (
    <div
      className={['loader', resolvedSizeClass, 'text-blue-600'].filter(Boolean).join(' ')}
      style={resolvedStyle}
      role="status"
      aria-label={label}
    />
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

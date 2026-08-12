import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  glass?: boolean;
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ children, className = '', padding = 'md', hover = false, glass = false }: CardProps): React.ReactElement {
  return (
    <div
      className={[
        'rounded-2xl border shadow-card',
        glass
          ? 'glass'
          : 'bg-surface/65 backdrop-blur-md border-border',
        hover ? 'card-hover cursor-pointer' : '',
        'transition-all duration-250',
        paddingClasses[padding],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
      <div>
        <h2 className="text-lg font-heading font-bold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

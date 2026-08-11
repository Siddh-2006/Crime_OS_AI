import React from 'react';

interface PortalBrandProps {
  className?: string;
}

/**
 * Gujarat / Surat Police Crime OS portal brand mark.
 * Theme-aware for both Official Light Government look and Dark Tactical Mode.
 */
export function PortalBrand({ className = '' }: PortalBrandProps): React.ReactElement {
  return (
    <div className={['flex items-center gap-3', className].join(' ')}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-border shadow-sm p-1">
        <img src="/logo.svg" alt="Gujarat Police Logo" className="w-full h-full object-contain" />
      </div>
      <div>
        <p className="text-[10px] font-heading font-extrabold uppercase tracking-[0.2em] text-brand-primary mb-0.5">
          Surat City Police
        </p>
        <h1 className="text-xl font-heading font-black leading-none tracking-tight text-text-primary">
          Crime <span className="text-brand-accent">OS</span>
        </h1>
      </div>
    </div>
  );
}

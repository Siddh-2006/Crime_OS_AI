import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface PortalBrandProps {
  className?: string;
}

/**
 * Gujarat Police Crime OS portal brand mark.
 * Used in auth layouts and top navigation.
 */
export function PortalBrand({ className = '' }: PortalBrandProps): React.ReactElement {
  return (
    <div className={['flex items-center gap-3', className].join(' ')}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900/50 shadow-sm border border-neutral-800 p-1">
        <img src="/image.png" alt="Gujarat Police Logo" className="w-full h-full object-contain" />
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-brand-primary mb-0.5">
          Gujarat Police
        </p>
        <h1 className="text-xl font-bold leading-none tracking-tight text-white">Crime OS</h1>
      </div>
    </div>
  );
}

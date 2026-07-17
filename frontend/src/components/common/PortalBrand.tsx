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
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-900 text-white shadow-sm">
        <ShieldCheck size={22} strokeWidth={2} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-600">
          Gujarat Police
        </p>
        <h1 className="text-lg font-bold leading-none text-primary-900">Crime OS</h1>
      </div>
    </div>
  );
}

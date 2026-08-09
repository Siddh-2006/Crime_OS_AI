import React from 'react';
import type { Metadata } from 'next';
import { PortalBrand } from '@/components/common/PortalBrand';

import { Watermark } from '@/components/Watermark';

export const metadata: Metadata = {
  title: 'Authentication — Crime OS Gujarat Police',
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps): React.ReactElement {
  return (
    <div className="relative min-h-screen flex bg-background overflow-hidden">
      <div className="relative z-10 flex w-full min-h-screen">
        
        {/* Left Side: Branding & Quote */}
        <div className="hidden lg:flex lg:flex-1 flex-col justify-between px-16 py-16 relative">
          {/* Subtle Watermark isolated to left side */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
            <Watermark />
          </div>

          <div className="relative z-10">
            <PortalBrand />
          </div>
          
          <div className="max-w-2xl relative z-10 mt-12">
            <h2 className="text-5xl font-extrabold text-white tracking-tight mb-8 leading-[1.1]">
              Centralized <span className="text-blue-900/60">Intelligence</span><br /> 
              & Investigation
            </h2>
            <blockquote className="border-l-4 border-blue-900/60 pl-6 py-2">
              <p className="text-2xl font-light leading-relaxed text-slate-300">
                &ldquo;Committed to protecting the citizens of Gujarat with integrity, efficiency, and transparency.&rdquo;
              </p>
              <footer className="mt-6 text-sm font-bold text-blue-900/60 tracking-widest uppercase">— Gujarat Police</footer>
            </blockquote>
          </div>

          <div className="flex items-center gap-6 relative z-10 mt-auto pt-16">
            <div className="h-16 w-16 rounded-xl bg-surface border border-neutral-800 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-500">100</span>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Emergency</p>
              <p className="text-sm text-slate-200">Police Helpline Active 24/7</p>
            </div>
          </div>
        </div>

        {/* Right Side: Solid Auth Panel */}
        <div className="flex w-full lg:w-[450px] xl:w-[500px] items-center justify-center px-6 sm:px-12 lg:px-12 bg-[#080d19] border-l border-neutral-800/50 shadow-2xl relative z-20">
           <div className="w-full max-w-md">
              <div className="lg:hidden mb-12 flex justify-center">
                <PortalBrand />
              </div>
              {children}
           </div>
        </div>
      </div>
    </div>
  );
}

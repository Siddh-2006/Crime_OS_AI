import React from 'react';
import type { Metadata } from 'next';
import { PortalBrand } from '@/components/common/PortalBrand';
import { ThemeToggle } from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'Authentication — Crime OS Surat City Police',
};

export default function AuthLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="relative min-h-screen flex bg-background text-text-primary overflow-hidden transition-colors duration-300">
      
      {/* Background grid — very subtle, soft ambient lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] z-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(var(--brand-primary-rgb), 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.12) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Top Bar with Theme Toggle */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-3">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex w-full min-h-screen">
        
        {/* Left Side: Surat City Police Official Branding */}
        <div className="hidden lg:flex lg:flex-1 flex-col justify-between px-16 py-16 relative border-r border-border bg-background">
          
          {/* Subtle Logo Watermark */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.03] dark:opacity-[0.04]">
            <img
              src="/logo.svg"
              alt="Surat City Police Emblem"
              className="w-[450px] grayscale select-none"
            />
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <PortalBrand />
            <div className="px-4 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-[11px] font-heading font-extrabold text-brand-accent uppercase tracking-[0.2em] shadow-sm">
              Surat City Command Zone
            </div>
          </div>
          
          <div className="max-w-2xl relative z-10 mt-12 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-mono font-bold tracking-wider uppercase shadow-sm">
              <span className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
              Gujarat Police Official Operating System
            </div>

            <h2 className="text-5xl font-heading font-black tracking-tight text-text-primary leading-[1.1]">
              Centralized <span className="text-gradient">Intelligence</span><br /> 
              & Investigation Platform
            </h2>

            <blockquote className="border-l-4 border-brand-accent pl-6 py-3 bg-brand-accent/5 rounded-r-2xl border-border shadow-sm">
              <p className="text-xl font-medium leading-relaxed text-text-primary italic">
                &ldquo;Suraksha, Shanti, Seva — Dedicated to protecting the citizens of Surat City with integrity, advanced technology, and absolute transparency.&rdquo;
              </p>
              <footer className="mt-4 flex items-center gap-3">
                <span className="text-xs font-heading font-bold text-brand-accent tracking-[0.25em] uppercase">Surat City Police Department</span>
                <span className="text-text-secondary">&bull;</span>
                <span className="text-xs font-mono text-brand-primary font-bold">સુરક્ષા શાંતિ સેવા</span>
              </footer>
            </blockquote>
          </div>

          <div className="flex items-center justify-between relative z-10 mt-auto pt-16 border-t border-border">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex flex-col items-center justify-center text-brand-primary shadow-sm">
                <span className="text-xl font-heading font-extrabold">100</span>
              </div>
              <div>
                <p className="text-[11px] text-brand-accent uppercase tracking-[0.2em] font-extrabold mb-0.5">Control Room Helpline</p>
                <p className="text-sm font-bold text-text-primary">Surat Police Helpline 24/7 Active</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[11px] font-mono text-text-secondary font-bold uppercase tracking-widest">Portal Status</p>
              <p className="text-xs font-mono font-bold text-semantic-success flex items-center gap-1.5 justify-end">
                <span className="h-2 w-2 rounded-full bg-semantic-success animate-pulse" />
                SECURE & ONLINE
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Clean Solid Auth Panel */}
        <div className="flex w-full lg:w-[480px] xl:w-[520px] items-center justify-center px-6 sm:px-12 lg:px-12 bg-surface border-l border-border shadow-2xl relative z-20">
           <div className="w-full max-w-md">
              <div className="lg:hidden mb-10 flex justify-center">
                <PortalBrand />
              </div>
              {children}
           </div>
        </div>
      </div>
    </div>
  );
}

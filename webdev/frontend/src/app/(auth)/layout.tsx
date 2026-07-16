import React from 'react';
import type { Metadata } from 'next';
import { PortalBrand } from '@/components/common/PortalBrand';

export const metadata: Metadata = {
  title: 'Authentication — Crime OS Gujarat Police',
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout for all authentication pages.
 * Split-pane design: branding panel on left, form on right.
 */
export default function AuthLayout({ children }: AuthLayoutProps): React.ReactElement {
  return (
    <div className="flex min-h-screen">
      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between bg-primary-900 px-10 py-12 text-white flex-shrink-0">
        <PortalBrand />

        <div>
          <blockquote className="border-l-2 border-secondary-400 pl-4">
            <p className="text-lg font-light leading-relaxed text-primary-100">
              &ldquo;Committed to protecting the citizens of Gujarat with integrity, efficiency, and transparency.&rdquo;
            </p>
            <footer className="mt-3 text-sm text-primary-300">— Gujarat Police</footer>
          </blockquote>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-primary-400 uppercase tracking-widest">Helpline</p>
          <p className="text-2xl font-bold text-secondary-400">100</p>
          <p className="text-sm text-primary-300">Emergency Police Helpline</p>
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Mobile brand */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4 lg:hidden">
          <PortalBrand />
        </div>

        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">{children}</div>
        </main>

        <footer className="border-t border-neutral-200 bg-white px-6 py-4 text-center">
          <p className="text-xs text-neutral-500">
            &copy; {new Date().getFullYear()} Gujarat Police. All rights reserved. |{' '}
            <a href="#" className="hover:underline">
              Privacy Policy
            </a>{' '}
            |{' '}
            <a href="#" className="hover:underline">
              Terms of Service
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

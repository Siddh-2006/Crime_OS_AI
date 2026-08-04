'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldCheck, LayoutDashboard, LogOut, User, FileText, Bell, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES, ROLE } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { LanguageSelector } from '@/components/common/LanguageSelector';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const citizenNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'File a Complaint', href: APP_ROUTES.FILE_COMPLAINT, icon: <Plus size={18} /> },
  { label: 'My Complaints', href: '/dashboard/complaints', icon: <FileText size={18} /> },
];

const policeNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/police/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'File a Complaint', href: APP_ROUTES.FILE_COMPLAINT, icon: <Plus size={18} /> },
  { label: 'Station Complaints', href: '/police/dashboard/complaints', icon: <FileText size={18} /> },
];

/**
 * Shared dashboard layout with sidebar navigation.
 * Role-aware navigation items.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (isLoading) return <Loader fullPage />;

  const isPolice = user?.role === ROLE.SHO || user?.role === ROLE.IO;
  const navItems = isPolice ? policeNavItems : citizenNavItems;
  const displayName = isPolice
    ? (user?.officerName ?? user?.email ?? 'Officer')
    : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email;

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden w-60 flex-shrink-0 flex-col bg-primary-900 text-white lg:flex">
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-primary-800 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-700">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-primary-400">
              Gujarat Police
            </p>
            <p className="text-sm font-bold">Crime OS</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-700 text-white'
                    : 'text-primary-200 hover:bg-primary-800 hover:text-white',
                ].join(' ')}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-primary-800 p-4 space-y-3">
          <LanguageSelector />
          <div>
            <p className="text-xs text-primary-400 truncate">{displayName}</p>
            <p className="text-xs font-semibold text-secondary-400 uppercase tracking-wide">
              {user?.role ?? ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleLogout}
            leftIcon={<LogOut size={15} />}
            className="border-primary-700 text-primary-200 hover:bg-primary-800 hover:text-white"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4 shadow-sm">
          <div className="lg:hidden flex items-center gap-3">
            <ShieldCheck size={20} className="text-primary-800" />
            <span className="font-bold text-primary-900 text-sm">Crime OS</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-4">
            <div className="text-neutral-700">
              <LanguageSelector />
            </div>
            <button
              className="relative rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-800 text-white text-xs font-bold">
                {displayName?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-neutral-700">{displayName}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">{children}</main>

        <footer className="border-t border-neutral-200 bg-white px-6 py-3 text-center">
          <p className="text-xs text-neutral-400">
            &copy; {new Date().getFullYear()} Gujarat Police Crime OS — Secure Government Portal
          </p>
        </footer>
      </div>
    </div>
  );
}

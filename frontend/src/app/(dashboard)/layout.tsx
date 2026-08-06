'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldCheck, LayoutDashboard, LogOut, FileText, Bell, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES, ROLE } from '@/lib/constants';
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
 * Shared dashboard layout with collapsible sidebar navigation.
 * Role-aware navigation items. Collapse state persisted in localStorage.
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
      <CollapsibleSidebar
        navItems={navItems}
        pathname={pathname}
        displayName={displayName}
        userRole={user?.role ?? ''}
        onLogout={handleLogout}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
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

/* ── Collapsible Sidebar ─────────────────────────────────────────────── */

interface CollapsibleSidebarProps {
  navItems: NavItem[];
  pathname: string;
  displayName: string | undefined;
  userRole: string;
  onLogout: () => void;
}

function CollapsibleSidebar({
  navItems,
  pathname,
  displayName,
  userRole,
  onLogout,
}: CollapsibleSidebarProps): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  return (
    <aside
      style={{ transition: 'width 0.3s ease' }}
      className={[
        'hidden lg:flex flex-shrink-0 flex-col bg-primary-900 text-white relative',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      {/* Squeeze / expand toggle button */}
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-white shadow-md hover:bg-primary-500 transition-colors border border-primary-600"
      >
        {/* Chevron icon — rotates when collapsed */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'transform 0.3s ease', transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Brand */}
      <div
        className={[
          'flex items-center border-b border-primary-800 py-5',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5',
        ].join(' ')}
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-700">
          <ShieldCheck size={20} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-primary-400">
              Gujarat Police
            </p>
            <p className="text-sm font-bold">Crime OS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors group relative',
                collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                isActive
                  ? 'bg-primary-700 text-white'
                  : 'text-primary-200 hover:bg-primary-800 hover:text-white',
              ].join(' ')}
            >
              <span className="flex-shrink-0">{item.icon}</span>

              {!collapsed && <span>{item.label}</span>}

              {/* Floating tooltip shown on hover when collapsed */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div
        className={[
          'border-t border-primary-800 p-3 space-y-2',
          collapsed ? 'flex flex-col items-center' : '',
        ].join(' ')}
      >
        {!collapsed && (
          <>
            <LanguageSelector />
            <div className="min-w-0">
              <p className="text-xs text-primary-400 truncate">{displayName}</p>
              <p className="text-xs font-semibold text-secondary-400 uppercase tracking-wide">
                {userRole}
              </p>
            </div>
          </>
        )}

        {/* Logout */}
        <button
          onClick={onLogout}
          className={[
            'flex items-center rounded-lg py-2 text-primary-200 hover:bg-primary-800 hover:text-white transition-colors w-full group relative',
            collapsed ? 'justify-center px-2' : 'gap-2 px-3',
          ].join(' ')}
        >
          <LogOut size={15} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Sign Out
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

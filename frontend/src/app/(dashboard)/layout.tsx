'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ShieldCheck, LayoutDashboard, LogOut, FileText, Bell, Plus, Bot, ClipboardList, BookOpen, MapPin, Send, FolderOpen, Users, Brain, Clock, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES, ROLE } from '@/lib/constants';
import { Loader } from '@/components/ui/Loader';
import { LanguageSelector } from '@/components/common/LanguageSelector';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Watermark } from '@/components/Watermark';

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

// Case-level tabs shown in the sidebar when an IO opens a complaint
const caseNavItems = [
  { id: 'analysis', label: 'AI Analysis', icon: <Bot size={15} /> },
  { id: 'checklist', label: 'Checklist', icon: <ClipboardList size={15} /> },
  { id: 'diary', label: 'Case Diary', icon: <BookOpen size={15} /> },
  { id: 'placesVisited', label: 'Places Visited', icon: <MapPin size={15} /> },
  { id: 'requests', label: 'Requests', icon: <Send size={15} /> },
  { id: 'evidence', label: 'Evidence', icon: <FolderOpen size={15} /> },
  { id: 'participants', label: 'Participants', icon: <Users size={15} /> },
  { id: 'complaint', label: 'Original Complaint', icon: <FileText size={15} /> },
  { id: 'case_understanding', label: 'Case Understanding', icon: <Brain size={15} /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock size={15} /> },
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
    <div className="flex h-screen bg-background overflow-hidden">
      <Watermark />
      {/* ── Sidebar ────────────────────────────────────────────────────────────── */}
      <CollapsibleSidebar
        navItems={navItems}
        pathname={pathname}
        displayName={displayName}
        userRole={user?.role ?? ''}
        onLogout={handleLogout}
        isPolice={isPolice}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 bg-background text-text-primary relative z-10 overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 flex items-center justify-between border-b border-neutral-800 bg-surface px-6 py-4 shadow-sm z-30">
          <div className="lg:hidden flex items-center gap-3">
            <ShieldCheck size={20} className="text-brand-primary" />
            <span className="font-bold text-text-primary text-sm">Crime OS</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-4">
            <div className="text-text-primary">
              <LanguageSelector />
            </div>
            <ThemeToggle />
            <button
              className="relative rounded-full p-2 text-text-secondary hover:bg-neutral-800 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-xs font-bold">
                {displayName?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-text-primary">{displayName}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 relative z-10">{children}</main>

        <footer className="border-t border-neutral-800 bg-surface px-6 py-3 text-center relative z-10">
          <p className="text-xs text-text-secondary">
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
  isPolice?: boolean;
}

function CollapsibleSidebar({
  navItems,
  pathname,
  displayName,
  userRole,
  onLogout,
  isPolice,
}: CollapsibleSidebarProps): React.ReactElement {
  const searchParams = useSearchParams();
  // Detect if we're inside a complaint detail page
  const caseMatch = pathname.match(/\/police\/dashboard\/complaints\/([^/]+)$/);
  const caseId = caseMatch ? caseMatch[1] : null;
  const activeIoTab = searchParams.get('tab') || 'analysis';
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
        'hidden lg:flex flex-shrink-0 flex-col bg-surface border-r border-neutral-800 text-text-primary relative z-20',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      {/* Squeeze / expand toggle button */}
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary text-black shadow-md hover:bg-brand-primary/80 transition-colors border border-brand-primary"
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
          'flex items-center border-b border-neutral-800 py-5',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5',
        ].join(' ')}
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-neutral-800 p-0.5">
          <img src="/image.png" alt="Gujarat Police Logo" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-[9px] font-bold uppercase tracking-widest text-brand-primary mb-0.5">
              Gujarat Police
            </p>
            <p className="text-sm font-bold text-white">Crime OS</p>
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
                  ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                  : 'text-text-secondary hover:bg-neutral-800 hover:text-white',
              ].join(' ')}
            >
              <span className="flex-shrink-0">{item.icon}</span>

              {!collapsed && <span>{item.label}</span>}

              {/* Floating tooltip shown on hover when collapsed */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 border border-neutral-800">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}

        {/* Case-level navigation — shown when inside a complaint page (IO) */}
        {isPolice && caseId && !collapsed && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 px-3 mb-2">Case Navigation</p>
            <div className="space-y-0.5">
              {caseNavItems.map((tab) => {
                const isTabActive = activeIoTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={`${pathname}?tab=${tab.id}`}
                    className={[
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors group relative',
                      isTabActive
                        ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                        : 'text-text-secondary hover:bg-neutral-800 hover:text-white',
                    ].join(' ')}
                  >
                    <span className="flex-shrink-0 opacity-80">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {isTabActive && <ChevronRight size={10} className="ml-auto" />}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsed case nav — icon only */}
        {isPolice && caseId && collapsed && (
          <div className="mt-4 pt-4 border-t border-neutral-800 space-y-0.5">
            {caseNavItems.map((tab) => {
              const isTabActive = activeIoTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`${pathname}?tab=${tab.id}`}
                  className={[
                    'flex items-center justify-center rounded-lg p-2 transition-colors group relative',
                    isTabActive
                      ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                      : 'text-text-secondary hover:bg-neutral-800 hover:text-white',
                  ].join(' ')}
                >
                  <span className="flex-shrink-0">{tab.icon}</span>
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 border border-neutral-800">
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div
        className={[
          'border-t border-neutral-800 p-3 space-y-2',
          collapsed ? 'flex flex-col items-center' : '',
        ].join(' ')}
      >
        {!collapsed && (
          <>
            <LanguageSelector />
            <div className="min-w-0">
              <p className="text-xs text-text-primary truncate">{displayName}</p>
              <p className="text-[10px] font-semibold text-brand-primary uppercase tracking-wide">
                {userRole}
              </p>
            </div>
          </>
        )}

        {/* Logout */}
        <button
          onClick={onLogout}
          className={[
            'flex items-center rounded-lg py-2 text-text-secondary hover:bg-neutral-800 hover:text-white transition-colors w-full group relative',
            collapsed ? 'justify-center px-2' : 'gap-2 px-3',
          ].join(' ')}
        >
          <LogOut size={15} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 border border-neutral-800">
              Sign Out
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

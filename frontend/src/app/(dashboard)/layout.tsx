'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Network, ShieldCheck, LayoutDashboard, LogOut, FileText, Bell, Plus, Bot, ClipboardList, BookOpen, MapPin, Send, FolderOpen, Users, Brain, Clock, ChevronRight, Shield, MessageSquare, QrCode } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES, ROLE } from '@/lib/constants';
import { Loader } from '@/components/ui/Loader';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Watermark } from '@/components/Watermark';
import { ParticleBackground } from '@/components/ParticleBackground';
import apiClient from '@/lib/axios';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { OfflineBanner } from '@/components/OfflineBanner';

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
  { label: 'My Profile', href: '/police/profile', icon: <Users size={18} /> },
];

// Case-level tabs shown in the sidebar when an IO opens a complaint
const caseNavItems = [
  { id: 'analysis', label: 'AI Analysis', icon: <Bot size={15} /> },
  { id: 'checklist', label: 'Checklist', icon: <ClipboardList size={15} /> },
  { id: 'diary', label: 'Case Diary', icon: <BookOpen size={15} /> },
  { id: 'placesVisited', label: 'Places Visited', icon: <MapPin size={15} /> },
  { id: 'requests', label: 'Requests', icon: <Send size={15} /> },
  { id: 'evidence', label: 'Evidence', icon: <FolderOpen size={15} /> },
  { id: 'physical_evidence', label: 'Physical Evidence (QR)', icon: <QrCode size={15} /> },
  { id: 'participants', label: 'Participants', icon: <Users size={15} /> },
  { id: 'custody', label: 'Custody', icon: <Shield size={15} /> },
  { id: 'complaint', label: 'Original Complaint', icon: <FileText size={15} /> },
  { id: 'case_understanding', label: 'Case Understanding', icon: <Brain size={15} /> },
  { id: 'room', label: 'Private Room', icon: <MessageSquare size={15} /> },
  { id: 'graph', label: 'Knowledge Graph', icon: <Network size={15} /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock size={15} /> },
];

// Case-level tabs shown in the sidebar when an SHO views a complaint
const shoCaseNavItems = [
  { id: 'original', label: 'Original Complaint', icon: <FileText size={15} /> },
  { id: 'ai', label: 'AI Case Understanding', icon: <Brain size={15} /> },
  { id: 'audit', label: 'Case Status & Timeline', icon: <Clock size={15} /> },
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
  const isSho = user?.role === ROLE.SHO;
  const activeCaseNavItems = isSho ? shoCaseNavItems : caseNavItems;
  const navItems = isPolice ? policeNavItems : citizenNavItems;
  const displayName = isPolice
    ? (user?.officerName ?? user?.email ?? 'Officer')
    : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email;

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <ParticleBackground />
      <Watermark />
      {isPolice && <OfflineBanner />}
      {/* ── Sidebar ────────────────────────────────────────────────────────────── */}
      <CollapsibleSidebar
        navItems={navItems}
        caseNavList={activeCaseNavItems}
        pathname={pathname}
        displayName={displayName}
        userRole={user?.role ?? ''}
        onLogout={handleLogout}
        isPolice={isPolice}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 bg-transparent text-text-primary relative z-10 overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 flex items-center justify-between border-b border-border bg-surface/85 backdrop-blur-xl px-6 py-4 shadow-sm z-30">
          <div className="lg:hidden flex items-center gap-3">
            <ShieldCheck size={20} className="text-brand-primary" />
            <span className="font-heading font-bold text-text-primary text-sm">Crime OS</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            {isPolice && <SyncStatusIndicator />}
            <LanguageToggle />
            <ThemeToggle />
            <div className="flex items-center gap-3 pl-3 border-l border-border">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary text-white text-xs font-bold shadow-xs">
                {displayName?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-bold text-text-primary hidden sm:inline">{displayName}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-text-primary bg-surface-elevated hover:bg-brand-primary/10 hover:text-brand-primary border border-border hover:border-brand-primary/30 rounded-xl transition-all shadow-xs ml-1"
                title="Sign Out"
              >
                <LogOut size={14} className="text-text-secondary" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-6 relative z-10 flex flex-col">{children}</main>

        <footer className="border-t border-border bg-surface/60 backdrop-blur-sm px-6 py-3 text-center relative z-10">
          <p className="text-[11px] text-text-muted font-medium tracking-wide">
            &copy; {new Date().getFullYear()} Gujarat Police &mdash; Crime OS Intelligence Portal &bull; &ldquo;Committed to Justice, Driven by Technology&rdquo;
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ── Collapsible Sidebar ─────────────────────────────────────────────── */

interface CollapsibleSidebarProps {
  navItems: NavItem[];
  caseNavList?: Array<{ id: string; label: string; icon: React.ReactNode }>;
  pathname: string;
  displayName: string | undefined;
  userRole: string;
  onLogout: () => void;
  isPolice?: boolean;
}

function CollapsibleSidebar({
  navItems,
  caseNavList,
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
  const activeIoTab = searchParams.get('tab') || (caseNavList && caseNavList[0]?.id ? caseNavList[0].id : 'analysis');
  const activeCaseItems = caseNavList || caseNavItems;
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
      style={{ transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
      className={[
        'hidden lg:flex flex-shrink-0 flex-col bg-surface border-r border-border text-text-primary relative z-20',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      {/* Squeeze / expand toggle button */}
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg hover:shadow-glow transition-all duration-200 border border-brand-primary"
      >
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
          'flex items-center border-b border-border py-5',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5',
        ].join(' ')}
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface-elevated border border-border p-0.5">
          <img src="/logo.svg" alt="Gujarat Police Logo" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-[9px] font-bold uppercase tracking-widest text-brand-primary mb-0.5">
              Gujarat Police
            </p>
            <p className="text-sm font-heading font-bold text-text-primary">Crime OS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-2 flex flex-col">
        <div className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center rounded-xl py-3 text-sm font-bold transition-all duration-200 group relative',
                  collapsed ? 'justify-center px-2' : 'gap-3 px-3.5',
                  isActive
                    ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20 nav-active-bar shadow-xs'
                    : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                ].join(' ')}
              >
                <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">{item.icon}</span>

                {!collapsed && <span>{item.label}</span>}

                {/* Floating tooltip shown on hover when collapsed */}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-xl bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary shadow-elevated opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 border border-border">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Case-level navigation — shown when inside a complaint page */}
        {isPolice && caseId && !collapsed && (
          <div className="mt-4 pt-4 border-t border-border flex-1 flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-3.5 mb-2.5">Case Navigation</p>
            <div className="space-y-1 flex-1">
              {activeCaseItems.map((tab) => {
                const isTabActive = activeIoTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={`${pathname}?tab=${tab.id}`}
                    className={[
                      'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all duration-200 group relative',
                      isTabActive
                        ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20 nav-active-bar shadow-xs'
                        : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                    ].join(' ')}
                  >
                    <span className="flex-shrink-0 opacity-80 transition-transform duration-200 group-hover:scale-110">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {isTabActive && <ChevronRight size={12} className="ml-auto text-brand-primary" />}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsed case nav — icon only */}
        {isPolice && caseId && collapsed && (
          <div className="mt-4 pt-4 border-t border-border space-y-0.5">
            {activeCaseItems.map((tab) => {
              const isTabActive = activeIoTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`${pathname}?tab=${tab.id}`}
                  className={[
                    'flex items-center justify-center rounded-xl p-2 transition-all duration-200 group relative',
                    isTabActive
                      ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                      : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                  ].join(' ')}
                >
                  <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">{tab.icon}</span>
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-xl bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary shadow-elevated opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 border border-border">
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

    </aside>
  );
}

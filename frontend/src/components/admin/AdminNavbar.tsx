'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Building2, Users, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES } from '@/lib/constants';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV_ITEMS = [
  {
    label: 'Police Stations & Officers',
    href: APP_ROUTES.ADMIN_DASHBOARD,
    icon: <Users size={16} />,
    matchPrefix: '/admin/dashboard',
  },
  {
    label: 'Department Registry',
    href: APP_ROUTES.ADMIN_DEPARTMENTS,
    icon: <Building2 size={16} />,
    matchPrefix: '/admin/departments',
  },
];

export default function AdminNavbar(): React.ReactElement {
  const { logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="bg-surface border-b border-border text-text-primary shadow-sm shrink-0 glass">
      {/* Top bar */}
      <div className="px-6 py-3 flex justify-between items-center border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center rounded-xl text-brand-primary">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[10px] tracking-wider font-extrabold font-heading text-brand-primary uppercase">
              Gujarat Police
            </p>
            <h1 className="text-base font-heading font-extrabold leading-tight text-text-primary">Crime OS Admin</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-semantic-critical transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="px-6 flex gap-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.matchPrefix);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-xs font-bold font-heading rounded-t-xl transition-all duration-200',
                isActive
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

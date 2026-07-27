'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Building2, Users, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES } from '@/lib/constants';
import { LanguageSelector } from '@/components/common/LanguageSelector';

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
    <header className="bg-[#1a237e] text-white shadow-md shrink-0">
      {/* Top bar */}
      <div className="px-6 py-3 flex justify-between items-center border-b border-[#283593]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-[#283593] flex items-center justify-center rounded-lg">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-[10px] tracking-wider font-semibold text-blue-300 uppercase">
              Gujarat Police
            </p>
            <h1 className="text-sm font-bold leading-tight">Crime OS Admin</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSelector />
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-blue-200 hover:text-white transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="px-6 flex gap-1 pt-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.matchPrefix);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
                isActive
                  ? 'bg-white text-[#1a237e]'
                  : 'text-blue-200 hover:text-white hover:bg-[#283593]',
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

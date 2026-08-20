'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { ArrowRight, FileText, Clock, Shield, ShieldCheck, Sparkles, Users } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  staggerClass?: string;
}

function StatCard({ label, value, icon, iconBg, iconColor, staggerClass = '' }: StatCardProps): React.ReactElement {
  return (
    <Card hover glass className={['flex items-center gap-4 animate-slide-up', staggerClass].join(' ')}>
      <div className={['flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-border/50 shadow-inner-glow', iconBg].join(' ')}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-3xl font-heading font-extrabold text-text-primary tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </Card>
  );
}

export default function PoliceDashboardPage(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    closed: 0,
    citizens: 0,
  });
  const [loading, setLoading] = useState(true);

  const isPolice = user?.role === 'SHO' || user?.role === 'IO' || user?.role === 'ADMIN';

  useEffect(() => {
    async function fetchStats() {
      try {
        const endpoint = isPolice ? API_ROUTES.COMPLAINTS.STATION_LIST : API_ROUTES.COMPLAINTS.LIST;
        const res = await apiClient.get(endpoint, {
          params: { page: 1, limit: 1000 },
        });
        const list = res.data.data?.complaints || res.data.data || [];
        const total = res.data.data?.total || list.length || 0;

        // Count unique citizens
        const uniqueCitizens = new Set(list.map((c: any) => c.citizen?._id || c.complainantUserId)).size;

        setStats({
          total,
          active: list.filter((c: any) => c.status === 'ASSIGNED_TO_IO' || c.status === 'SUBMITTED').length,
          closed: list.filter((c: any) => c.status === 'FIR_REGISTERED' || c.status === 'CLOSED').length,
          citizens: uniqueCitizens || list.length,
        });
      } catch (err) {
        console.warn('Stats load notice:', err);
        setStats({ total: 0, active: 0, closed: 0, citizens: 0 });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [user, isPolice]);

  const displayName = user?.officerName ?? user?.email ?? 'Officer';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-8 relative z-10 animate-fade-in">
      {/* Greeting Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-surface via-surface-elevated to-surface p-6 lg:p-8 shadow-card">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-brand-primary/5 blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary shadow-glow-sm flex-shrink-0">
              <ShieldCheck size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-accent">
                  {getGreeting()}
                </span>
                <Sparkles size={14} className="text-brand-accent" />
              </div>
              <h1 className="text-3xl font-heading font-extrabold text-text-primary tracking-tight mt-0.5">
                {displayName}
              </h1>
              <p className="text-sm text-text-secondary mt-0.5 font-medium">
                {user?.role === 'SHO' ? 'Station House Officer — Command & Oversight' : 'Investigation Officer — Active Cases'}
              </p>
            </div>
          </div>

          <button
            onClick={() => router.push(APP_ROUTES.POLICE_COMPLAINTS)}
            className="flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <span>View Station Queue</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Cases"
          value={stats.total}
          icon={<FileText size={22} />}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-500 dark:text-blue-400"
          staggerClass="stagger-1"
        />
        <StatCard
          label="Active Investigations"
          value={stats.active}
          icon={<Clock size={22} />}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-500 dark:text-amber-400"
          staggerClass="stagger-2"
        />
        <StatCard
          label="Closed Cases (FIR)"
          value={stats.closed}
          icon={<ShieldCheck size={22} />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500 dark:text-emerald-400"
          staggerClass="stagger-3"
        />
        <StatCard
          label="Citizens Assisted"
          value={stats.citizens}
          icon={<Users size={22} />}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-500 dark:text-rose-400"
          staggerClass="stagger-4"
        />
      </div>

      {/* Officer Info & Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card glass className="animate-slide-up stagger-5">
          <CardHeader title="Officer Information" subtitle="Active service profile" />
          <div className="mt-4 space-y-3">
            {[
              { label: 'Officer Name', value: displayName },
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Role', value: user?.role === 'SHO' ? 'Station House Officer' : 'Investigation Officer' },
              { label: 'Status', value: 'Active Duty' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-text-secondary font-medium">{label}</span>
                <span className="text-sm font-semibold text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card glass className="animate-slide-up stagger-6">
          <CardHeader title="Quick Actions" subtitle="Investigation shortcuts" />
          <div className="mt-4 space-y-3">
            <button
              onClick={() => router.push(APP_ROUTES.POLICE_COMPLAINTS)}
              className="w-full flex items-center justify-between text-left rounded-2xl p-4 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 transition-all duration-200 group"
            >
              <div>
                <p className="text-sm font-bold text-brand-primary">View Station Queue</p>
                <p className="text-xs text-text-secondary mt-0.5">Browse all complaints filed to your station</p>
              </div>
              <ArrowRight size={18} className="text-brand-primary group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </Card>
      </div>

      {/* Duty Reminder */}
      <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-5 glass animate-slide-up stagger-7">
        <div className="flex items-center gap-2">
          <Shield size={16} aria-hidden="true" />
          <p className="text-sm font-bold text-brand-primary font-heading uppercase tracking-wide">Duty & Compliance Protocol</p>
        </div>
        <p className="mt-2 text-xs text-text-secondary leading-relaxed">
          All case updates must be logged within 24 hours of any investigation activity.
          Ensure all sensitive case information is handled in accordance with Gujarat Police data policies.
        </p>
      </div>
    </div>
  );
}

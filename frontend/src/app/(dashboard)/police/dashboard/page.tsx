'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { Users, FileText, Clock, ShieldCheck } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

function StatCard({ label, value, icon, iconBg, iconColor }: StatCardProps): React.ReactElement {
  return (
    <Card className="flex items-center gap-4 border border-neutral-800">
      <div className={['flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-800/50', iconBg].join(' ')}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-sm text-text-secondary">{label}</p>
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

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await apiClient.get(API_ROUTES.COMPLAINTS.STATION_LIST, {
          params: { page: 1, limit: 1000 },
        });
        const list = res.data.data?.complaints || [];
        const total = res.data.data?.total || 0;
        
        // Count unique citizens
        const uniqueCitizens = new Set(list.map((c: any) => c.citizen?._id)).size;

        setStats({
          total,
          active: list.filter((c: any) => c.status === 'ASSIGNED_TO_IO').length,
          closed: list.filter((c: any) => c.status === 'FIR_REGISTERED').length,
          citizens: uniqueCitizens || list.length,
        });
      } catch (err) {
        console.error('Failed to load stats', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const displayName = user?.officerName ?? user?.email ?? 'Officer';

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-8 relative z-10">
      {/* Greeting */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-primary/10 border border-brand-primary/30 text-brand-primary">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{displayName}</h1>
          <p className="text-sm text-text-secondary capitalize">
            {user?.role === 'SHO' ? 'Station House Officer' : 'Investigation Officer'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Cases"
          value={stats.total}
          icon={<FileText size={22} />}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
        />
        <StatCard
          label="Active Investigations"
          value={stats.active}
          icon={<Clock size={22} />}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
        />
        <StatCard
          label="Closed Cases (FIR)"
          value={stats.closed}
          icon={<ShieldCheck size={22} />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Citizens Assisted"
          value={stats.citizens}
          icon={<Users size={22} />}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-400"
        />
      </div>

      {/* Officer Info */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border border-neutral-800">
          <CardHeader title="Officer Information" subtitle="Your service profile" />
          <div className="mt-4 space-y-3">
            {[
              { label: 'Officer Name', value: displayName },
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Role', value: user?.role === 'SHO' ? 'Station House Officer' : 'Investigation Officer' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between border-b border-neutral-800/50 pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-text-secondary">{label}</span>
                <span className="text-sm font-medium text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-neutral-800">
          <CardHeader title="Quick Actions" subtitle="Case management shortcuts" />
          <div className="mt-4 space-y-2">
            {[
              {
                label: 'View Station Queue',
                description: 'Browse all complaints filed to your station',
                color: 'text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/20',
                action: () => router.push(APP_ROUTES.POLICE_COMPLAINTS),
              },
            ].map(({ label, description, color, action }) => (
              <button
                key={label}
                onClick={action}
                className={['w-full text-left rounded-lg px-4 py-3 transition-colors', color].join(' ')}
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs opacity-75 mt-0.5 text-text-secondary">{description}</p>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Duty reminder */}
      <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-4">
        <p className="text-sm font-semibold text-brand-primary">🛡️ Duty Reminder</p>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed">
          All case updates must be logged within 24 hours of any investigation activity.
          Ensure all sensitive case information is handled in accordance with Gujarat Police data policies.
        </p>
      </div>
    </div>
  );
}

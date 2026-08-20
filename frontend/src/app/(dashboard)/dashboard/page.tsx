'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { AlertTriangle, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';
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
    <Card className="flex items-center gap-4">
      <div className={['flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl', iconBg].join(' ')}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
        <p className="text-sm text-neutral-500">{label}</p>
      </div>
    </Card>
  );
}

export default function CitizenDashboardPage(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({
    total: 0,
    investigating: 0,
    resolved: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await apiClient.get(API_ROUTES.COMPLAINTS.LIST);
        const list = res.data.data || [];
        setStats({
          total: list.length,
          investigating: list.filter((c: any) => c.status === 'ASSIGNED_TO_IO').length,
          resolved: list.filter((c: any) => c.status === 'FIR_REGISTERED').length,
          pending: list.filter((c: any) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW').length,
        });
      } catch (err) {
        console.error('Failed to load stats', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const firstName = user?.firstName ?? 'Citizen';

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Complaints"
          value={stats.total}
          icon={<FileText size={22} />}
          iconBg="bg-primary-50"
          iconColor="text-primary-700"
        />
        <StatCard
          label="Under Investigation"
          value={stats.investigating}
          icon={<Clock size={22} />}
          iconBg="bg-secondary-50"
          iconColor="text-secondary-700"
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<CheckCircle size={22} />}
          iconBg="bg-success-50"
          iconColor="text-success-600"
        />
        <StatCard
          label="Pending Action"
          value={stats.pending}
          icon={<AlertCircle size={22} />}
          iconBg="bg-danger-50"
          iconColor="text-danger-600"
        />
      </div>

      {/* Profile Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile Summary" subtitle="Your registered information" />
          <div className="mt-4 space-y-3">
            {[
              { label: 'Full Name', value: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() },
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Email Verified', value: user?.isEmailVerified ? 'Verified' : 'Not Verified' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-neutral-500">{label}</span>
                <span className="text-sm font-medium text-neutral-900">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Quick Actions" subtitle="Common portal services" />
          <div className="mt-4 space-y-2">
            {[
              {
                label: 'File a New Complaint',
                description: 'Report a crime or incident online',
                color: 'text-primary-700 bg-primary-50 hover:bg-primary-100',
                action: () => router.push(APP_ROUTES.FILE_COMPLAINT),
              },
              {
                label: 'Track Complaint Status',
                description: 'Check updates on your existing complaints',
                color: 'text-success-700 bg-success-50 hover:bg-success-100',
                action: () => router.push(APP_ROUTES.MY_COMPLAINTS),
              },
            ].map(({ label, description, color, action }) => (
              <button
                key={label}
                onClick={action}
                className={['w-full text-left rounded-lg px-4 py-3 transition-colors', color].join(' ')}
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs opacity-75 mt-0.5">{description}</p>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Notice */}
      <div className="rounded-lg border border-secondary-200 bg-secondary-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-secondary-800"><AlertTriangle size={16} /> Important Notice</p>
        <p className="mt-1 text-xs text-secondary-700">
          For emergencies, please call <strong>100</strong> (Police Helpline) or <strong>112</strong> (Emergency Services).
          This portal is for non-emergency complaint filing only.
        </p>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { FileText, Eye, Search, Filter, AlertCircle, ChevronLeft, ChevronRight, Calendar, User } from 'lucide-react';

interface Citizen {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface AssignedIO {
  officerName: string;
  badgeNumber: string;
}

interface Complaint {
  _id: string;
  complaintNumber: string;
  status: string;
  category: string;
  incidentDate: string;
  shortDescription: string;
  citizen: Citizen;
  assignedIO?: AssignedIO;
  assignedIOs?: AssignedIO[];
  hasUnreadDepartmentResponse?: boolean;
  createdAt: string;
}

export default function PoliceComplaintQueuePage(): React.ReactElement {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  
  const { toasts, showToast, removeToast } = useToast();
  const prevUnreadRef = useRef<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);

  // Polling for new department notifications
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStationComplaints(true);
    }, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, [search, status, page]);

  useEffect(() => {
    fetchStationComplaints();
  }, [status, page]);

  const fetchStationComplaints = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(API_ROUTES.COMPLAINTS.STATION_LIST, {
        params: {
          search: search || undefined,
          status: status || undefined,
          page,
          limit,
        },
      });
      const data = res.data.data;
      
      setComplaints(data.complaints || []);
      
      // Check for new unread notifications
      const currentUnread = new Set<string>();
      (data.complaints || []).forEach((c: Complaint) => {
        if (c.hasUnreadDepartmentResponse) {
          currentUnread.add(c._id);
          if (!prevUnreadRef.current.has(c._id)) {
            showToast(`New department response received for Complaint ${c.complaintNumber}`, 'success');
          }
        }
      });
      prevUnreadRef.current = currentUnread;

      setTotalPages(Math.ceil((data.total || 0) / limit) || 1);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch station complaints.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStationComplaints();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20">Submitted</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20">Under Review</span>;
      case 'ASSIGNED_TO_IO':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">Assigned to IO</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20">Rejected</span>;
      case 'FIR_REGISTERED':
        return <span className="inline-flex whitespace-nowrap px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">FIR Registered</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-badge-bg text-text-secondary border border-border">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-heading font-extrabold text-text-primary tracking-tight">Station Complaint Queue</h1>
        <p className="text-sm text-text-secondary mt-1 font-medium">Review e-applications, assign IOs, and process FIR registrations</p>
      </div>

      {/* Filter and Search Panel */}
      <Card glass className="border-border">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Search</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Complaint No, short description, FIR..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input-border bg-input-bg text-text-primary focus:ring-2 focus:ring-ring/40 focus:border-brand-primary outline-none transition-all duration-200 text-sm placeholder:text-text-muted"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            </div>
          </div>

          <div className="w-full md:w-56">
            <Select
              label="Status Filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'SUBMITTED', label: 'Submitted' },
                { value: 'ASSIGNED_TO_IO', label: 'Assigned to IO' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'FIR_REGISTERED', label: 'FIR Registered' },
              ]}
            />
          </div>

          <Button type="submit" className="w-full md:w-auto h-[42px] px-6 font-bold shadow-sm">
            Apply Filters
          </Button>
        </form>
      </Card>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-semantic-critical/10 border border-semantic-critical/30 text-semantic-critical rounded-2xl text-sm font-medium animate-slide-up">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Queue Table/List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader />
        </div>
      ) : complaints.length === 0 ? (
        <Card glass className="flex flex-col items-center justify-center text-center py-12 border-border">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated text-text-muted mb-4 border border-border">
            <FileText size={28} />
          </div>
          <h3 className="text-lg font-heading font-bold text-text-primary">No complaints found</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-sm">
            There are currently no complaints matching the search criteria or status.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-card glass">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] table-fixed text-left border-collapse">
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[14%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[13%]" />
                  <col className="w-[16%]" />
                  <col className="w-[150px]" />
                </colgroup>
                <thead>
                  <tr className="bg-surface-elevated/60 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider">
                    <th className="p-4">Description</th>
                    <th className="p-4">Complainant</th>
                    <th className="p-4 whitespace-nowrap">Incident Date</th>
                    <th className="p-4 whitespace-nowrap">Category</th>
                    <th className="p-4 whitespace-nowrap">Status</th>
                    <th className="p-4 whitespace-nowrap">Assigned IO</th>
                    <th className="p-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {complaints.map((c) => (
                    <tr key={c._id} className="hover:bg-surface-elevated/50 transition-colors duration-150">
                      <td className="p-4 text-text-primary"><p className="line-clamp-2 text-xs" title={c.shortDescription || "No description provided."}>{c.shortDescription || "No description provided."}</p></td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text-primary line-clamp-1" title={`${c.citizen.firstName} ${c.citizen.lastName}`}>
                            {c.citizen.firstName} {c.citizen.lastName}
                          </span>
                          <span className="text-xs text-text-secondary font-mono line-clamp-1">{c.citizen.phone}</span>
                        </div>
                      </td>
                      <td className="p-4 text-text-secondary font-medium">
                        {new Date(c.incidentDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="p-4 uppercase text-xs font-bold text-text-secondary tracking-wide whitespace-nowrap">
                        {c.category ? c.category.replace('_', ' ') : 'UNCATEGORIZED'}
                      </td>
                      <td className="p-4 whitespace-nowrap">{getStatusBadge(c.status)}</td>
                      <td className="p-4 whitespace-nowrap">
                        {c.assignedIOs && c.assignedIOs.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {c.assignedIOs.map((io, idx) => (
                              <div key={idx} className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                                <span className="min-w-0 max-w-[150px] truncate text-text-primary font-semibold text-xs" title={io.officerName}>{io.officerName}</span>
                                <span className="text-[10px] text-text-secondary font-mono whitespace-nowrap">({io.badgeNumber})</span>
                              </div>
                            ))}
                          </div>
                        ) : c.assignedIO ? (
                          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                            <span className="min-w-0 max-w-[150px] truncate text-text-primary font-semibold" title={c.assignedIO.officerName}>{c.assignedIO.officerName}</span>
                            <span className="text-xs text-text-secondary font-mono whitespace-nowrap">({c.assignedIO.badgeNumber})</span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted italic">Unassigned</span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <Link href={APP_ROUTES.POLICE_COMPLAINT_DETAIL(c._id)}>
                          <div className="relative inline-block">
                            {c.hasUnreadDepartmentResponse && (
                              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-info opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-semantic-info border-2 border-surface"></span>
                              </span>
                            )}
                            <Button variant="secondary" size="sm" leftIcon={<Eye size={14} />} className="w-[132px] whitespace-nowrap">
                              Review Case
                            </Button>
                          </div>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center bg-surface border border-border rounded-2xl p-4 shadow-card glass">
              <span className="text-xs font-medium text-text-secondary">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  leftIcon={<ChevronLeft size={16} />}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  leftIcon={<ChevronRight size={16} />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}




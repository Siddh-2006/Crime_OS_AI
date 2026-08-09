'use client';

import React, { useEffect, useState } from 'react';
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
  createdAt: string;
}

export default function PoliceComplaintQueuePage(): React.ReactElement {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);

  useEffect(() => {
    fetchStationComplaints();
  }, [status, page]);

  const fetchStationComplaints = async () => {
    setLoading(true);
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
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-900/20 text-blue-400 border border-blue-800">Submitted</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-900/20 text-orange-400 border border-orange-800">Under Review</span>;
      case 'ASSIGNED_TO_IO':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-900/20 text-yellow-400 border border-yellow-800">Assigned to IO</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-900/20 text-red-400 border border-red-800">Rejected</span>;
      case 'FIR_REGISTERED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-900/20 text-green-400 border border-green-800">FIR Registered</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-neutral-800 text-text-secondary">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Station Complaint Queue</h1>
        <p className="text-sm text-text-secondary mt-1">Review e-applications and process FIR registrations</p>
      </div>

      {/* Filter and Search Panel */}
      <Card className="bg-surface border-neutral-800">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1.5">Search</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Complaint No, short description, FIR..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-800 bg-[#0a0f1c] text-text-primary focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all text-sm placeholder:text-neutral-500"
              />
              <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
            </div>
          </div>

          <div className="w-full md:w-48">
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

          <Button type="submit" className="w-full md:w-auto h-[42px] px-6">
            Apply Filters
          </Button>
        </form>
      </Card>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-900/20 border border-red-800 text-red-400 rounded-lg text-sm">
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
        <Card className="flex flex-col items-center justify-center text-center py-12 bg-surface border-neutral-800">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 mb-4">
            <FileText size={28} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">No complaints found</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-sm">
            There are currently no complaints matching the search criteria or status.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-800/50 border-b border-neutral-800 text-xs font-bold text-text-secondary uppercase">
                    <th className="p-4">Complaint Number</th>
                    <th className="p-4">Complainant</th>
                    <th className="p-4">Incident Date</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Assigned IO</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 text-sm">
                  {complaints.map((c) => (
                    <tr key={c._id} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="p-4 font-semibold text-text-primary">{c.complaintNumber}</td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-text-primary">
                            {c.citizen.firstName} {c.citizen.lastName}
                          </span>
                          <span className="text-xs text-text-secondary">{c.citizen.phone}</span>
                        </div>
                      </td>
                      <td className="p-4 text-text-secondary">
                        {new Date(c.incidentDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="p-4 uppercase text-xs font-semibold text-text-secondary">
                        {c.category ? c.category.replace('_', ' ') : 'UNCATEGORIZED'}
                      </td>
                      <td className="p-4">{getStatusBadge(c.status)}</td>
                      <td className="p-4">
                        {c.assignedIO ? (
                          <div className="flex flex-col">
                            <span className="text-text-primary font-medium">{c.assignedIO.officerName}</span>
                            <span className="text-xs text-text-secondary">{c.assignedIO.badgeNumber}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary italic">Unassigned</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <Link href={APP_ROUTES.POLICE_COMPLAINT_DETAIL(c._id)}>
                          <Button variant="secondary" size="sm" leftIcon={<Eye size={14} />}>
                            Review Case
                          </Button>
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
            <div className="flex justify-between items-center bg-surface border border-neutral-800 rounded-xl p-4 shadow-sm">
              <span className="text-xs text-text-secondary">
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
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { FileText, Plus, Eye, Calendar, MapPin, AlertCircle } from 'lucide-react';

interface Complaint {
  _id: string;
  complaintNumber: string;
  status: string;
  category: string;
  incidentDate: string;
  incidentPlace: string;
  shortDescription: string;
  createdAt: string;
}

export default function MyComplaintsPage(): React.ReactElement {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchComplaints() {
      try {
        const res = await apiClient.get(API_ROUTES.COMPLAINTS.LIST);
        setComplaints(res.data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch complaints.');
      } finally {
        setLoading(false);
      }
    }
    fetchComplaints();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">Submitted</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-50 text-orange-700 border border-orange-200">Under Review</span>;
      case 'ASSIGNED_TO_IO':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200">Assigned to IO</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-50 text-red-700 border border-red-200">Rejected</span>;
      case 'FIR_REGISTERED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-50 text-green-700 border border-green-200">FIR Registered</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-neutral-100 text-neutral-800">{status}</span>;
    }
  };

  if (loading) return <Loader fullPage />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">My Complaints</h1>
          <p className="text-sm text-neutral-500 mt-1">Track and manage your submitted e-applications</p>
        </div>
        <Link href={APP_ROUTES.FILE_COMPLAINT}>
          <Button leftIcon={<Plus size={18} />}>File New Complaint</Button>
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg text-sm">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Complaints Grid/List */}
      {complaints.length === 0 ? (
        <Card className="flex flex-col items-center justify-center text-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-4">
            <FileText size={28} />
          </div>
          <h3 className="text-lg font-semibold text-neutral-800">No complaints filed yet</h3>
          <p className="text-sm text-neutral-500 mt-1 max-w-sm">
            If you need to report an incident or crime, you can file a new secure e-application directly.
          </p>
          <Link href={APP_ROUTES.FILE_COMPLAINT} className="mt-5">
            <Button variant="secondary" leftIcon={<Plus size={16} />}>File Your First Complaint</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {complaints.map((complaint) => (
            <Card key={complaint._id} className="hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-neutral-800 text-sm md:text-base">
                      {complaint.complaintNumber}
                    </span>
                    {getStatusBadge(complaint.status)}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
                      {complaint.category ? complaint.category.replace('_', ' ') : 'UNCATEGORIZED'}
                    </span>
                  </div>

                  <p className="text-sm text-neutral-700 font-medium line-clamp-1">
                    {complaint.shortDescription}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={13} />
                      Incident Date: {new Date(complaint.incidentDate).toLocaleDateString('en-IN')}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin size={13} />
                      {complaint.incidentPlace}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                  <Link href={APP_ROUTES.COMPLAINT_DETAIL(complaint._id)}>
                    <Button variant="ghost" size="sm" leftIcon={<Eye size={15} />}>
                      View Case
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

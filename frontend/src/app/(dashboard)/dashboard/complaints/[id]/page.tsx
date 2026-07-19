'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { ArrowLeft, Calendar, MapPin, FileText, CheckCircle, Clock, AlertTriangle, FileDown, Download, ExternalLink } from 'lucide-react';

interface TimelineEvent {
  user: string;
  timestamp: string;
  description: string;
}

interface Evidence {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  mimeType: string;
  originalFilename: string;
  extension: string;
  size: number;
  aiMetadata?: {
    ocrText?: string;
    speechTranscript?: string;
    imageTags?: string[];
    detectedObjects?: string[];
    faces?: string[];
    embeddings?: number[];
    virusScanResult?: string;
    aiSummary?: string;
    processingErrors?: string[];
    classification?: string;
    classificationConfidence?: number;
    width?: number;
    height?: number;
    fileType?: string;
    exif?: Record<string, any>;
    gps?: Record<string, any>;
  };
}

interface Complaint {
  _id: string;
  complaintNumber: string;
  status: string;
  category: string;
  incidentDate: string;
  incidentTime?: string;
  incidentPlace: string;
  shortDescription: string;
  detailedDescription: string;
  policeStation: {
    name: string;
    code: string;
    city: string;
    district: string;
  };
  evidence: Evidence[];
  timeline: TimelineEvent[];
  firNumber?: string;
  firRegisteredAt?: string;
  firPdfUrl?: string;
  rejectionReason?: string;
  createdAt: string;
}

export default function CitizenComplaintDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchComplaint() {
      try {
        const id = params.id as string;
        const res = await apiClient.get(API_ROUTES.COMPLAINTS.DETAIL(id));
        setComplaint(res.data.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch complaint details.');
      } finally {
        setLoading(false);
      }
    }
    fetchComplaint();
  }, [params.id]);

  if (loading) return <Loader fullPage />;
  if (error || !complaint) {
    return (
      <Card className="max-w-md mx-auto text-center py-12 space-y-4">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="text-lg font-bold text-neutral-800">Error Loading Case</h3>
        <p className="text-sm text-neutral-500">{error || 'Complaint not found.'}</p>
        <Button onClick={() => router.push(APP_ROUTES.MY_COMPLAINTS)}>Go Back</Button>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200">Submitted</span>;
      case 'UNDER_REVIEW':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 border border-orange-200">Under Review</span>;
      case 'ASSIGNED_TO_IO':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-900 border border-yellow-200">Assigned to IO</span>;
      case 'REJECTED':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">Rejected</span>;
      case 'FIR_REGISTERED':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-200">FIR Registered</span>;
      default:
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-neutral-100 text-neutral-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push(APP_ROUTES.MY_COMPLAINTS)}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to My Complaints
      </button>

      {/* Case Header Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-neutral-900">{complaint.complaintNumber}</h1>
            {getStatusBadge(complaint.status)}
          </div>
          <p className="text-sm text-neutral-500">
            Filed on {new Date(complaint.createdAt).toLocaleDateString('en-IN')} • Police Station: {complaint.policeStation.name}
          </p>
        </div>

        {complaint.status === 'FIR_REGISTERED' && complaint.firPdfUrl && (
          <div className="flex gap-2">
            <a href={complaint.firPdfUrl} target="_blank" rel="noopener noreferrer">
              <Button leftIcon={<ExternalLink size={15} />} variant="ghost" size="sm">
                View Digital FIR
              </Button>
            </a>
            <a href={complaint.firPdfUrl} download>
              <Button leftIcon={<Download size={15} />} size="sm">
                Download PDF
              </Button>
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Middle: Case Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Incident Info */}
          <Card>
            <CardHeader title="Incident Specifications" />
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-neutral-100 pb-4">
              <div>
                <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Date & Time</p>
                <p className="text-sm font-medium text-neutral-800 mt-1">
                  {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Occurrence Location</p>
                <p className="text-sm font-medium text-neutral-800 mt-1">{complaint.incidentPlace}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Category</p>
                <p className="text-sm font-medium text-neutral-800 mt-1 uppercase">
                  {complaint.category ? complaint.category.replace('_', ' ') : 'UNCATEGORIZED'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Summary of Offence</p>
                <p className="text-sm font-semibold text-neutral-800 mt-1">{complaint.shortDescription}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Detailed Description</p>
                <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line leading-relaxed">
                  {complaint.detailedDescription}
                </p>
              </div>
            </div>
          </Card>

          {/* Evidence Attachments */}
          <Card>
            <CardHeader title="Supporting Evidence / Attachments" />
            {complaint.evidence.length === 0 ? (
              <p className="text-sm text-neutral-500 mt-2">No evidence documents or media attached to this application.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {complaint.evidence.map((file) => (
                  <div key={file.publicId} className="flex flex-col p-4 border border-neutral-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-8 w-8 text-primary-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-800 truncate" title={file.originalFilename}>
                            {file.originalFilename}
                          </p>
                          <p className="text-xs text-neutral-400">
                            {(file.size / 1024 / 1024).toFixed(2)} MB • {file.extension.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <a
                        href={file.secureUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 hover:text-neutral-700 transition-colors"
                        title="Download Attachment"
                      >
                        <Download size={18} />
                      </a>
                    </div>

                    {/* AI Processing and Classifications */}
                    {file.aiMetadata && (
                      <div className="pt-3 border-t border-neutral-100 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {file.aiMetadata.classification && file.aiMetadata.classification !== 'Unknown' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              📊 {file.aiMetadata.classification} ({Math.round((file.aiMetadata.classificationConfidence || 0) * 100)}%)
                            </span>
                          )}
                          {file.aiMetadata.imageTags?.map((tag: string) => (
                            <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50/80 text-emerald-700 border border-emerald-100/50">
                              🏷️ {tag}
                            </span>
                          ))}
                        </div>

                        {file.aiMetadata.ocrText && (
                          <details className="text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded-lg border border-neutral-100 cursor-pointer">
                            <summary className="font-semibold text-neutral-700 hover:text-neutral-900 select-none">
                              🔍 Extracted OCR Text
                            </summary>
                            <p className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] bg-white p-2 rounded border border-neutral-100 max-h-32 overflow-y-auto leading-relaxed">
                              {file.aiMetadata.ocrText}
                            </p>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Rejection Alert */}
          {complaint.status === 'REJECTED' && (
            <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-xl space-y-2">
              <p className="font-bold text-sm">🚫 Complaint Rejection Notice</p>
              <p className="text-sm">{complaint.rejectionReason}</p>
            </div>
          )}
        </div>

        {/* Right Sidebar: Timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Application Status Timeline" />
            <div className="mt-6 relative pl-6 border-l-2 border-neutral-200 space-y-6">
              {complaint.timeline.map((event, idx) => (
                <div key={idx} className="relative">
                  {/* Dot */}
                  <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-primary-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-700" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-400 font-semibold">
                      {new Date(event.timestamp).toLocaleString('en-IN')}
                    </p>
                    <p className="text-sm font-bold text-neutral-800">{event.user}</p>
                    <p className="text-xs text-neutral-600 leading-relaxed">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

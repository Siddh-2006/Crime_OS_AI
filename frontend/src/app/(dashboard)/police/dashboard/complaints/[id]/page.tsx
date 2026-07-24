'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { InvestigationWorkspace } from './components/InvestigationWorkspace';
import ChargeSheetModal from './ChargeSheetModal';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  FileText,
  User,
  ShieldCheck,
  FileDown,
  X,
  AlertTriangle,
  History,
  Lock,
  Edit3,
  FileSignature,
  Save,
  Brain,
  Clock,
  AlertCircle,
  Link2,
  Users,
  Zap,
  Search,
  CheckCircle2
} from 'lucide-react';

interface HistoryEntry {
  version: number;
  editedBy: string;
  editorId: string;
  content: string;
  timestamp: string;
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

interface TimelineEvent {
  user: string;
  timestamp: string;
  description: string;
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
    _id: string;
    name: string;
    code: string;
    city: string;
    district: string;
    state: string;
  };
  citizen: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  assignedIO?: {
    _id: string;
    officerName: string;
    badgeNumber: string;
  };
  assignedSHO?: {
    _id: string;
    officerName: string;
    badgeNumber: string;
  };
  descriptionHistory: HistoryEntry[];
  crimeSummaryHistory: HistoryEntry[];
  legalSectionsHistory: HistoryEntry[];
  investigationNotesHistory: HistoryEntry[];
  evidence: Evidence[];
  timeline: TimelineEvent[];
  firNumber?: string;
  firRegisteredAt?: string;
  firPdfUrl?: string;
  rejectionReason?: string;
  createdAt: string;
  currentVersionNumber: number;
  complaintIntelligence?: {
    crimeType?: string;
    priority?: string;
    confidence?: number;
    summary?: string;
    missingInformation?: string[];
    recommendations?: string[];
    m3Entities?: Array<{ type: string; value: string; context?: string }>;
    m3Events?: Array<{ time?: string; description: string; sourceRef?: string }>;
    [key: string]: any;
  };
}

interface IOOfficer {
  _id: string;
  officerName: string;
  badgeNumber: string;
  aiRecommendation?: {
    score: number;
    matchedCases: number;
    averageSimilarity: number;
    reasons: string[];
  } | null;
}

import { CaseUnderstandingView, CaseUnderstandingData } from '@/components/case-understanding/CaseUnderstandingView';

export default function PoliceComplaintDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth(); // Logged in officer info

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [caseUnderstanding, setCaseUnderstanding] = useState<CaseUnderstandingData | null>(null);
  const [ios, setIos] = useState<IOOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [recommendedIos, setRecommendedIos] = useState<IOOfficer[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // FIR Registration confirmation modal
  const [firConfirmModalOpen, setFirConfirmModalOpen] = useState(false);

  // FIR Preview modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // IO Edit Fields
  const [editMode, setEditMode] = useState(false);
  const [detailedDescription, setDetailedDescription] = useState('');
  const [crimeSummary, setCrimeSummary] = useState('');
  const [legalSections, setLegalSections] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');
  
  // Charge Sheet modal
  const [chargeSheetModalOpen, setChargeSheetModalOpen] = useState(false);

  // Tab state for the read-only review view (IO=SUBMITTED / SHO)
  const [activeTab, setActiveTab] = useState<'original' | 'ai' | 'audit'>('original');
  const [aiSubTab, setAiSubTab] = useState<'overview' | 'details' | 'entities' | 'evidence' | 'conflicts' | 'gaps' | 'timeline'>('overview');

  // AI analysis snapshot fetched from backend
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const fetchComplaint = async () => {
    try {
      const id = params.id as string;
      const res = await apiClient.get(API_ROUTES.COMPLAINTS.DETAIL(id));
      const c = res.data.data;
      setComplaint(c);

      // Populate IO edit fields
      setDetailedDescription(c.detailedDescription);
      setCrimeSummary(c.crimeSummaryHistory?.[c.crimeSummaryHistory.length - 1]?.content || '');
      // Fetch Case Understanding JSON
      try {
        const cuRes = await apiClient.get(API_ROUTES.CASE_UNDERSTANDING.DETAIL(id));
        if (cuRes.data?.data) {
          setCaseUnderstanding(cuRes.data.data);
        }
      } catch {
        // Non-blocking if case understanding not yet processed
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch complaint details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSnapshot = async () => {
    const id = params.id as string;
    setSnapshotLoading(true);
    try {
      const res = await apiClient.get(`/cases/${id}/analysis/latest`);
      setSnapshot(res.data?.data ?? null);
    } catch {
      setSnapshot(null);
    } finally {
      setSnapshotLoading(false);
    }
  };

  const fetchIOs = async () => {
    try {
      const res = await apiClient.get(API_ROUTES.COMPLAINTS.IO_LIST);
      console.debug('fetchIOs response', res.data);
      setIos(res.data.data || []);
    } catch (err) {
      console.error('Failed to load IOs', err);
    }
  };

  const fetchRecommendations = async () => {
    setRecLoading(true);
    try {
      const id = params.id as string;
      const res = await apiClient.get(API_ROUTES.COMPLAINTS.IO_LIST, {
        params: { complaintId: id }
      });
      console.debug('fetchRecommendations response', res.data);
      setRecommendedIos(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch recommendations', err);
    } finally {
      setRecLoading(false);
    }
  };

  const handleCloseCase = async () => {
    if (!confirm('Are you sure you want to close this case? It will be permanently marked as CLOSED and indexed in the AI vector store. A Charge Sheet will also be automatically generated (this may take some time).')) return;
    setActionLoading(true);
    try {
      const id = params.id as string;
      await apiClient.patch(`/complaints/${id}/close`);
      await fetchComplaint();
    } catch (err: any) {
      const msg: string = err.response?.data?.message || err.message || 'Failed to close case.';
      if (msg.includes('NO_ACCUSED')) {
        alert('⚠️ Cannot close investigation: At least one suspect must be promoted to Accused in the Case Participants tab before closing.');
      } else {
        alert(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaint();
    fetchSnapshot();
    if (user?.role === 'SHO') {
      fetchIOs();
    }
  }, [params.id, user]);

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    setActionLoading(true);
    try {
      const id = params.id as string;
      await apiClient.patch(API_ROUTES.COMPLAINTS.REJECT(id), { rejectionReason });
      setRejectModalOpen(false);
      setRejectionReason('');
      await fetchComplaint();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject complaint.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdits = async () => {
    setActionLoading(true);
    try {
      const id = params.id as string;
      await apiClient.patch(API_ROUTES.COMPLAINTS.UPDATE(id), {
        detailedDescription,
        crimeSummary,
        legalSections,
        investigationNotes,
      });
      setEditMode(false);
      await fetchComplaint();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save updates.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterFir = async () => {
    setActionLoading(true);
    try {
      const id = params.id as string;
      await apiClient.patch(API_ROUTES.COMPLAINTS.REGISTER_FIR(id));
      setFirConfirmModalOpen(false);
      await fetchComplaint();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to register FIR.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loader fullPage />;
  if (error || !complaint) {
    return (
      <Card className="max-w-md mx-auto text-center py-12 space-y-4">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="text-lg font-bold text-neutral-800">Error Loading Case</h3>
        <p className="text-sm text-neutral-500">{error || 'Complaint not found.'}</p>
        <Button onClick={() => router.push(APP_ROUTES.POLICE_COMPLAINTS)}>Go Back</Button>
      </Card>
    );
  }

  const isAssignedIO = user?.role === 'IO' && complaint.assignedIO?._id === user?._id;
  const isSHO = user?.role === 'SHO';
  const isLocked = complaint.status === 'FIR_REGISTERED' || complaint.status === 'CLOSED';
  const isClosed = complaint.status === 'CLOSED';

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <button
          onClick={() => router.push(APP_ROUTES.POLICE_COMPLAINTS)}
          className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Complaint Queue
        </button>
        {isLocked && (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold">
            <Lock size={14} />
            <span>FIR REGISTERED (CASE LOCKED)</span>
          </div>
        )}
      </div>

      {/* Main Info Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 overflow-hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-bold text-neutral-900 truncate">{complaint.complaintNumber}</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
              {complaint.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1 truncate">
            Complainant: {complaint.citizen.firstName} {complaint.citizen.lastName} | Phone: {complaint.citizen.phone}
          </p>
        </div>

        {/* Action Controls for SHO */}
        {isSHO && complaint.status === 'SUBMITTED' && (
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <Button
              size="sm"
              onClick={() => {
                setAssignModalOpen(true);
                fetchRecommendations();
              }}
              disabled={actionLoading}
            >
              Approve & Assign IO
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setRejectModalOpen(true)}
              disabled={actionLoading}
            >
              Reject Case
            </Button>
          </div>
        )}

        {/* Action Controls for assigned IO */}
        {isAssignedIO && !isLocked && (
          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
            <Button variant="secondary" size="sm" leftIcon={<FileText size={15} />} onClick={() => setPreviewModalOpen(true)}>
              Preview FIR
            </Button>
            <Button size="sm" leftIcon={<FileSignature size={15} />} onClick={() => setFirConfirmModalOpen(true)}>
              Register FIR
            </Button>
          </div>
        )}

        {/* Download FIR + Close Case button if registered */}
        {(isLocked || isClosed) && complaint.firPdfUrl && (
          <a href={complaint.firPdfUrl} target="_blank" rel="noopener noreferrer" className="self-end md:self-center">
            <Button leftIcon={<FileDown size={16} />}>
              Download Registered FIR
            </Button>
          </a>
        )}
        {complaint.status === 'FIR_REGISTERED' && (isAssignedIO || isSHO) && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleCloseCase}
            isLoading={actionLoading}
          >
            Close Investigation
          </Button>
        )}
        {complaint.status === 'CLOSED' && (isAssignedIO || isSHO) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setChargeSheetModalOpen(true)}
            leftIcon={<FileText size={16} />}
          >
            View Charge Sheet
          </Button>
        )}
      </div>

      {/* Single Case Understanding Engine Component */}
      {caseUnderstanding && (
        <div className="mb-6">
          <CaseUnderstandingView data={caseUnderstanding} />
        </div>
      )}

      {(!isAssignedIO || complaint.status === 'SUBMITTED') ? (
        <div>
          {/* ── Segmented Top-Level Tabs ── */}
          <div className="inline-flex items-center gap-1 bg-neutral-100 p-1 rounded-xl mb-6">
            {([
              { key: 'original', label: '📄 Original Complaint' },
              { key: 'ai', label: '🧠 AI Complaint Intelligence' },
              { key: 'audit', label: '🕘 Case Status & Timeline' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === key
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {label}
                {key === 'ai' && (
                  <span className={`ml-2 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    complaint.complaintIntelligence || snapshot
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {complaint.complaintIntelligence || snapshot ? 'READY' : 'PENDING'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── TAB: ORIGINAL COMPLAINT ── */}
          {activeTab === 'original' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Details & Edit Fields */}
              <div className="lg:col-span-2 space-y-6">
                {/* Incident Details Card */}
                <Card>
                  <CardHeader title="Incident Specifications" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 border-b border-neutral-100 pb-4">
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

                  {/* Read-Only or Edit Mode Form */}
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Brief Summary</p>
                      <p className="text-sm font-bold text-neutral-800 mt-1">{complaint.shortDescription}</p>
                    </div>

                    {!editMode ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Detailed Description (Current)</p>
                          <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                            {complaint.detailedDescription}
                          </p>
                        </div>
                        {(complaint.status === 'ASSIGNED_TO_IO' || isLocked) && (
                          <>
                            <div>
                              <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Crime Summary (for FIR)</p>
                              <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                                {crimeSummary || <span className="text-neutral-400 italic">No summary entered yet.</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Legal Sections (Applicable IPC/BNS)</p>
                              <p className="text-sm font-semibold text-neutral-800 mt-1 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                                {legalSections || <span className="text-neutral-400 italic">No legal sections assigned yet.</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Investigation Case Notes</p>
                              <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                                {investigationNotes || <span className="text-neutral-400 italic">No case notes recorded yet.</span>}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Detailed Description *</label>
                          <textarea
                            value={detailedDescription}
                            onChange={(e) => setDetailedDescription(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Crime Summary (for FIR) *</label>
                          <textarea
                            value={crimeSummary}
                            onChange={(e) => setCrimeSummary(e.target.value)}
                            placeholder="Summarize the core offence details for the FIR registry..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Applicable Legal Sections *</label>
                          <input
                            type="text"
                            value={legalSections}
                            onChange={(e) => setLegalSections(e.target.value)}
                            placeholder="e.g. Section 379, 411 IPC / BNS"
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Investigation Case Notes</label>
                          <textarea
                            value={investigationNotes}
                            onChange={(e) => setInvestigationNotes(e.target.value)}
                            placeholder="Record details of evidence verified, witness statements, etc."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Evidence Attachments */}
                <Card>
                  <CardHeader title="Attached Case Evidence" />
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
                              <FileDown size={18} />
                            </a>
                          </div>

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
                                  <summary className="font-semibold text-neutral-700 hover:text-neutral-900 select-none">🔍 Extracted OCR Text</summary>
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

                {/* Version History */}
                {complaint.descriptionHistory.length > 1 && (
                  <Card>
                    <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 mb-4">
                      <History className="h-5 w-5 text-neutral-400" />
                      <h3 className="text-sm font-bold text-neutral-800">Version History (Editable Fields Log)</h3>
                    </div>
                    <div className="space-y-3 max-h-60 overflow-y-auto divide-y divide-neutral-100">
                      {complaint.descriptionHistory.map((h, i) => (
                        <div key={i} className="pt-3 first:pt-0 text-xs">
                          <div className="flex justify-between font-semibold text-neutral-700 mb-1">
                            <span>Version {h.version} • Edited by {h.editedBy}</span>
                            <span>{new Date(h.timestamp).toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-neutral-600 italic whitespace-pre-wrap bg-neutral-50 p-2 rounded border border-neutral-100">
                            {h.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>

              {/* Right Column: Complainant Card */}
              <div className="space-y-6">
                <Card>
                  <CardHeader title="Complainant" />
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-bold text-neutral-800">{complaint.citizen.firstName} {complaint.citizen.lastName}</p>
                    <p className="text-xs text-neutral-500">{complaint.citizen.phone}</p>
                    <p className="text-xs text-neutral-500">{complaint.citizen.email}</p>
                  </div>
                </Card>
                {complaint.assignedIO && (
                  <Card>
                    <CardHeader title="Assigned IO" />
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-bold text-neutral-800">{complaint.assignedIO.officerName}</p>
                      <p className="text-xs text-neutral-500">Badge: {complaint.assignedIO.badgeNumber}</p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: AI COMPLAINT INTELLIGENCE ── */}
          {activeTab === 'ai' && (() => {
            const ci = complaint.complaintIntelligence as any;
            const snap = snapshot as any;
            const hasAI = !!(ci || snap);

            if (snapshotLoading) {
              return (
                <div className="flex items-center justify-center py-20">
                  <Loader />
                </div>
              );
            }

            if (!hasAI) {
              return (
                <Card>
                  <div className="text-center py-12 space-y-3">
                    <div className="text-4xl">🕓</div>
                    <p className="text-base font-bold text-neutral-700">Not yet analyzed</p>
                    <p className="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed">
                      This complaint hasn&apos;t been processed by the Complaint Intelligence Engine yet — it is still awaiting SHO assignment. Once assigned, AI-generated crime classification, entities, and a source-linked timeline will appear here automatically.
                    </p>
                  </div>
                </Card>
              );
            }

            // Merge data: prefer snapshot deep analysis, fall back to M12 complaintIntelligence fields
            const crimeType = snap?.summary?.crimeType ?? (ci?.m12CrimeClassification ? `${ci.m12CrimeClassification.primary_category.toUpperCase()} (${ci.m12CrimeClassification.sub_category})` : (ci?.crimeType ?? '—'));
            const statute   = snap?.summary?.statute ?? (ci?.m12CrimeClassification?.applicable_statutes?.join(', ') ?? '—');
            const priority  = snap?.summary?.priority ?? ci?.m12RiskAssessment?.level ?? ci?.priority ?? '—';
            const confidence = snap?.summary?.confidence ?? ci?.m12ConfidenceScore ?? ci?.confidence ?? 0;
            const riskReason = snap?.summary?.riskReason ?? ci?.m12Understanding ?? ci?.summary ?? '—';
            const risk = (priority?.toLowerCase() === 'high' ? 'high' : priority?.toLowerCase() === 'medium' ? 'medium' : 'low');

            const icdItems: Array<{ k: string; v: string }> = snap?.summary?.icd ?? (
              ci?.m12Understanding || ci?.summary ? [
                { k: 'Incident Summary', v: ci?.m12Understanding || ci?.summary || '—' },
                { k: 'Primary Category', v: ci?.m12CrimeClassification?.primary_category || ci?.crimeType || '—' },
                { k: 'Sub Category', v: ci?.m12CrimeClassification?.sub_category || '—' },
                { k: 'Applicable Statutes', v: ci?.m12CrimeClassification?.applicable_statutes?.join(', ') || '—' },
                { k: 'Crime Classification Rationale', v: ci?.m12CrimeClassification?.rationale || '—' },
                { k: 'Risk Score & Level', v: ci?.m12RiskAssessment?.score ? `${ci.m12RiskAssessment.score} / 10 (${ci.m12RiskAssessment.level})` : '—' },
              ] : []
            );

            const entities: Record<string, Array<{ v: string }>> = snap?.summary?.entities ?? {};
            const conflicts: Array<{ t: string }> = snap?.summary?.conflicts ?? (
              ci?.m12Contradictions?.map((c: any) => ({ t: c.description || c.contradiction_type })) ??
              ci?.correlation?.conflicts?.map((t: string) => ({ t })) ?? []
            );
            const gaps: string[] = snap?.summary?.gaps ?? (
              ci?.m12InvestigativeGaps?.map((g: any) => typeof g === 'string' ? g : g.description || g.impact) ??
              ci?.missingInformation ?? []
            );
            const timelineEvents: Array<{ time?: string; what?: string; description?: string; source?: string; conflict?: boolean }> =
              snap?.summary?.timeline ?? 
              (ci?.investigationTimeline && ci.investigationTimeline.length > 0 
                ? ci.investigationTimeline.map((e: any) => ({ time: e.time || e.isoTime, what: e.event || e.description, source: e.source })) 
                : null) ??
              (ci?.m10Timeline && ci.m10Timeline.length > 0 
                ? ci.m10Timeline.map((e: any) => ({ time: e.timestamp || e.time, what: e.description || e.event })) 
                : null) ??
              ci?.m3Events?.map((e: any) => ({ time: e.time || e.timestamp, what: e.what || e.description })) ?? [];

            const confPct = Math.round(confidence * 100);
            const riskColorClass =
              risk === 'high'
                ? 'bg-red-50 text-red-600'
                : risk === 'medium'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-green-50 text-green-600';

            const circleR = 26;
            const circleC = 2 * Math.PI * circleR;
            const circleOff = circleC * (1 - confidence);

            const aiSubTabs: Array<{ key: typeof aiSubTab; label: string; count?: number }> = [
              { key: 'overview', label: 'Overview' },
              { key: 'details', label: 'Incident Details' },
              { key: 'entities', label: 'Entities' },
              { key: 'evidence', label: 'Evidence', count: complaint.evidence.length },
              { key: 'conflicts', label: 'Conflicts', count: conflicts.length },
              { key: 'gaps', label: 'Gaps', count: gaps.length },
              { key: 'timeline', label: 'Timeline', count: timelineEvents.length },
            ];

            return (
              <div>
                {/* AI Sub-Tabs */}
                <div className="flex gap-1 border-b border-neutral-200 mb-5 overflow-x-auto">
                  {aiSubTabs.map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => setAiSubTab(key)}
                      className={`flex-none px-4 py-2.5 text-[13px] font-bold whitespace-nowrap relative transition-colors ${
                        aiSubTab === key ? 'text-indigo-700' : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                      style={aiSubTab === key ? { boxShadow: 'inset 0 -2px 0 #2f3a91' } : {}}
                    >
                      {label}
                      {count !== undefined && (
                        <span className={`ml-1.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                          aiSubTab === key ? 'bg-indigo-50 text-indigo-700' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Sub-pane: Overview */}
                {aiSubTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Card>
                        <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-2">Likely Crime Type</p>
                        <p className="text-base font-extrabold text-neutral-800 leading-snug">{crimeType}</p>
                        {statute !== '—' && <p className="text-[11px] text-indigo-600 font-semibold mt-1">{statute}</p>}
                      </Card>
                      <Card>
                        <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-2">Investigation Priority</p>
                        <span className={`inline-block text-[11.5px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wide ${riskColorClass}`}>
                          {priority} {ci?.m12RiskAssessment?.score ? `(${ci.m12RiskAssessment.score}/10)` : ''}
                        </span>
                      </Card>
                      <Card>
                        <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-2">AI Confidence</p>
                        <div className="flex items-center gap-3">
                          <svg width="56" height="56" viewBox="0 0 64 64" className="flex-none">
                            <circle cx="32" cy="32" r={circleR} fill="none" stroke="#e5e7eb" strokeWidth="6" />
                            <circle
                              cx="32" cy="32" r={circleR} fill="none"
                              stroke="#2f3a91" strokeWidth="6" strokeLinecap="round"
                              strokeDasharray={circleC}
                              strokeDashoffset={circleOff}
                              transform="rotate(-90 32 32)"
                            />
                          </svg>
                          <span className="text-2xl font-extrabold text-neutral-800">{confPct}%</span>
                        </div>
                      </Card>
                    </div>
                    <Card>
                      <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-3">Investigation Synthesis & Risk Assessment</p>
                      <p className="text-sm text-neutral-700 leading-relaxed font-medium">{riskReason}</p>
                      {ci?.m12RiskAssessment?.factors && ci.m12RiskAssessment.factors.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-neutral-100 space-y-2">
                          <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Identified Risk Factors:</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {ci.m12RiskAssessment.factors.map((f: any, idx: number) => (
                              <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs">
                                <span className="font-bold text-neutral-800">{f.factor_name}</span>
                                <span className="ml-2 text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{f.severity}</span>
                                <p className="text-neutral-600 mt-1">{f.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                {/* Sub-pane: Incident Details */}
                {aiSubTab === 'details' && (
                  <Card>
                    <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-4">Categorized Incident Details</p>
                    {icdItems.length === 0 ? (
                      <p className="text-sm text-neutral-400 italic">No structured incident details available in this analysis.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {icdItems.map((item, i) => (
                          <div key={i} className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold mb-1">{item.k}</p>
                            <p className="text-sm font-semibold text-neutral-800 leading-relaxed">{item.v}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Sub-pane: Entities */}
                {aiSubTab === 'entities' && (
                  <Card>
                    <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-4">Involved Entities</p>
                    {Object.keys(entities).length === 0 && (!ci?.m3Entities || ci.m3Entities.length === 0) ? (
                      <p className="text-sm text-neutral-400 italic">No entities extracted yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(entities).map(([label, vals]) => (
                          <div key={label}>
                            <p className="text-[10.5px] text-neutral-400 uppercase tracking-widest font-bold mb-2">{label}</p>
                            <div className="flex flex-wrap gap-2">
                              {(vals as Array<{v:string}>).map((ent, ei) => (
                                <span key={ei} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 text-neutral-700 text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
                                  {ent.v}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Fallback: show m3Entities from complaintIntelligence */}
                    {Object.keys(entities).length === 0 && ci?.m3Entities && ci.m3Entities.length > 0 && (
                      <div className="space-y-4">
                        {Array.from(new Set(ci.m3Entities.map((e: any) => e.type || e.entity_type || e.entityType))).filter(Boolean).map((type: any) => (
                          <div key={type as string}>
                            <p className="text-[10.5px] text-indigo-600 uppercase tracking-widest font-extrabold mb-2">{type as string}</p>
                            <div className="flex flex-wrap gap-2">
                              {ci.m3Entities!.filter((e: any) => (e.type || e.entity_type || e.entityType) === type).map((ent: any, ei: number) => (
                                <span key={ei} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-900 text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
                                  {ent.value || (ent as any).name || (ent as any).canonical_value}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Sub-pane: Evidence */}
                {aiSubTab === 'evidence' && (
                  <div className="space-y-3">
                    {complaint.evidence.length === 0 ? (
                      <Card><p className="text-sm text-neutral-400 italic">No evidence files attached to this complaint.</p></Card>
                    ) : (
                      complaint.evidence.map((file, i) => (
                        <div key={file.publicId || i} className="border border-neutral-200 rounded-xl p-4 bg-neutral-50 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-indigo-600 flex-none" />
                              <span className="text-sm font-bold text-neutral-800">{file.originalFilename}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {file.aiMetadata?.classification && file.aiMetadata.classification !== 'Unknown' && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {file.aiMetadata.classification} ({Math.round((file.aiMetadata.classificationConfidence || 0) * 100)}%)
                                </span>
                              )}
                              {(file.aiMetadata as any)?.m4SceneType && (file.aiMetadata as any).m4SceneType !== 'unknown' && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                  {(file.aiMetadata as any).m4SceneType}
                                </span>
                              )}
                              {file.aiMetadata?.imageTags?.map((tag: string) => (
                                <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Evidence AI Description / Summary */}
                          {(file.aiMetadata?.aiSummary || (file.aiMetadata as any)?.m4Caption) && (
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-2.5 text-xs text-indigo-950">
                              <span className="font-bold text-indigo-700 mr-1.5">📷 Scene Analysis:</span>
                              {file.aiMetadata?.aiSummary || (file.aiMetadata as any)?.m4Caption}
                            </div>
                          )}

                          {/* Extracted OCR Text */}
                          {file.aiMetadata?.ocrText && (
                            <details className="cursor-pointer group">
                              <summary className="text-[11.5px] font-semibold text-indigo-700 hover:text-indigo-900 select-none flex items-center gap-1.5">
                                <span>🔍 Extracted OCR Text ({file.aiMetadata.ocrText.length} chars)</span>
                              </summary>
                              <pre className="mt-2 whitespace-pre-wrap text-[11px] font-mono bg-white p-3 rounded-lg border border-neutral-200 max-h-48 overflow-y-auto text-neutral-800 leading-relaxed shadow-inner">
                                {file.aiMetadata.ocrText}
                              </pre>
                            </details>
                          )}

                          {/* Extracted Evidence Entities */}
                          {(file.aiMetadata as any)?.m3Entities && (file.aiMetadata as any).m3Entities.length > 0 && (
                            <div className="pt-1">
                              <p className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 mb-1.5">Evidence Extracted Entities:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {(file.aiMetadata as any).m3Entities.map((ent: any, idx: number) => (
                                  <span key={idx} className="text-[11px] font-medium px-2 py-0.5 rounded bg-white border border-neutral-200 text-neutral-700">
                                    <span className="font-bold text-indigo-600 mr-1">{ent.entity_type || ent.type}:</span>
                                    {ent.value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {!file.aiMetadata && (
                            <p className="text-[11px] text-neutral-400 italic">AI has not processed this file yet.</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Sub-pane: Conflicts */}
                {aiSubTab === 'conflicts' && (
                  <div className="space-y-3">
                    {conflicts.length === 0 ? (
                      <Card>
                        <div className="flex items-center gap-3 py-4">
                          <CheckCircle2 className="h-6 w-6 text-green-500" />
                          <p className="text-sm text-neutral-600">No conflicts detected between the complaint narrative and the attached evidence.</p>
                        </div>
                      </Card>
                    ) : (
                      conflicts.map((c, i) => (
                        <div key={i} className="border border-red-200 bg-red-50 rounded-xl p-4">
                          <p className="text-sm text-neutral-800 leading-relaxed">{c.t}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Sub-pane: Gaps */}
                {aiSubTab === 'gaps' && (
                  <Card>
                    <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-4">Factual Gaps & Missing Information</p>
                    {gaps.length === 0 ? (
                      <p className="text-sm text-neutral-400 italic">No factual gaps identified by the AI analysis.</p>
                    ) : (
                      <ul className="divide-y divide-neutral-100">
                        {gaps.map((gap, i) => (
                          <li key={i} className="flex items-start gap-3 py-3 text-sm text-neutral-700">
                            <AlertCircle className="h-4 w-4 text-amber-500 flex-none mt-0.5" />
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )}

                {/* Sub-pane: AI Timeline */}
                {aiSubTab === 'timeline' && (
                  <Card>
                    <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-semibold mb-4">AI-Reconstructed Event Timeline</p>
                    {timelineEvents.length === 0 ? (
                      <p className="text-sm text-neutral-400 italic">No timeline events generated by the AI analysis yet.</p>
                    ) : (
                      <div className="relative pl-6 border-l-2 border-indigo-100 space-y-4">
                        {timelineEvents.map((ev, i) => (
                          <div key={i} className="relative">
                            <span className={`absolute -left-[27px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full border-2 ${
                              ev.conflict ? 'border-red-500 bg-red-100' : 'border-indigo-600 bg-white'
                            }`} />
                            <div className={`rounded-xl p-3 border text-sm ${
                              ev.conflict ? 'bg-red-50 border-red-100' : 'bg-neutral-50 border-neutral-200'
                            }`}>
                              <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                {ev.time && (
                                  <p className="text-[11px] font-extrabold text-indigo-700">{ev.time}</p>
                                )}
                                {ev.source && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {ev.source}
                                  </span>
                                )}
                              </div>
                              <p className="text-neutral-800 text-xs font-medium leading-relaxed">{ev.what ?? ev.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            );
          })()}

          {/* ── TAB: CASE STATUS & TIMELINE ── */}
          {activeTab === 'audit' && (
            <div className="max-w-2xl">
              <Card>
                <CardHeader title="Case Status & Timeline" />
                <div className="mt-6 relative pl-6 border-l-2 border-neutral-200 space-y-6">
                  {complaint.timeline.map((event, idx) => (
                    <div key={idx} className="relative">
                      <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-primary-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-700" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-[10px] text-neutral-400 font-semibold">
                          {new Date(event.timestamp).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs font-bold text-neutral-800">{event.user}</p>
                        <p className="text-xs text-neutral-600 leading-relaxed">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <InvestigationWorkspace caseId={complaint._id} />
      )}

      {/* SHO REJECTION REASON MODAL */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Complaint E-Application"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleReject} isLoading={actionLoading}>
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            Please provide a mandatory reason for rejecting this complaint. The citizen will be notified immediately via email.
          </p>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Rejection Reason</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Jurisdiction issue, civil matter, or lack of credible incident specifics."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </Modal>

      {/* IO FIR REGISTRATION CONFIRMATION MODAL */}
      <Modal
        isOpen={firConfirmModalOpen}
        onClose={() => setFirConfirmModalOpen(false)}
        title="Confirm FIR Registration"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFirConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRegisterFir} isLoading={actionLoading}>
              Register FIR
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-center py-4">
          <AlertTriangle className="mx-auto h-16 w-16 text-yellow-500 animate-pulse" />
          <h3 className="text-lg font-bold text-neutral-800">Are you absolutely sure?</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto leading-relaxed">
            This action **cannot** be undone. Once the FIR is registered, the entire case file will be permanently locked.
            An official FIR PDF will be generated and dispatched to the citizen.
          </p>
        </div>
      </Modal>

      {/* IO FIR PREVIEW MODAL */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Gujarat Police — FIR Draft Preview"
        size="lg"
        footer={
          <Button size="sm" onClick={() => setPreviewModalOpen(false)}>
            Close Preview
          </Button>
        }
      >
        <div className="border border-neutral-300 p-6 bg-white space-y-6 max-h-[500px] overflow-y-auto font-serif">
          {/* Header */}
          <div className="text-center border-b-2 border-neutral-800 pb-4">
            <h2 className="text-xl font-bold text-blue-900 uppercase">Gujarat Police State Department</h2>
            <h3 className="text-md font-semibold text-neutral-700">First Information Report (Draft Preview)</h3>
            <p className="text-xs text-neutral-500 mt-1">Generated under Crime OS Digital System</p>
          </div>

          {/* Meta Details */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p><strong>District:</strong> {complaint.policeStation.district}</p>
              <p><strong>Police Station:</strong> {complaint.policeStation.name}</p>
              <p><strong>State:</strong> {complaint.policeStation.state}</p>
            </div>
            <div>
              <p><strong>Complaint Reference:</strong> {complaint.complaintNumber}</p>
              <p><strong>Draft Date:</strong> {new Date().toLocaleDateString('en-IN')}</p>
              <p><strong>Category:</strong> {complaint.category ? complaint.category.replace('_', ' ') : 'UNCATEGORIZED'}</p>
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-100 pb-1 text-blue-900">1. Complainant Details</h4>
            <p><strong>Full Name:</strong> {complaint.citizen.firstName} {complaint.citizen.lastName}</p>
            <p><strong>Contact Phone:</strong> {complaint.citizen.phone}</p>
            <p><strong>Email Address:</strong> {complaint.citizen.email}</p>
          </div>

          <div className="border-t border-neutral-200 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-100 pb-1 text-blue-900">2. Occurrence of Offence</h4>
            <p><strong>Date & Time of Incident:</strong> {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}</p>
            <p><strong>Place of Occurrence:</strong> {complaint.incidentPlace}</p>
          </div>

          <div className="border-t border-neutral-200 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-100 pb-1 text-blue-900">3. Applicable Legal Sections</h4>
            <p className="font-mono bg-neutral-50 p-2 border border-neutral-200 rounded">{legalSections || 'No legal sections added yet.'}</p>
          </div>

          <div className="border-t border-neutral-200 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-100 pb-1 text-blue-900">4. Brief Facts / Investigation Summary</h4>
            <p className="leading-relaxed text-justify whitespace-pre-line">{crimeSummary || 'No crime summary entered yet.'}</p>
          </div>

          <div className="border-t border-neutral-200 pt-4 flex justify-between items-center text-xs">
            <div>
              <p><strong>Investigation Officer:</strong></p>
              <p className="mt-1 font-semibold">{complaint.assignedIO?.officerName} (Badge: {complaint.assignedIO?.badgeNumber})</p>
            </div>
            <div className="border border-dashed border-neutral-400 p-4 text-center h-16 w-32 flex items-center justify-center text-neutral-400">
              [ Station Seal ]
            </div>
          </div>
        </div>
      </Modal>

      {/* ASSIGN IO MODAL WITH AI RECOMMENDATIONS */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Approve & Assign Investigation Officer"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            Select an Investigation Officer (IO) to assign this case to. The list is sorted and ranked by our AI recommendation service based on historical closed case files.
          </p>

          {recLoading ? (
            <div className="py-12 flex justify-center">
              <Loader />
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto pr-1">
              {recommendedIos.map((io) => (
                <div key={io._id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 first:pt-0 last:pb-0">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-neutral-800">{io.officerName}</p>
                      <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                        Badge: {io.badgeNumber}
                      </span>
                      {io.aiRecommendation && (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          ⭐ {io.aiRecommendation.score.toFixed(0)}% Match
                        </span>
                      )}
                    </div>
                    {io.aiRecommendation ? (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[11px] text-neutral-500 font-medium">
                          Matched Cases: {io.aiRecommendation.matchedCases} (Avg Similarity: {io.aiRecommendation.averageSimilarity.toFixed(3)})
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {io.aiRecommendation.reasons.map((reason: any, idx: number) => (
                            <li key={idx} className="text-[10px] text-neutral-500 leading-normal">
                              {typeof reason === 'string'
                                ? reason
                                : (reason.title ?? reason.reason ?? JSON.stringify(reason))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-[11px] text-neutral-400 italic">No similar historical cases found for this officer.</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        const id = params.id as string;
                        await apiClient.patch(API_ROUTES.COMPLAINTS.APPROVE(id), { assignedIO: io._id });
                        setAssignModalOpen(false);
                        await fetchComplaint();
                      } catch (err: any) {
                        alert(err.response?.data?.message || 'Failed to approve complaint.');
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    isLoading={actionLoading}
                  >
                    Assign
                  </Button>
                </div>
              ))}
              {recommendedIos.length === 0 && (
                <p className="text-sm text-neutral-400 italic text-center py-6">No officers available at this station.</p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {chargeSheetModalOpen && (
        <ChargeSheetModal
          isOpen={chargeSheetModalOpen}
          onClose={() => setChargeSheetModalOpen(false)}
          caseId={complaint._id}
        />
      )}
    </div>
  );
}

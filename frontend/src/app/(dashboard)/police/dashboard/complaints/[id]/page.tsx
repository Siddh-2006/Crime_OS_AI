'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { InvestigationWorkspace, WorkspaceTab } from './components/InvestigationWorkspace';
import ChargeSheetModal from './ChargeSheetModal';
import { CaseUnderstandingView, CaseUnderstandingData } from '@/components/case-understanding/CaseUnderstandingView';
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
  CheckCircle2,
  RefreshCw,
  Bot,
  Eye,
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
  confidence_score?: number;
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
  isPhysical?: boolean;
  physicalDetails?: {
    name?: string;
    description?: string;
    locationFound?: string;
    currentLocation?: string;
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
  assignedIOs?: Array<{
    _id: string;
    officerName: string;
    badgeNumber: string;
  }>;
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
  firPdfUrlEn?: string;
  firPdfUrlGujEn?: string;
  firFormData?: Record<string, any>;
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
  processingStatus?: 'PENDING' | 'PROCESSED' | 'FAILED';
  credibilityMetrics?: {
    specificityDensity: number;
    consistencyFlags: Array<{ field: string; message: string; severity: 'low' | 'medium' | 'high' }>;
    evidenceCoverageRatio: number;
    crossCorroborationCount: number;
    patternMatches: number;
    responseResolutionRate: number;
    completenessScore: number;
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

// import { CaseUnderstandingView, CaseUnderstandingData } from '@/components/case-understanding/CaseUnderstandingView';

export default function PoliceComplaintDetailPage(): React.ReactElement {
  const { toasts, removeToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth(); // Logged in officer info

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [caseUnderstanding, setCaseUnderstanding] = useState<CaseUnderstandingData | null>(null);
  const [ios, setIos] = useState<IOOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [recommendedIos, setRecommendedIos] = useState<IOOfficer[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [selectedIoIds, setSelectedIoIds] = useState<string[]>([]);

  // FIR Registration confirmation modal
  const [firConfirmModalOpen, setFirConfirmModalOpen] = useState(false);

  // FIR Panel state
  const [firPanelOpen, setFirPanelOpen] = useState(false);
  const [firFormData, setFirFormData] = useState<Record<string, any> | null>(null);
  const [firPrepareLoading, setFirPrepareLoading] = useState(false);
  const [firPreviewLang, setFirPreviewLang] = useState<'en' | 'guj'>('guj');
  const [firPreviewOpen, setFirPreviewOpen] = useState(false);

  // FIR Preview modal (existing after registration)
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [selectedPdfTitle, setSelectedPdfTitle] = useState<string>('FIR PDF Preview');

  // IO Edit Fields
  const [editMode, setEditMode] = useState(false);
  const [detailedDescription, setDetailedDescription] = useState('');
  const [crimeSummary, setCrimeSummary] = useState('');
  const [legalSections, setLegalSections] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');

  // Charge Sheet modal
  const [chargeSheetModalOpen, setChargeSheetModalOpen] = useState(false);

  // Tab state for the read-only review view (IO=SUBMITTED / SHO), driven by sidebar navigation
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: 'original' | 'ai' | 'audit' = (rawTab === 'ai' || rawTab === 'audit' || rawTab === 'original') ? rawTab : 'original';
  const setActiveTab = (tab: 'original' | 'ai' | 'audit') => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };
  const [aiSubTab, setAiSubTab] = useState<'overview' | 'details' | 'entities' | 'evidence' | 'conflicts' | 'gaps' | 'timeline'>('overview');
  // IO workspace tab — driven by URL ?tab= param (sidebar navigation)
  const ioTab = (searchParams.get('tab') as WorkspaceTab) || 'analysis';
  const setIoTab = (tab: WorkspaceTab) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };

  // AI analysis snapshot fetched from backend
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Complaint Intelligence pipeline re-run state
  const [rerunningPipeline, setRerunningPipeline] = useState(false);

  const handleRerunPipeline = async () => {
    const id = params.id as string;
    if (!id) return;
    setRerunningPipeline(true);
    setCaseUnderstanding(null);
    setSnapshot(null);
    if (complaint) {
      setComplaint({ ...complaint, processingStatus: 'PENDING' });
    }
    try {
      await apiClient.post(API_ROUTES.COMPLAINTS.RERUN_PIPELINE(id));
      await fetchComplaint();
      await fetchSnapshot();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to trigger pipeline rerun.');
    } finally {
      setRerunningPipeline(false);
    }
  };

  const snapshotLegalSections = useMemo(() => {
    const sections = Array.isArray((snapshot as any)?.suggested_legal_sections)
      ? (snapshot as any).suggested_legal_sections
      : [];

    return sections.flatMap((section: any) => {
      if (typeof section === 'string') {
        const trimmed = section.trim();
        if (!trimmed) return [];
        const match = trimmed.match(/^([A-Za-z0-9.\-]+)\s*[:\-]\s*(.+)$/);
        return [{ code: match ? match[1].trim() : trimmed, title: match ? match[2].trim() : trimmed }];
      }

      if (section && typeof section === 'object') {
        const code = typeof section.code === 'string' ? section.code.trim() : '';
        const title = typeof section.title === 'string' ? section.title.trim() : '';
        const reason = typeof section.reason === 'string' ? section.reason.trim() : '';
        if (!code && !title && !reason) return [];
        return [{ code: code || title || 'Section', title: title || code || 'Applicable section', reason }];
      }

      return [];
    });
  }, [snapshot]);

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

  const fetchSnapshot = async (isSilent = false) => {
    const id = params.id as string;
    if (!isSilent && !snapshot) setSnapshotLoading(true);
    try {
      const res = await apiClient.get(`/cases/${id}/analysis/latest`);
      setSnapshot(res.data?.data ?? null);
    } catch {
      setSnapshot(null);
    } finally {
      if (!isSilent) setSnapshotLoading(false);
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
    setActionLoading(true);
    setCloseInvestigationModalOpen(false);
    try {
      const id = params.id as string;
      await apiClient.patch(`/complaints/${id}/close`);
      await fetchComplaint();
    } catch (err: any) {
      const msg: string = err.response?.data?.message || err.message || 'Failed to close case.';
      if (msg.includes('NO_ACCUSED')) {
        alert('Cannot close investigation: At least one suspect must be promoted to Accused in the Case Participants tab before closing.');
      } else {
        alert(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const ciData = complaint?.complaintIntelligence as any;
  const snapData = snapshot as any;
  const hasNonEmptyCI = ciData && Object.keys(ciData).length > 0 && (
    !!ciData.case_understanding || !!ciData.overview || !!ciData.summary || !!ciData.crimeType || !!ciData.crime_analysis || !!ciData.m12Understanding || !!ciData.m12CrimeClassification || !!ciData.m3Entities
  );
  const hasAIDataInMongo = !!(
    (caseUnderstanding && Object.keys(caseUnderstanding).length > 0) ||
    (snapData && Object.keys(snapData).length > 0) ||
    hasNonEmptyCI
  );
  const isAIReady = hasAIDataInMongo || (complaint?.processingStatus?.toUpperCase() === 'PROCESSED' && (complaint?.evidence?.length === 0 || hasAIDataInMongo));

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const initData = async () => {
      await fetchComplaint();
      await fetchSnapshot();
    };

    initData();

    if (user?.role === 'SHO') {
      fetchIOs();
    }
  }, [params.id, user]);

  // Dedicated polling effect for AI Pipeline Processing — polls silently every 3s until ready
  useEffect(() => {
    if (!isAIReady) {
      const timer = setInterval(() => {
        fetchComplaint();
        fetchSnapshot(true);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [isAIReady, params.id]);


  // Close Investigation confirmation modal
  const [closeInvestigationModalOpen, setCloseInvestigationModalOpen] = useState(false);

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

  const handlePrepareFir = async () => {
    if (complaint?.processingStatus?.toUpperCase() === 'PENDING') {
      alert('AI Pipeline is still processing case details in the background. Please wait until processing finishes.');
      await fetchComplaint();
      return;
    }
    const id = params.id as string;
    setFirPrepareLoading(true);
    try {
      const res = await apiClient.post(`/complaints/${id}/fir/prepare`);
      const data = res.data?.data ?? {};
      // Pre-populate from complaint.firFormData if already cached
      setFirFormData(data);
      setFirPanelOpen(true);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to prepare FIR data.');
    } finally {
      setFirPrepareLoading(false);
    }
  };

  const handleRegisterFir = async () => {
    setActionLoading(true);
    try {
      const id = params.id as string;
      await apiClient.patch(API_ROUTES.COMPLAINTS.REGISTER_FIR(id), { firFormData });
      setFirConfirmModalOpen(false);
      setFirPanelOpen(false);
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
        <h3 className="text-lg font-bold text-text-primary">Error Loading Case</h3>
        <p className="text-sm text-text-secondary">{error || 'Complaint not found.'}</p>
        <Button onClick={() => router.push(APP_ROUTES.POLICE_COMPLAINTS)}>Go Back</Button>
      </Card>
    );
  }

  const isAssignedIO = user?.role === 'IO' && (
    complaint.assignedIO?._id === user?._id ||
    complaint.assignedIOs?.some((io) => io._id === user?._id)
  );
  const isSHO = user?.role === 'SHO';
  const isLocked = complaint.status === 'FIR_REGISTERED' || complaint.status === 'CLOSED';
  const isClosed = complaint.status === 'CLOSED';
  const canRegisterFir = isSHO && complaint.status !== 'FIR_REGISTERED' && complaint.status !== 'CLOSED' && complaint.status !== 'REJECTED';
  const canAssignIo = isSHO && complaint.status === 'FIR_REGISTERED';

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <button
          onClick={() => router.push(APP_ROUTES.POLICE_COMPLAINTS)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Complaint Queue
        </button>
        {isLocked && (
          <div className="flex items-center gap-2 px-3 py-1 bg-semantic-success/10 text-semantic-success border border-semantic-success/30 rounded-full text-xs font-bold">
            <Lock size={14} />
            <span>FIR REGISTERED (CASE LOCKED)</span>
          </div>
        )}
      </div>

      {/* AI Processing Status - Minimal Banner */}
      {!isAIReady && (
        <div className="bg-surface-elevated border border-brand-primary/20 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-primary/10 text-brand-primary shrink-0">
              <Bot className="h-5 w-5 animate-pulse" />
            </div>
            <div className="text-xs text-text-secondary">
              <span className="font-bold text-text-primary">AI Analysis in Progress:</span>{' '}
              <span className="text-text-secondary">The Complaint Intelligence Engine is extracting OCR text &amp; analyzing evidence...</span>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleRerunPipeline}
            isLoading={rerunningPipeline}
            leftIcon={<RefreshCw size={12} />}
            className="text-xs shrink-0"
          >
            {rerunningPipeline ? 'Re-triggering...' : 'Re-run AI Pipeline'}
          </Button>
        </div>
      )}

      {/* Main Info Header */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 overflow-hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-bold text-text-primary truncate">{complaint.complaintNumber}</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 whitespace-nowrap">
              {complaint.status.replace(/_/g, ' ')}
            </span>
            {(complaint.assignedIOs && complaint.assignedIOs.length > 0) ? (
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-semantic-success/10 text-semantic-success border border-semantic-success/30 whitespace-nowrap">
                Assigned IO(s): {complaint.assignedIOs.map((io) => io.officerName).join(', ')}
              </span>
            ) : complaint.assignedIO && (
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-semantic-success/10 text-semantic-success border border-semantic-success/30 whitespace-nowrap">
                Assigned IO: {complaint.assignedIO.officerName} (Badge {complaint.assignedIO.badgeNumber})
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-1 truncate">
            Complainant: {complaint.citizen.firstName} {complaint.citizen.lastName} | Phone: {complaint.citizen.phone}
          </p>
        </div>

        {/* Action Controls for SHO */}
        {isSHO && (canRegisterFir || canAssignIo) && (
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {canRegisterFir && (
              <>
                {(!isAIReady && complaint.processingStatus?.toUpperCase() === 'PENDING') ? (
                  <Button
                    size="sm"
                    disabled
                    leftIcon={<RefreshCw className="animate-spin text-semantic-warning" size={15} />}
                    className="bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/30 cursor-not-allowed opacity-90 shadow-none"
                  >
                    AI Pipeline Processing...
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    leftIcon={<FileSignature size={15} />}
                    onClick={handlePrepareFir}
                    isLoading={firPrepareLoading}
                    disabled={actionLoading || firPrepareLoading}
                  >
                    {firFormData ? 'Edit & Register FIR' : 'Prepare FIR'}
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setRejectModalOpen(true)}
                  disabled={actionLoading}
                >
                  Reject Case
                </Button>
              </>
            )}
            {canAssignIo && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedIoIds(
                    complaint?.assignedIOs && complaint.assignedIOs.length > 0
                      ? complaint.assignedIOs.map((io) => io._id)
                      : complaint?.assignedIO
                        ? [complaint.assignedIO._id]
                        : []
                  );
                  setAssignModalOpen(true);
                  fetchRecommendations();
                }}
                disabled={actionLoading}
              >
                {complaint.assignedIO ? 'Change IO' : 'Assign IO'}
              </Button>
            )}
          </div>
        )}

        {/* Action button in header if registered */}
        {(isLocked || isClosed) && (complaint.firPdfUrlEn || complaint.firPdfUrlGujEn || complaint.firPdfUrl) && (
          <div className="flex flex-wrap gap-2 self-end md:self-center">
            {(complaint.firPdfUrlEn || complaint.firPdfUrl) && (
              <Button
                leftIcon={<Eye size={15} />}
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedPdfUrl(complaint.firPdfUrlEn || complaint.firPdfUrl || null);
                  setSelectedPdfTitle(`FIR PDF (English) — ${complaint.firNumber || complaint.complaintNumber}`);
                  setPreviewModalOpen(true);
                }}
              >
                Preview FIR (English)
              </Button>
            )}
            {complaint.firPdfUrlGujEn && (
              <Button
                leftIcon={<Eye size={15} />}
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedPdfUrl(complaint.firPdfUrlGujEn || null);
                  setSelectedPdfTitle(`FIR PDF (ગુજરાતી) — ${complaint.firNumber || complaint.complaintNumber}`);
                  setPreviewModalOpen(true);
                }}
              >
                Preview FIR (ગુજ.)
              </Button>
            )}
          </div>
        )}
        {complaint.status === 'FIR_REGISTERED' && (isAssignedIO || isSHO) && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setCloseInvestigationModalOpen(true)}
            isLoading={actionLoading}
          >
            Close Investigation
          </Button>
        )}
        {complaint.status === 'CLOSED' && (isAssignedIO || isSHO) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setChargeSheetModalOpen(true)}
            leftIcon={<FileText size={16} />}
          >
            View Charge Sheet
          </Button>
        )}
      </div>

      {/* ── REGISTERED FIR PDF DOCUMENTS BANNER (VISIBLE TO BOTH SHO AND IO) ── */}
      {(isLocked || isClosed || complaint.firPdfUrl || complaint.firPdfUrlEn || complaint.firPdfUrlGujEn) && (
        <div className="bg-surface border border-brand-primary/30 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl border border-brand-primary/20 shrink-0">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">Official Registered FIR</span>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  {complaint.firNumber || complaint.complaintNumber}
                </span>
              </div>
              <h2 className="text-base font-bold text-text-primary mt-0.5">
                First Information Report (BNS Section 173)
              </h2>
              <p className="text-xs text-text-secondary mt-1">
                FIR Registered on {complaint.firRegisteredAt ? new Date(complaint.firRegisteredAt).toLocaleString('en-IN') : new Date(complaint.createdAt).toLocaleDateString('en-IN')}. Cloudinary PDFs available in English &amp; Gujarati.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {(complaint.firPdfUrlEn || complaint.firPdfUrl) ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Eye size={15} />}
                  onClick={() => {
                    setSelectedPdfUrl(complaint.firPdfUrlEn || complaint.firPdfUrl || null);
                    setSelectedPdfTitle(`FIR PDF (English) — ${complaint.firNumber || complaint.complaintNumber}`);
                    setPreviewModalOpen(true);
                  }}
                >
                  Preview FIR (EN)
                </Button>
                <a
                  href={(complaint.firPdfUrlEn || complaint.firPdfUrl || '').replace('/raw/upload/', '/raw/upload/fl_attachment/')}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<FileDown size={15} />}
                  >
                    Download (EN)
                  </Button>
                </a>
              </>
            ) : null}

            {complaint.firPdfUrlGujEn ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Eye size={15} />}
                  onClick={() => {
                    setSelectedPdfUrl(complaint.firPdfUrlGujEn || null);
                    setSelectedPdfTitle(`FIR PDF (ગુજરાતી) — ${complaint.firNumber || complaint.complaintNumber}`);
                    setPreviewModalOpen(true);
                  }}
                >
                  Preview FIR (ગુજ.)
                </Button>
                <a
                  href={(complaint.firPdfUrlGujEn || '').replace('/raw/upload/', '/raw/upload/fl_attachment/')}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<FileDown size={15} />}
                  >
                    Download (ગુજ.)
                  </Button>
                </a>
              </>
            ) : null}

            {!(complaint.firPdfUrlEn || complaint.firPdfUrlGujEn || complaint.firPdfUrl) && (
              <div className="flex items-center gap-2 text-xs text-semantic-warning bg-semantic-warning/10 px-3 py-2 rounded-lg border border-semantic-warning/30 font-bold">
                <RefreshCw className="animate-spin h-3.5 w-3.5" />
                <span>Generating PDF &amp; Uploading...</span>
                <button
                  onClick={fetchComplaint}
                  className="ml-2 underline font-bold hover:text-text-primary"
                >
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(!isAssignedIO || complaint.status === 'SUBMITTED') ? (
        <div className="w-full flex-1 flex flex-col space-y-6">
          <div className="w-full">
            {!isAIReady && (
              <div className="bg-semantic-warning/10 border border-semantic-warning/30 text-semantic-warning rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-warning opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-semantic-warning"></span>
                  </span>
                  <span>AI Pipeline Active: Multi-modal OCR &amp; Case Intelligence Engine is currently processing evidence for this complaint.</span>
                </div>
                <button
                  onClick={() => setActiveTab('ai')}
                  className="px-3 py-1.5 bg-semantic-warning text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  View Live Progress &rarr;
                </button>
              </div>
            )}

            {/* ── TAB: ORIGINAL COMPLAINT ── */}
            {activeTab === 'original' && (
              <div className="w-full space-y-6">
                {/* Incident Specifications Card */}
                <Card>
                  <CardHeader title="Incident Specifications" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-4 border-b border-border pb-5">
                    <div>
                      <p className="text-xs text-text-secondary font-bold uppercase tracking-wider">Date &amp; Time</p>
                      <p className="text-sm font-semibold text-text-primary mt-1">
                        {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary font-bold uppercase tracking-wider">Occurrence Location</p>
                      <p className="text-sm font-semibold text-text-primary mt-1">{complaint.incidentPlace}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary font-bold uppercase tracking-wider">Category</p>
                      <p className="text-sm font-semibold text-brand-primary mt-1 uppercase font-mono">
                        {complaint.category ? complaint.category.replace('_', ' ') : 'UNCATEGORIZED'}
                      </p>
                    </div>
                    <div className="p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/15">
                      <p className="text-xs text-brand-primary font-bold uppercase tracking-wider">Complainant Profile</p>
                      <p className="text-sm font-bold text-text-primary mt-1">
                        {complaint.citizen.firstName} {complaint.citizen.lastName}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">{complaint.citizen.phone} &bull; {complaint.citizen.email}</p>
                    </div>
                  </div>

                  {/* Read-Only or Edit Mode Form */}
                  <div className="mt-5 space-y-5">
                    <div className="border-l-4 border-brand-primary pl-3.5">
                      <p className="text-xs text-text-secondary font-bold uppercase tracking-wider">Brief Summary</p>
                      <p className="text-base font-bold text-text-primary mt-0.5">{complaint.shortDescription}</p>
                    </div>

                    {!editMode ? (
                      <div className="space-y-5">
                        <div>
                          <p className="text-xs text-text-secondary font-bold uppercase tracking-wider mb-1.5">Detailed Description (Current)</p>
                          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-line bg-surface-elevated/80 p-4 rounded-xl border border-border shadow-sm">
                            {complaint.detailedDescription}
                          </p>
                        </div>
                        {(complaint.status === 'ASSIGNED_TO_IO' || isLocked) && (
                          <>
                            <div>
                              <p className="text-xs text-text-secondary font-bold uppercase tracking-wider mb-1.5">Crime Summary (for FIR)</p>
                              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-line bg-surface-elevated/80 p-4 rounded-xl border border-border shadow-sm">
                                {crimeSummary || <span className="text-text-muted italic">No summary entered yet.</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-secondary font-bold uppercase tracking-wider mb-1.5">Legal Sections (Applicable IPC/BNS)</p>
                              {snapshotLegalSections.length > 0 ? (
                                <div className="space-y-2 bg-surface-elevated/80 p-4 rounded-xl border border-border">
                                  {snapshotLegalSections.map((section: { code: string; title: string; reason?: string }, idx: number) => (
                                    <div key={`${section.code}-${idx}`} className="rounded-lg border border-border bg-surface p-3 shadow-xs">
                                      <p className="text-sm font-bold text-text-primary">{section.code}: {section.title}</p>
                                      {section.reason && <p className="text-xs text-text-secondary mt-1">{section.reason}</p>}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm font-semibold text-text-primary bg-surface-elevated/80 p-4 rounded-xl border border-border">
                                  {legalSections || <span className="text-text-muted italic">No legal sections assigned yet.</span>}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-text-secondary font-bold uppercase tracking-wider mb-1.5">Investigation Case Notes</p>
                              <p className="text-sm text-text-secondary whitespace-pre-line bg-surface-elevated/80 p-4 rounded-xl border border-border">
                                {investigationNotes || <span className="text-text-muted italic">No case notes recorded yet.</span>}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Detailed Description *</label>
                          <textarea
                            value={detailedDescription}
                            onChange={(e) => setDetailedDescription(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary bg-surface text-text-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Crime Summary (for FIR) *</label>
                          <textarea
                            value={crimeSummary}
                            onChange={(e) => setCrimeSummary(e.target.value)}
                            placeholder="Summarize the core offence details for the FIR registry..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary bg-surface text-text-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Applicable Legal Sections *</label>
                          <input
                            type="text"
                            value={legalSections}
                            onChange={(e) => setLegalSections(e.target.value)}
                            placeholder="e.g. Section 379, 411 IPC / BNS"
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary bg-surface text-text-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Investigation Case Notes</label>
                          <textarea
                            value={investigationNotes}
                            onChange={(e) => setInvestigationNotes(e.target.value)}
                            placeholder="Record details of evidence verified, witness statements, etc."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary bg-surface text-text-primary"
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
                    <p className="text-sm text-text-secondary mt-2">No evidence documents or media attached to this application.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {complaint.evidence.map((file) => (
                        <div key={file.publicId} className="flex flex-col p-4 border border-border rounded-2xl bg-surface-elevated/70 shadow-sm hover:shadow-md transition-shadow gap-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-8 w-8 text-brand-primary flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-text-primary truncate" title={file.originalFilename}>
                                  {file.originalFilename}
                                </p>
                                <p className="text-xs text-text-secondary">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB &bull; {file.extension.toUpperCase()}
                                </p>
                              </div>
                            </div>
                            <a
                              href={file.secureUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-surface-elevated rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                              title="Download Attachment"
                            >
                              <FileDown size={18} />
                            </a>
                          </div>

                          <div className="pt-3 border-t border-border space-y-2.5">
                            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-surface-elevated/50">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">AI Confidence Score</span>
                                <span className="text-xs font-bold text-text-primary">{Math.round(file.confidence_score ?? 0)}%</span>
                              </div>
                              <div className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{
                                backgroundColor: (file.confidence_score ?? 0) < 30 ? '#10b981' : (file.confidence_score ?? 0) < 70 ? '#f59e0b' : '#ef4444',
                                color: 'white',
                              }}>
                                {(file.confidence_score ?? 0) < 30 ? '✓ Likely Real' : (file.confidence_score ?? 0) < 70 ? '? Uncertain' : '⚠ Likely AI'}
                              </div>
                            </div>

                            {/* Analog Gauge */}
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1 h-8">
                                <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" />
                                <div
                                  className="absolute top-1.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow-lg bg-text-primary transition-all"
                                  style={{ left: `${Math.min(100, Math.max(0, file.confidence_score ?? 0))}%` }}
                                />
                              </div>
                            </div>

                            {/* Scale Labels */}
                            <div className="flex justify-between text-[9px] font-mono text-text-secondary px-1">
                              <span>0%</span>
                              <span>50%</span>
                              <span>100%</span>
                            </div>

                            {file.aiMetadata && (
                              <div className="space-y-2.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {file.aiMetadata.classification && file.aiMetadata.classification !== 'Unknown' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                      {file.aiMetadata.classification} ({Math.round((file.aiMetadata.classificationConfidence || 0) * 100)}%)
                                    </span>
                                  )}
                                  {file.aiMetadata.imageTags?.map((tag: string) => (
                                    <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-semantic-success/10 text-semantic-success border border-semantic-success/20">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                                {file.aiMetadata.ocrText && (
                                  <details className="text-[11px] text-text-secondary bg-surface p-2.5 rounded-xl border border-border cursor-pointer">
                                    <summary className="font-semibold text-text-primary select-none">Extracted OCR Text</summary>
                                    <p className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] bg-surface-elevated p-2 rounded-lg border border-border max-h-32 overflow-y-auto leading-relaxed text-text-primary">
                                      {file.aiMetadata.ocrText}
                                    </p>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Version History */}
                {complaint.descriptionHistory.length > 1 && (
                  <Card>
                    <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
                      <History className="h-5 w-5 text-brand-primary" />
                      <h3 className="text-sm font-bold text-text-primary">Version History (Editable Fields Log)</h3>
                    </div>
                    <div className="space-y-3 max-h-60 overflow-y-auto divide-y divide-border">
                      {complaint.descriptionHistory.map((h, i) => (
                        <div key={i} className="pt-3 first:pt-0 text-xs">
                          <div className="flex justify-between font-semibold text-text-secondary mb-1">
                            <span>Version {h.version} &bull; Edited by {h.editedBy}</span>
                            <span>{new Date(h.timestamp).toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-text-primary italic whitespace-pre-wrap bg-surface-elevated p-3 rounded-xl border border-border">
                            {h.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── TAB: AI COMPLAINT INTELLIGENCE ── */}
            {activeTab === 'ai' && (() => {
              const ci = complaint.complaintIntelligence as any;
              const cuData = caseUnderstanding || (ci && (ci.case_understanding || ci.overview || ci.timeline) ? ci : null);
              const snap = snapshot as any;
              const hasAI = isAIReady;

              if (snapshotLoading && !snapshot) {
                return (
                  <div className="flex items-center justify-center py-20">
                    <Loader />
                  </div>
                );
              }

              if (!hasAI) {
                return (
                  <Card className="min-h-[380px] flex flex-col items-center justify-center p-8 text-center space-y-5 my-4 border border-border shadow-xs bg-surface rounded-2xl">
                    <div className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary">
                      <Bot className="h-10 w-10 animate-pulse" />
                    </div>

                    <div className="space-y-1.5 max-w-md">
                      <h3 className="text-lg font-bold text-text-primary">AI Case Analysis in Progress</h3>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        The Multi-modal AI Engine is processing OCR evidence, performing legal classification, and assembling case understanding. This page updates automatically when ready.
                      </p>
                    </div>

                    <div className="w-full max-w-md space-y-3 pt-2">
                      <div className="flex justify-between text-xs font-semibold text-text-secondary">
                        <span className="truncate">Extracting Multi-modal Evidence &amp; Running Legal Rules...</span>
                        <span className="text-brand-primary font-bold animate-pulse">Processing</span>
                      </div>
                      <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden border border-border">
                        <div className="h-2 rounded-full bg-brand-primary transition-all duration-500 animate-pulse w-3/4" />
                      </div>
                      <div className="bg-surface-elevated/70 border border-border rounded-xl p-3 text-left space-y-1 text-[11px] text-text-secondary">
                        <p className="font-bold text-text-primary flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
                          Live Status: Executing Crime OS AI Services
                        </p>
                        <ul className="list-disc list-inside space-y-0.5 opacity-90 font-mono text-[10px]">
                          <li>Florence-2 &amp; OCR Engine: Processing attached media &amp; documents</li>
                          <li>Complaint Intelligence: Mapping IPC/BNS legal statutes &amp; risk score</li>
                          <li>IO Recommendation Engine: Scoring available station officers</li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRerunPipeline}
                        isLoading={rerunningPipeline}
                        leftIcon={<RefreshCw size={13} />}
                        className="text-xs text-text-primary border-border hover:bg-surface-elevated shadow-none"
                      >
                        {rerunningPipeline ? 'Re-triggering...' : 'Force Re-run AI Pipeline'}
                      </Button>
                    </div>
                  </Card>
                );
              }

              // If we have structured Case Understanding data, use the dedicated component
              if (cuData && (cuData.case_understanding || cuData.overview || cuData.timeline)) {
                return <CaseUnderstandingView data={cuData as CaseUnderstandingData} caseId={params.id as string} />;
              }

              // Calculations for fallback view
              const crimeType = snap?.summary?.crimeType ?? (ci?.m12CrimeClassification ? `${ci.m12CrimeClassification.primary_category.toUpperCase()} (${ci.m12CrimeClassification.sub_category})` : (ci?.crimeType ?? '—'));
              const statute = snap?.summary?.statute ?? (ci?.m12CrimeClassification?.applicable_statutes?.join(', ') ?? '—');
              const priority = snap?.summary?.priority ?? ci?.m12RiskAssessment?.level ?? ci?.priority ?? '—';
              const confidence = snap?.confidence_breakdown?.final_score ?? snap?.summary?.confidence ?? ci?.m12ConfidenceScore ?? ci?.confidence ?? 0.85;
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

              const entities: Record<string, Array<{ v: string }>> =
                (snap?.summary?.entities && typeof snap.summary.entities === 'object') ? snap.summary.entities : {};
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
                  ? 'bg-red-900/20 text-red-500'
                  : risk === 'medium'
                    ? 'bg-amber-900/20 text-amber-600'
                    : 'bg-green-900/20 text-green-500';

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
                <div className="space-y-4">
                  {/* Header Toolbar on Ready Page */}
                  <div className="flex justify-between items-center bg-surface p-3 rounded-xl border border-neutral-800 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-indigo-500" />
                      <span className="text-sm font-bold text-text-primary">AI Case Intelligence Analysis</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-900/20 text-emerald-400 border border-emerald-800">
                        READY
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRerunPipeline}
                      isLoading={rerunningPipeline}
                      leftIcon={<RefreshCw size={12} />}
                      className="text-xs text-text-secondary bg-surface border-neutral-800 hover:bg-neutral-900/30 shadow-none !py-1 !px-2.5"
                    >
                      {rerunningPipeline ? 'Re-triggering...' : 'Re-run AI Pipeline'}
                    </Button>
                  </div>

                  {cuData ? (
                    <CaseUnderstandingView data={cuData} caseId={params.id as string} />
                  ) : (
                    <div>
                      {/* AI Sub-Tabs */}
                      <div className="flex gap-1 border-b border-neutral-800 mb-5 overflow-x-auto">
                        {aiSubTabs.map(({ key, label, count }) => (
                          <button
                            key={key}
                            onClick={() => setAiSubTab(key)}
                            className={`flex-none px-4 py-2.5 text-[13px] font-bold whitespace-nowrap relative transition-colors ${aiSubTab === key ? 'text-indigo-400' : 'text-text-secondary hover:text-text-secondary'
                              }`}
                            style={aiSubTab === key ? { boxShadow: 'inset 0 -2px 0 #2f3a91' } : {}}
                          >
                            {label}
                            {count !== undefined && (
                              <span className={`ml-1.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${aiSubTab === key ? 'bg-indigo-900/20 text-indigo-400' : 'bg-neutral-800 text-text-secondary'
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
                            <Card padding="sm">
                              <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-2">Likely Crime Type</p>
                              <p className="text-base font-extrabold text-text-primary leading-snug">{crimeType}</p>
                              {statute !== '—' && <p className="text-[11px] text-indigo-500 font-semibold mt-1">{statute}</p>}
                            </Card>
                            <Card padding="sm">
                              <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-2">Investigation Priority</p>
                              <span className={`inline-block text-[11.5px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wide ${riskColorClass}`}>
                                {priority} {ci?.m12RiskAssessment?.score ? `(${ci.m12RiskAssessment.score}/10)` : ''}
                              </span>
                            </Card>
                            <Card padding="sm">
                              <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-2">AI Confidence</p>
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
                                <span className="text-2xl font-extrabold text-text-primary">{confPct}%</span>
                              </div>
                            </Card>
                          </div>
                          {/* CREDIBILITY METRICS (SHO Stage) */}
                          {complaint?.credibilityMetrics && (
                            <Card className="border-l-4 border-l-indigo-500">
                              <div className="flex items-center justify-between mb-4">
                                <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold flex items-center gap-2">
                                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                                  SHO Stage Credibility Assessment
                                </p>
                                <span className={`text-xs font-bold px-2 py-1 rounded ${complaint.credibilityMetrics.completenessScore >= 80 ? 'bg-green-500/20 text-green-400' :
                                  complaint.credibilityMetrics.completenessScore >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-red-500/20 text-red-400'
                                  }`}>
                                  Score: {complaint.credibilityMetrics.completenessScore}/100
                                </span>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                                  <p className="text-[10px] text-text-secondary uppercase mb-1 font-bold">Specificity Density</p>
                                  <p className="text-lg font-bold text-text-primary">{complaint.credibilityMetrics.specificityDensity}/10</p>
                                </div>
                                <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                                  <p className="text-[10px] text-text-secondary uppercase mb-1 font-bold">Evidence Coverage</p>
                                  <p className="text-lg font-bold text-text-primary">{(complaint.credibilityMetrics.evidenceCoverageRatio * 100).toFixed(0)}%</p>
                                </div>
                                <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                                  <p className="text-[10px] text-text-secondary uppercase mb-1 font-bold">Corroboration Count</p>
                                  <p className="text-lg font-bold text-text-primary">{complaint.credibilityMetrics.crossCorroborationCount}</p>
                                </div>
                                <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                                  <p className="text-[10px] text-text-secondary uppercase mb-1 font-bold">Pattern Matches</p>
                                  <p className="text-lg font-bold text-text-primary">{complaint.credibilityMetrics.patternMatches}</p>
                                </div>
                              </div>

                              {complaint.credibilityMetrics.consistencyFlags && complaint.credibilityMetrics.consistencyFlags.length > 0 && (
                                <div className="space-y-2 mt-4 pt-4 border-t border-neutral-800">
                                  <p className="text-[10.5px] text-text-secondary uppercase font-bold flex items-center gap-1.5 mb-3">
                                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                                    Consistency Flags
                                  </p>
                                  {complaint.credibilityMetrics.consistencyFlags.map((flag, idx) => (
                                    <div key={idx} className="flex gap-3 bg-red-900/10 border border-red-900/20 p-3 rounded-lg">
                                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="text-xs font-bold text-text-primary">{flag.field}</span>
                                        <p className="text-sm text-text-secondary mt-1">{flag.message}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </Card>
                          )}
                          <Card>
                            <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-3">Investigation Synthesis & Risk Assessment</p>
                            <p className="text-sm text-text-secondary leading-relaxed font-medium">{riskReason}</p>
                            {ci?.m12RiskAssessment?.factors && ci.m12RiskAssessment.factors.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-neutral-800 space-y-2">
                                <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Identified Risk Factors:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {ci.m12RiskAssessment.factors.map((f: any, idx: number) => (
                                    <div key={idx} className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-2.5 text-xs">
                                      <span className="font-bold text-text-primary">{f.factor_name}</span>
                                      <span className="ml-2 text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-red-900/30 text-red-400">{f.severity}</span>
                                      <p className="text-text-secondary mt-1">{f.description}</p>
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
                          <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-4">Categorized Incident Details</p>
                          {icdItems.length === 0 ? (
                            <p className="text-sm text-neutral-500 italic">No structured incident details available in this analysis.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {icdItems.map((item, i) => (
                                <div key={i} className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-3">
                                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">{item.k}</p>
                                  <p className="text-sm font-semibold text-text-primary leading-relaxed">{item.v}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      )}

                      {/* Sub-pane: Entities */}
                      {aiSubTab === 'entities' && (
                        <Card>
                          <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-4">Involved Entities</p>
                          {Object.keys(entities || {}).length === 0 && (!ci?.m3Entities || ci.m3Entities.length === 0) ? (
                            <p className="text-sm text-neutral-500 italic">No entities extracted yet.</p>
                          ) : (
                            <div className="space-y-4">
                              {Object.entries(entities || {}).map(([label, vals]) => (
                                <div key={label}>
                                  <p className="text-[10.5px] text-neutral-500 uppercase tracking-widest font-bold mb-2">{label}</p>
                                  <div className="flex flex-wrap gap-2">
                                    {Array.isArray(vals) && (vals as Array<{ v: string }>).map((ent, ei) => (
                                      <span key={ei} className="flex items-center gap-2 bg-neutral-900/30 border border-neutral-800 text-text-secondary text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
                                        {ent.v}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Fallback: show m3Entities from complaintIntelligence */}
                          {Object.keys(entities || {}).length === 0 && ci?.m3Entities && ci.m3Entities.length > 0 && (
                            <div className="space-y-4">
                              {Array.from(new Set(ci.m3Entities.map((e: any) => e.type || e.entity_type || e.entityType))).filter(Boolean).map((type: any) => (
                                <div key={type as string}>
                                  <p className="text-[10.5px] text-indigo-500 uppercase tracking-widest font-extrabold mb-2">{type as string}</p>
                                  <div className="flex flex-wrap gap-2">
                                    {ci.m3Entities!.filter((e: any) => (e.type || e.entity_type || e.entityType) === type).map((ent: any, ei: number) => (
                                      <span key={ei} className="flex items-center gap-2 bg-indigo-900/20 border border-indigo-100 text-indigo-900 text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
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
                            <Card><p className="text-sm text-neutral-500 italic">No evidence files attached to this complaint.</p></Card>
                          ) : (
                            complaint.evidence.map((file, i) => (
                              <div key={file.publicId || i} className="border border-neutral-800 rounded-xl p-4 bg-neutral-900/30 space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-indigo-500 flex-none" />
                                    <span className="text-sm font-bold text-text-primary">{file.originalFilename}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {file.aiMetadata?.classification && file.aiMetadata.classification !== 'Unknown' && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-900/20 text-indigo-400 border border-indigo-800/50">
                                        {file.aiMetadata.classification} ({Math.round((file.aiMetadata.classificationConfidence || 0) * 100)}%)
                                      </span>
                                    )}
                                    {(file.aiMetadata as any)?.m4SceneType && (file.aiMetadata as any).m4SceneType !== 'unknown' && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/20 text-blue-400 border border-blue-800/50 uppercase">
                                        {(file.aiMetadata as any).m4SceneType}
                                      </span>
                                    )}
                                    {file.aiMetadata?.imageTags?.map((tag: string) => (
                                      <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/20 text-emerald-400 border border-emerald-800">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Evidence AI Description / Summary */}
                                {(file.aiMetadata?.aiSummary || (file.aiMetadata as any)?.caption || (file.aiMetadata as any)?.m4Caption) && (
                                  <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-xl p-3 text-xs text-text-primary">
                                    <span className="font-bold text-brand-primary uppercase text-[10px] mr-1.5 block mb-0.5">Scene Analysis:</span>
                                    {file.aiMetadata?.aiSummary || (file.aiMetadata as any)?.caption || (file.aiMetadata as any)?.m4Caption}
                                  </div>
                                )}

                                {/* Extracted OCR Text */}
                                {file.aiMetadata?.ocrText && (
                                  <details className="cursor-pointer group">
                                    <summary className="text-[11.5px] font-semibold text-brand-primary select-none flex items-center gap-1.5">
                                      <span>Extracted OCR Text ({file.aiMetadata.ocrText.length} chars)</span>
                                    </summary>
                                    <pre className="mt-2 whitespace-pre-wrap text-[11px] font-mono bg-surface p-3 rounded-lg border border-neutral-800 max-h-48 overflow-y-auto text-text-primary leading-relaxed shadow-inner">
                                      {file.aiMetadata.ocrText}
                                    </pre>
                                  </details>
                                )}

                                {/* Extracted Evidence Entities */}
                                {(file.aiMetadata as any)?.m3Entities && (file.aiMetadata as any).m3Entities.length > 0 && (
                                  <div className="pt-1">
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1.5">Evidence Extracted Entities:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(file.aiMetadata as any).m3Entities.map((ent: any, idx: number) => (
                                        <span key={idx} className="text-[11px] font-medium px-2 py-0.5 rounded bg-surface border border-neutral-800 text-text-secondary">
                                          <span className="font-bold text-indigo-500 mr-1">{ent.entity_type || ent.type}:</span>
                                          {ent.value}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!file.aiMetadata && (
                                  <p className="text-[11px] text-neutral-500 italic">AI has not processed this file yet.</p>
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
                                <p className="text-sm text-text-secondary">No conflicts detected between the complaint narrative and the attached evidence.</p>
                              </div>
                            </Card>
                          ) : (
                            conflicts.map((c, i) => (
                              <div key={i} className="border border-red-800/50 bg-red-900/20 rounded-xl p-4">
                                <p className="text-sm text-text-primary leading-relaxed">{c.t}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Sub-pane: Gaps */}
                      {aiSubTab === 'gaps' && (
                        <Card>
                          <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-4">Factual Gaps & Missing Information</p>
                          {gaps.length === 0 ? (
                            <p className="text-sm text-neutral-500 italic">No factual gaps identified by the AI analysis.</p>
                          ) : (
                            <ul className="divide-y divide-neutral-100">
                              {gaps.map((gap, i) => (
                                <li key={i} className="flex items-start gap-3 py-3 text-sm text-text-secondary">
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
                          <p className="text-[10.5px] text-text-secondary uppercase tracking-widest font-semibold mb-4">AI-Reconstructed Event Timeline</p>
                          {timelineEvents.length === 0 ? (
                            <p className="text-sm text-neutral-500 italic">No timeline events generated by the AI analysis yet.</p>
                          ) : (
                            <div className="relative pl-6 border-l-2 border-indigo-100 space-y-4">
                              {timelineEvents.map((ev, i) => (
                                <div key={i} className="relative">
                                  <span className={`absolute -left-[27px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full border-2 ${ev.conflict ? 'border-red-500 bg-red-900/30' : 'border-indigo-600 bg-surface'
                                    }`} />
                                  <div className={`rounded-xl p-3 border text-sm ${ev.conflict ? 'bg-red-900/20 border-red-100' : 'bg-neutral-900/30 border-neutral-800'
                                    }`}>
                                    <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                      {ev.time && (
                                        <p className="text-[11px] font-extrabold text-indigo-400">{ev.time}</p>
                                      )}
                                      {ev.source && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-900/20 text-indigo-400 border border-indigo-100">
                                          {ev.source}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-text-primary text-xs font-medium leading-relaxed">{ev.what ?? ev.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── TAB: CASE STATUS & TIMELINE ── */}
            {activeTab === 'audit' && (
              <div className="w-full">
                <Card>
                  <CardHeader title="Case Status & Chronological Audit Timeline" subtitle="Official immutable audit trail of actions taken by citizens, SHO, and IOs" />
                  <div className="mt-8 relative pl-8 space-y-8 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-1 before:bg-gradient-to-b before:from-brand-primary before:via-brand-primary/50 before:to-semantic-success before:rounded-full">
                    {complaint.timeline.map((event, idx) => (
                      <div key={idx} className="relative group">
                        {/* Pulsing Node Dot */}
                        <div className="absolute -left-[30px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface border-2 border-brand-primary group-hover:scale-125 group-hover:border-semantic-success transition-all duration-300 shadow-sm">
                          <div className="h-2 w-2 rounded-full bg-brand-primary group-hover:bg-semantic-success transition-colors" />
                        </div>

                        {/* Event Card */}
                        <div className="bg-surface-elevated/80 border border-border p-4 rounded-2xl shadow-sm hover:border-brand-primary/40 transition-all duration-300 space-y-2">
                          <div className="flex flex-wrap justify-between items-center gap-2">
                            <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                              {new Date(event.timestamp).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true,
                              })}
                            </span>
                            <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-surface border border-border text-text-primary uppercase tracking-wide">
                              {event.user}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-text-primary leading-relaxed pt-1">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      ) : (
        <InvestigationWorkspace caseId={complaint._id} activeTab={ioTab} setActiveTab={setIoTab} />
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
          <p className="text-xs text-text-secondary">
            Please provide a mandatory reason for rejecting this complaint. The citizen will be notified immediately via email.
          </p>
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Rejection Reason</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Jurisdiction issue, civil matter, or lack of credible incident specifics."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
          <h3 className="text-lg font-bold text-text-primary">Are you absolutely sure?</h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto leading-relaxed">
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
        <div className="border border-neutral-700 p-6 bg-surface space-y-6 max-h-[500px] overflow-y-auto font-serif">
          {/* Header */}
          <div className="text-center border-b-2 border-neutral-800 pb-4">
            <h2 className="text-xl font-bold text-blue-900 uppercase">Gujarat Police State Department</h2>
            <h3 className="text-md font-semibold text-text-secondary">First Information Report (Draft Preview)</h3>
            <p className="text-xs text-text-secondary mt-1">Generated under Crime OS Digital System</p>
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

          <div className="border-t border-neutral-800 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-800 pb-1 text-blue-900">1. Complainant Details</h4>
            <p><strong>Full Name:</strong> {complaint.citizen.firstName} {complaint.citizen.lastName}</p>
            <p><strong>Contact Phone:</strong> {complaint.citizen.phone}</p>
            <p><strong>Email Address:</strong> {complaint.citizen.email}</p>
          </div>

          <div className="border-t border-neutral-800 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-800 pb-1 text-blue-900">2. Occurrence of Offence</h4>
            <p><strong>Date & Time of Incident:</strong> {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}</p>
            <p><strong>Place of Occurrence:</strong> {complaint.incidentPlace}</p>
          </div>

          <div className="border-t border-neutral-800 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-800 pb-1 text-blue-900">3. Applicable Legal Sections</h4>
            {snapshotLegalSections.length > 0 ? (
              <div className="space-y-2 font-mono bg-neutral-900/30 p-2 border border-neutral-800 rounded">
                {snapshotLegalSections.map((section: { code: string; title: string; reason?: string }, idx: number) => (
                  <div key={`${section.code}-${idx}`} className="rounded border border-neutral-800 bg-surface p-2">
                    <p className="font-semibold text-text-primary">{section.code}: {section.title}</p>
                    {section.reason && <p className="text-text-secondary mt-1">{section.reason}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono bg-neutral-900/30 p-2 border border-neutral-800 rounded">{legalSections || 'No legal sections added yet.'}</p>
            )}
          </div>

          <div className="border-t border-neutral-800 pt-4 space-y-3 text-xs">
            <h4 className="font-bold border-b border-neutral-800 pb-1 text-blue-900">4. Brief Facts / Investigation Summary</h4>
            <p className="leading-relaxed text-justify whitespace-pre-line">{crimeSummary || 'No crime summary entered yet.'}</p>
          </div>

          <div className="border-t border-neutral-800 pt-4 flex justify-between items-center text-xs">
            <div>
              <p><strong>Investigation Officer:</strong></p>
              <p className="mt-1 font-semibold">{complaint.assignedIO?.officerName} (Badge: {complaint.assignedIO?.badgeNumber})</p>
            </div>
            <div className="border border-dashed border-neutral-400 p-4 text-center h-16 w-32 flex items-center justify-center text-neutral-500">
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
          <p className="text-xs text-text-secondary">
            Select one or more Investigation Officers (IOs) to assign to this case. Multiple assigned IOs will collaborate on the investigation and gain access to the E2E encrypted Private Room.
          </p>

          {recLoading ? (
            <div className="py-12 flex justify-center">
              <Loader />
            </div>
          ) : (
            <>
              <div className="divide-y divide-border max-h-[350px] overflow-y-auto pr-1 space-y-2">
                {recommendedIos.map((io) => {
                  const isSelected = selectedIoIds.includes(io._id);
                  return (
                    <div
                      key={io._id}
                      onClick={() => {
                        setSelectedIoIds((prev) =>
                          isSelected ? prev.filter((id) => id !== io._id) : [...prev, io._id]
                        );
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'bg-brand-primary/10 border-brand-primary'
                          : 'bg-surface border-border hover:border-border/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent div onClick
                        className="mt-1 h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                      />
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-text-primary">{io.officerName}</p>
                          <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded-md border border-brand-primary/20">
                            Badge: {io.badgeNumber}
                          </span>
                          {io.aiRecommendation && (
                            <span className="text-xs font-bold text-semantic-warning bg-semantic-warning/10 border border-semantic-warning/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              ⭐ {io.aiRecommendation.score.toFixed(0)}% Match
                            </span>
                          )}
                        </div>
                        {io.aiRecommendation ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-[11px] text-text-secondary font-medium">
                              Matched Cases: {io.aiRecommendation.matchedCases} (Avg Similarity: {io.aiRecommendation.averageSimilarity.toFixed(3)})
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-text-secondary italic">No similar historical cases found for this officer.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {recommendedIos.length === 0 && (
                  <p className="text-sm text-neutral-500 italic text-center py-6">No officers available at this station.</p>
                )}
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-center">
                <span className="text-xs font-bold text-text-secondary">
                  {selectedIoIds.length} Officer(s) Selected
                </span>
                <Button
                  size="sm"
                  disabled={selectedIoIds.length === 0 || actionLoading}
                  isLoading={actionLoading}
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      const id = params.id as string;
                      if (complaint.status === 'ASSIGNED_TO_IO' || complaint.status === 'FIR_REGISTERED') {
                        await apiClient.patch(`/complaints/${id}/reassign-ios`, { assignedIOs: selectedIoIds });
                      } else {
                        await apiClient.patch(API_ROUTES.COMPLAINTS.APPROVE(id), { assignedIOs: selectedIoIds });
                      }
                      setAssignModalOpen(false);
                      await fetchComplaint();
                    } catch (err: any) {
                      alert(err.response?.data?.message || 'Failed to update IO assignment.');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                >
                  Confirm &amp; Assign Selected ({selectedIoIds.length})
                </Button>
              </div>
            </>
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

      {/* ── IN-APP FIR PDF PREVIEW MODAL ── */}
      {previewModalOpen && selectedPdfUrl && (
        <Modal
          isOpen={previewModalOpen}
          onClose={() => {
            setPreviewModalOpen(false);
            setSelectedPdfUrl(null);
          }}
          title={selectedPdfTitle}
          size="lg"
          footer={
            <div className="flex justify-between items-center w-full">
              <a href={selectedPdfUrl} target="_blank" rel="noopener noreferrer" download>
                <Button leftIcon={<FileDown size={16} />} size="sm">
                  Download PDF File
                </Button>
              </a>
              <Button variant="secondary" size="sm" onClick={() => setPreviewModalOpen(false)}>
                Close Preview
              </Button>
            </div>
          }
        >
          <div className="w-full h-[75vh] rounded-xl overflow-hidden border border-neutral-800 bg-neutral-800 relative">
            <iframe
              src={`${selectedPdfUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-none"
              title="FIR PDF Preview"
            />
          </div>
        </Modal>
      )}

      {/* OFFICIAL EDITABLE FIR FORM MODAL */}
      {firPanelOpen && firFormData && (
        <Modal
          isOpen={firPanelOpen}
          onClose={() => setFirPanelOpen(false)}
          title="Official First Information Report (15 Standard Fields)"
          size="lg"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setFirPanelOpen(false)}>
                Cancel
              </Button>
              <Button
                leftIcon={<FileSignature size={16} />}
                onClick={handleRegisterFir}
                isLoading={actionLoading}
              >
                Register FIR
              </Button>
            </div>
          }
        >
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 text-xs">
            <p className="text-text-secondary">
              Review and edit all fields below. Once registered, the complaint will be officially locked and immutable, and dual-language PDFs (English & Gujarati-English) will be generated.
            </p>

            {/* Header / Meta */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">1. Station & Registration Meta</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">District</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.district || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, district: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Police Station</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.policeStation || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, policeStation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Year</label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.year || new Date().getFullYear()}
                    onChange={(e) => setFirFormData({ ...firFormData, year: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Date</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.firDate || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, firDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Acts & Sections */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-2 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">2. Act, Law, and Sections</h4>
              <textarea
                rows={2}
                className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                value={firFormData.actAndSections || ''}
                onChange={(e) => setFirFormData({ ...firFormData, actAndSections: e.target.value })}
              />
            </div>

            {/* Section 3: Period of Crime */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">3. Period of Crime & Station Diary Entry</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Crime Start Date</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.crimeStartDate || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, crimeStartDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Start Time (hrs)</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.crimeStartTime || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, crimeStartTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Crime End Date</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.crimeEndDate || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, crimeEndDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">End Time (hrs)</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.crimeEndTime || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, crimeEndTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Date Info Received at Station</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.dateInfoReceived || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, dateInfoReceived: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Station Diary Entry Number</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.stationDiaryEntryNumber || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, stationDiaryEntryNumber: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 4 & 5: Information Type & Place of Incident */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">4–5. Type of Information & Place of Incident</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Type of Information</label>
                  <select
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.informationType || 'Oral'}
                    onChange={(e) => setFirFormData({ ...firFormData, informationType: e.target.value })}
                  >
                    <option value="Oral">Oral (મૌખિક)</option>
                    <option value="Written">Written (લેખિત)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Direction & Distance</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.directionDistanceFromStation || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, directionDistanceFromStation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Outside Jurisdiction (if any)</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.outsideJurisdiction || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, outsideJurisdiction: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Incident Address</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                  value={firFormData.incidentAddress || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, incidentAddress: e.target.value })}
                />
              </div>
            </div>

            {/* Section 6: Complainant Details */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">6. Complainant / Informant Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Name</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.complainantName || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, complainantName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Father's Name</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.complainantFatherName || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, complainantFatherName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Mobile Numbers</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.complainantMobileNumbers || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, complainantMobileNumbers: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Occupation</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.complainantOccupation || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, complainantOccupation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Nationality</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.complainantNationality || 'Indian'}
                    onChange={(e) => setFirFormData({ ...firFormData, complainantNationality: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">DOB / Age</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.complainantDOB || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, complainantDOB: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Full Residential Address</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                  value={firFormData.complainantAddress || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, complainantAddress: e.target.value })}
                />
              </div>
            </div>

            {/* Section 7: Accused Details */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-2 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">7. Details of Known / Suspected / Unknown Accused</h4>
              <textarea
                rows={4}
                className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-mono"
                value={firFormData.accusedDetails || ''}
                onChange={(e) => setFirFormData({ ...firFormData, accusedDetails: e.target.value })}
              />
            </div>

            {/* Section 8-11: Delay & Property */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">8–11. Delay Reason & Involved Assets</h4>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Reason for Delay in Reporting</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                  value={firFormData.delayReason || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, delayReason: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Stolen / Involved Property Details</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.stolenPropertyDetails || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, stolenPropertyDetails: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Total Value of Involved Assets (₹)</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                    value={firFormData.stolenPropertyValue || ''}
                    onChange={(e) => setFirFormData({ ...firFormData, stolenPropertyValue: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 12: Detailed Verbatim Statement */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">12. First Information Report Narrative Statements</h4>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Statement in Gujarati-English (ગુજરાતી અહેવાલ)</label>
                <textarea
                  rows={8}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-mono leading-relaxed"
                  value={firFormData.firStatement || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, firStatement: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Statement in English</label>
                <textarea
                  rows={8}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-mono leading-relaxed"
                  value={firFormData.firStatementEn || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, firStatementEn: e.target.value })}
                />
              </div>
            </div>

            {/* Brief Summary */}
            <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">Brief Summary of Offense</h4>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Summary in Gujarati-English</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                  value={firFormData.briefSummaryGujEn || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, briefSummaryGujEn: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-text-secondary block mb-1">Summary in English</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-2.5 text-xs font-medium"
                  value={firFormData.briefSummary || ''}
                  onChange={(e) => setFirFormData({ ...firFormData, briefSummary: e.target.value })}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Close Investigation Confirmation Modal */}
      <Modal
        isOpen={closeInvestigationModalOpen}
        onClose={() => setCloseInvestigationModalOpen(false)}
        title="Close Investigation"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-semantic-warning/10 border border-semantic-warning/30 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-semantic-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm text-text-secondary">
              <p className="font-semibold text-semantic-warning mb-2">Are you sure you want to close this investigation?</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>The case will be permanently marked as <strong>CLOSED</strong></li>
                <li>The investigation will be indexed in the AI vector store</li>
                <li>A Charge Sheet will be automatically generated (this may take some time)</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="ghost"
              onClick={() => setCloseInvestigationModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleCloseCase}
              isLoading={actionLoading}
            >
              Yes, Close Investigation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Chargesheet Modal */}
      <ChargeSheetModal
        isOpen={chargeSheetModalOpen}
        onClose={() => setChargeSheetModalOpen(false)}
        caseId={params.id as string}
      />
    
      <ToastContainer toasts={toasts} onRemove={removeToast} />
</div>
  );
}

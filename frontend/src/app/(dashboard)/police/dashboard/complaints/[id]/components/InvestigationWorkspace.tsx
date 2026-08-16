'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import apiClient from '@/lib/axios';
import { AnalysisPanel } from './AnalysisPanel';
import { ChecklistPanel } from './ChecklistPanel';
import { CaseDiaryFeed } from './CaseDiaryFeed';
import { RequestComposerModal } from './RequestComposerModal';
import EvidenceViewerModal from './EvidenceViewerModal';
import { DepartmentInboxPanel } from './DepartmentInboxPanel';
import { CopilotSidebar } from './CopilotSidebar';
import { Loader } from '@/components/ui/Loader';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { CaseCorkboard } from '@/components/case/CaseCorkboard';
import { CaseRoomChat } from './CaseRoomChat';
import { Bot, BookOpen, ClipboardList, Send, FolderOpen, Sparkles, Users, FileText, Brain, Calendar, MapPin, Download, CheckCheck, Loader2, Clock, FileImage, FileVideo, FileAudio, File, ChevronRight, CheckCircle2, AlertCircle, Shield, Pencil, Trash2, Scale, X, MessageSquare, Network } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import ThreadViewerModal from './ThreadViewerModal';
import SnapshotDetailModal from './SnapshotDetailModal';
import StepDetailModal from './StepDetailModal';
import { AddEvidenceModal } from './AddEvidenceModal';
import { PhysicalEvidencePanel } from '@/components/evidence/PhysicalEvidencePanel';
import ComplaintDetailModal from './ComplaintDetailModal';
import { DiaryDetailModal } from './DiaryDetailModal';
import { useTranslation } from '@/context/TranslationContext';
import { CaseUnderstandingView, CaseUnderstandingData } from '@/components/case-understanding/CaseUnderstandingView';
import { CustodyPanel } from './CustodyPanel';
import { API_ROUTES } from '@/lib/constants';

interface InvestigationWorkspaceProps {
  caseId: string;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
}

export type WorkspaceTab = 'analysis' | 'diary' | 'checklist' | 'requests' | 'evidence' | 'physical_evidence' | 'participants' | 'complaint' | 'case_understanding' | 'timeline' | 'placesVisited' | 'custody' | 'room' | 'graph';

export function InvestigationWorkspace({ caseId, activeTab, setActiveTab }: InvestigationWorkspaceProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const { language } = useTranslation();

  // Request Composer Modal State
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStepId, setComposerStepId] = useState('');
  const [composerDeptId, setComposerDeptId] = useState('');

  const openComposer = (stepId: string, deptId: string) => {
    setComposerStepId(stepId);
    setComposerDeptId(deptId);
    setComposerOpen(true);
  };

  const [snapshot, setSnapshot] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any>(null);
  const [diaryEntries, setDiaryEntries] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [threadFilter, setThreadFilter] = useState<'all' | 'department' | 'citizen'>('all');
  const [evidence, setEvidence] = useState<any[]>([]);
  const [warrants, setWarrants] = useState<any[]>([]);
  const [diaryDraft, setDiaryDraft] = useState<any>(null);
  const [diaryDraftLoading, setDiaryDraftLoading] = useState(false);
  const [diaryDraftError, setDiaryDraftError] = useState<string | null>(null);
  const [diaryHistory, setDiaryHistory] = useState<any[]>([]);
  const [placesVisited, setPlacesVisited] = useState<any[]>([]);
  const [placesVisitedLoading, setPlacesVisitedLoading] = useState(false);
  const [placeForm, setPlaceForm] = useState<any>({
    address: '',
    visitDate: new Date().toISOString().slice(0, 10),
    startTime: '',
    endTime: '',
    whatWasDone: '',
  });
  const [placeFormError, setPlaceFormError] = useState<string | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isDiaryPreviewOpen, setIsDiaryPreviewOpen] = useState(false);
  const [diaryDate, setDiaryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [diaryForm, setDiaryForm] = useState<any>({
    title: '',
    officialOfficerId: '',
    crimeRegisterNumber: '',
    propertyStolen: '',
    propertyRecovered: '',
    recordOfInvestigation: '',
    recordOfInvestigationEn: '',
    recordOfInvestigationGujEn: '',
    investigationStartTime: '10/00',
    investigationEndTime: '18/00',
    custodyStatus: '-----',
    magisterialCustodyDate: '-----',
    lastDiaryNumber: '',
    lastDiaryDate: '',
    draftLanguage: 'guj_en',
    structuredData: {},
  });

  // Complaint preview & Case Understanding
  const [complaintData, setComplaintData] = useState<any | null>(null);
  const [caseUnderstanding, setCaseUnderstanding] = useState<CaseUnderstandingData | null>(null);

  // Diary Modals State
  const [viewingEvidence, setViewingEvidence] = useState<any | null>(null);
  const [viewingThreadId, setViewingThreadId] = useState<string | null>(null);
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [viewingStepId, setViewingStepId] = useState<string | null>(null);
  const [viewingComplaintData, setViewingComplaintData] = useState<any | null>(null);
  const [selectedDiaryEntry, setSelectedDiaryEntry] = useState<any>(null);

  const fetchWorkspaceData = useCallback(async () => {
    try {
      const [snapRes, checkRes, diaryRes, diaryHistoryRes, placesRes, reqRes, evRes, participantRes, warrantRes] = await Promise.allSettled([
        apiClient.get(`/cases/${caseId}/analysis/latest`),
        apiClient.get(`/cases/${caseId}/checklist`),
        apiClient.get(`/cases/${caseId}/diary`),
        apiClient.get(`/cases/${caseId}/diary/history`),
        apiClient.get(`/cases/${caseId}/diary/places`),
        apiClient.get(`/cases/${caseId}/requests`),
        apiClient.get(`/cases/${caseId}/evidence`),
        apiClient.get(`/cases/${caseId}/participants`),
        apiClient.get(`/cases/${caseId}/warrants`),
      ]);

      if (snapRes.status === 'fulfilled') setSnapshot(snapRes.value.data.data);

      if (checkRes.status === 'fulfilled') {
        const raw = checkRes.value.data.data;
        if (Array.isArray(raw)) {
          setChecklist({ steps: raw });
        } else if (raw && typeof raw === 'object') {
          setChecklist({ ...raw, steps: raw.steps ?? [] });
        } else {
          setChecklist({ steps: [] });
        }
      }

      if (diaryRes.status === 'fulfilled') {
        const raw = diaryRes.value.data.data;
        setDiaryEntries(Array.isArray(raw) ? raw : []);
      }
      if (diaryHistoryRes.status === 'fulfilled') {
        const raw = diaryHistoryRes.value.data.data;
        setDiaryHistory(Array.isArray(raw) ? raw : []);
      }
      if (placesRes.status === 'fulfilled') {
        const rawPlaces = placesRes.value.data.data;
        setPlacesVisited(Array.isArray(rawPlaces) ? rawPlaces : []);
      }

      if (reqRes.status === 'fulfilled') setRequests(reqRes.value.data.data || []);
      if (evRes.status === 'fulfilled') setEvidence(evRes.value.data.data || []);
      if (participantRes.status === 'fulfilled') {
        const rawParticipants = participantRes.value.data.data;
        setParticipants(Array.isArray(rawParticipants) ? rawParticipants : []);
      }

      // Fetch threads specifically
      try {
        const threadRes = await apiClient.get(`/cases/${caseId}/threads`);
        setThreads(threadRes.data.data || []);
      } catch (err) {
        console.error('Failed to fetch threads:', err);
      }

      // Fetch original complaint data
      try {
        const complaintRes = await apiClient.get(API_ROUTES.COMPLAINTS.DETAIL(caseId));
        if (complaintRes.data?.data) setComplaintData(complaintRes.data.data);
      } catch (err) {
        console.error('Failed to fetch complaint data:', err);
      }

      // Fetch Case Understanding
      try {
        const cuRes = await apiClient.get(API_ROUTES.CASE_UNDERSTANDING.DETAIL(caseId));
        if (cuRes.data?.data) setCaseUnderstanding(cuRes.data.data);
      } catch {
        /* case understanding may not be ready yet */
      }
    } catch (error) {
      console.error('Failed to load workspace data', error);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchWorkspaceData();
    const interval = setInterval(fetchWorkspaceData, 15000);
    return () => clearInterval(interval);
  }, [fetchWorkspaceData]);

  const handleGenerateDiaryDraft = async () => {
    setDiaryDraftLoading(true);
    setDiaryDraftError(null);
    try {
      const res = await apiClient.post(`/cases/${caseId}/diary/draft`, {
        diary_date: diaryDate,
        language,
        title: `Daily Diary — ${diaryDate}`,
      });
      const draft = res.data.data;
      setDiaryDraft(draft);
      setDiaryForm({
        title: draft?.title || `Daily Diary — ${diaryDate}`,
        officialOfficerId: draft?.official_officer_id || '',
        crimeRegisterNumber: draft?.crime_register_number || '',
        propertyStolen: draft?.property_stolen || '',
        propertyRecovered: draft?.property_recovered || '',
        recordOfInvestigation: draft?.record_of_investigation || '',
        recordOfInvestigationEn: draft?.record_of_investigation_en || '',
        recordOfInvestigationGujEn: draft?.record_of_investigation_guj_en || '',
        investigationStartTime: draft?.investigation_start_time || '10/00',
        investigationEndTime: draft?.investigation_end_time || '18/00',
        custodyStatus: draft?.custody_status || '-----',
        magisterialCustodyDate: draft?.magisterial_custody_date || '-----',
        lastDiaryNumber: draft?.last_diary_number ?? '',
        lastDiaryDate: draft?.last_diary_date || '',
        draftLanguage: draft?.draft_language || draft?.language_preference || 'guj_en',
        structuredData: draft?.structured_data || {},
      });
      await fetchWorkspaceData();
      showToast('Official daily diary draft generated.', 'success');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to generate diary draft.';
      setDiaryDraftError(message);
      showToast(message, 'error');
    } finally {
      setDiaryDraftLoading(false);
    }
  };

  const handleFinalizeDiaryDraft = async () => {
    if (!diaryDraft?.diary_id) return;
    setDiaryDraftLoading(true);
    try {
      const res = await apiClient.post(`/cases/${caseId}/diary/finalize`, {
        diary_id: diaryDraft.diary_id,
        title: diaryForm.title || diaryDraft.title,
        officialOfficerId: diaryForm.officialOfficerId,
        crimeRegisterNumber: diaryForm.crimeRegisterNumber,
        propertyStolen: diaryForm.propertyStolen,
        propertyRecovered: diaryForm.propertyRecovered,
        investigationStartTime: diaryForm.investigationStartTime,
        investigationEndTime: diaryForm.investigationEndTime,
        custodyStatus: diaryForm.custodyStatus,
        magisterialCustodyDate: diaryForm.magisterialCustodyDate,
        lastDiaryNumber: diaryForm.lastDiaryNumber ? Number(diaryForm.lastDiaryNumber) : undefined,
        lastDiaryDate: diaryForm.lastDiaryDate,
        draftLanguage: diaryForm.draftLanguage,
        recordOfInvestigation: diaryForm.recordOfInvestigation,
        recordOfInvestigationEn: diaryForm.recordOfInvestigationEn || diaryForm.recordOfInvestigation,
        recordOfInvestigationGujEn: diaryForm.recordOfInvestigationGujEn || diaryForm.recordOfInvestigation,
        places_visited: diaryDraft.content?.places_visited || [],
      });
      setDiaryDraft(res.data.data);
      await fetchWorkspaceData();
      showToast('Daily diary finalized and logged.', 'success');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to finalize diary draft.';
      setDiaryDraftError(message);
      showToast(message, 'error');
    } finally {
      setDiaryDraftLoading(false);
    }
  };

  const handleSaveDiaryDraft = async () => {
    if (!diaryDraft?.diary_id) return;
    setDiaryDraftLoading(true);
    try {
      const res = await apiClient.put(`/cases/${caseId}/diary/draft/${diaryDraft.diary_id}`, {
        title: diaryForm.title,
        officialOfficerId: diaryForm.officialOfficerId,
        crimeRegisterNumber: diaryForm.crimeRegisterNumber,
        propertyStolen: diaryForm.propertyStolen,
        propertyRecovered: diaryForm.propertyRecovered,
        investigationStartTime: diaryForm.investigationStartTime,
        investigationEndTime: diaryForm.investigationEndTime,
        custodyStatus: diaryForm.custodyStatus,
        magisterialCustodyDate: diaryForm.magisterialCustodyDate,
        lastDiaryNumber: diaryForm.lastDiaryNumber ? Number(diaryForm.lastDiaryNumber) : undefined,
        lastDiaryDate: diaryForm.lastDiaryDate,
        recordOfInvestigation: diaryForm.recordOfInvestigation,
        recordOfInvestigationEn: diaryForm.recordOfInvestigationEn,
        recordOfInvestigationGujEn: diaryForm.recordOfInvestigationGujEn,
        structuredData: diaryForm.structuredData,
        draftLanguage: diaryForm.draftLanguage,
      });
      setDiaryDraft(res.data.data);
      showToast('Diary draft saved.', 'success');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to save diary draft.';
      setDiaryDraftError(message);
      showToast(message, 'error');
    } finally {
      setDiaryDraftLoading(false);
    }
  };

  const handleAddPlaceVisited = async () => {
    if (!placeForm.address?.trim()) {
      setPlaceFormError('Location address is required.');
      return;
    }

    setPlaceFormError(null);
    setPlacesVisitedLoading(true);

    try {
      await apiClient.post(`/cases/${caseId}/diary/places`, {
        address: placeForm.address,
        visitDate: placeForm.visitDate,
        startTime: placeForm.startTime,
        endTime: placeForm.endTime,
        whatWasDone: placeForm.whatWasDone,
      });

      setPlaceForm({
        address: '',
        visitDate: new Date().toISOString().slice(0, 10),
        startTime: '',
        endTime: '',
        whatWasDone: '',
      });

      await fetchWorkspaceData();
      showToast('Visited place saved.', 'success');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to add visited place.';
      setPlaceFormError(message);
      showToast(message, 'error');
    } finally {
      setPlacesVisitedLoading(false);
    }
  };

  const handleDiaryEntryClick = (entry: any) => {
    if (!entry) return;
    // For rich diary entries (analysis, requests, complaint), we open the DiaryDetailModal
    if (['analysis_run', 'request_sent', 'response_received', 'complaint_filed'].includes(entry.event_type)) {
      setSelectedDiaryEntry(entry);
      return;
    }

    switch (entry.event_type) {
      case 'evidence_added':
        if (entry.ref_ids?.evidence_id) {
          const found = evidence.find((e: any) => e.evidence_id === entry.ref_ids.evidence_id || e._id === entry.ref_ids.evidence_id);
          if (found) setViewingEvidence(found);
        }
        break;
      case 'request_drafted':
        if (entry.ref_ids?.request_id) setViewingThreadId(entry.ref_ids.request_id);
        break;
      case 'analysis_run':
      case 'suggestion_generated':
        if (entry.ref_ids?.snapshot_id) setViewingSnapshotId(entry.ref_ids.snapshot_id);
        break;
      case 'checklist_step_completed':
        if (entry.ref_ids?.step_id) setViewingStepId(entry.ref_ids.step_id);
        break;
      case 'escalation_raised':
        // assuming we might have an escalation object to view in the future
        break;
    }
  };

  const handleCorrectSnapshot = async (message: string) => {
    if (!snapshot) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/analysis/${snapshot.snapshot_id}/correct`, {
        correction_message: message,
      });
      await fetchWorkspaceData();
    } catch (error) {
      console.error('Failed to correct snapshot', error);
      alert('Failed to correct snapshot.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerAnalysis = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/analyze`, { language });
      // SSE in AnalysisPanel handles progress — no polling loop needed here
    } catch (error) {
      console.error('Failed to trigger analysis', error);
      alert('Failed to trigger analysis.');
    } finally {
      setActionLoading(false);
    }
  };

  const findMatchingParticipant = (recommendation: any) => {
    if (!Array.isArray(participants) || participants.length === 0) return null;

    const recommendationRoles = Array.isArray(recommendation?.roles) ? recommendation.roles : [];
    return participants.find((participant) => {
      const nameMatches = String(participant?.name || '').trim().toLowerCase() === String(recommendation?.name || '').trim().toLowerCase();
      const participantRoles = Array.isArray(participant?.roles) ? participant.roles : [];
      const hasRoleOverlap = recommendationRoles.some((role: string) => participantRoles.includes(role));
      return nameMatches && hasRoleOverlap;
    }) || null;
  };

  const handleAttachSectionsToParticipant = async (participantId: string, sections: any[]) => {
    setActionLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/participants/${participantId}/sections/attach`, {
        sections,
      });
      showToast('Section attachment saved for the participant.', 'success');
      await fetchWorkspaceData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to attach sections to participant.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAttachEvidenceSections = async (evidenceId: string, sections: any[]) => {
    setActionLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/evidence/${encodeURIComponent(evidenceId)}/sections/attach`, {
        sections,
      });
      showToast('Evidence sections attached successfully.', 'success');
      await fetchWorkspaceData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to attach sections to evidence.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRecommendedSection = async (recommendation: any, section: any) => {
    setActionLoading(true);
    try {
      let participant = findMatchingParticipant(recommendation);

      if (!participant) {
        const approvalResponse = await apiClient.post(`/cases/${caseId}/participants/recommendations/approve`, {
          recommendation,
          snapshot_id: snapshot?.snapshot_id,
        });
        participant = approvalResponse.data.data;
      }

      await apiClient.post(`/cases/${caseId}/participants/${participant.participant_id}/sections/attach`, {
        sections: [section],
      });

      showToast(`Attached ${section.code} to ${participant.name}.`, 'success');
      await fetchWorkspaceData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to accept and attach the recommended section.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveParticipant = async (recommendation: any) => {
    setActionLoading(true);
    try {
      const participant = findMatchingParticipant(recommendation);
      if (participant) {
        showToast('Participant is already approved.', 'info');
        return;
      }

      await apiClient.post(`/cases/${caseId}/participants/recommendations/approve`, {
        recommendation,
        snapshot_id: snapshot?.snapshot_id,
      });

      showToast(`Added ${recommendation.name} to the case.`, 'success');
      await fetchWorkspaceData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to approve the participant.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAttachReasoning = async (recommendation: any, reasoningContent: string) => {
    setActionLoading(true);
    try {
      // Find or create the participant first
      let participant = findMatchingParticipant(recommendation);
      if (!participant) {
        const approvalResponse = await apiClient.post(`/cases/${caseId}/participants/recommendations/approve`, {
          recommendation,
          snapshot_id: snapshot?.snapshot_id,
        });
        participant = approvalResponse.data.data;
      }

      await apiClient.post(`/cases/${caseId}/participants/${participant.participant_id}/reasoning`, {
        content: reasoningContent,
        source: 'ai',
      });

      showToast(`AI reasoning attached to ${participant.name}.`, 'success');
      await fetchWorkspaceData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to attach reasoning.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getDiaryPreviewUrl = (url: string) => {
    if (!url) return url;
    return url.replace('/upload/fl_attachment/', '/upload/');
  };

  const departmentThreadCount = threads.filter((t: any) => t.request_type !== 'citizen_request').length;
  const citizenThreadCount = threads.filter((t: any) => t.request_type === 'citizen_request').length;

  const tabs = [
    { id: 'analysis', label: 'AI Analysis', icon: <Bot size={15} /> },
    { id: 'checklist', label: 'Investigation Checklist', icon: <ClipboardList size={15} />, badge: checklist?.steps?.filter((s: any) => s.status !== 'completed').length },
    { id: 'diary', label: 'Case Diary', icon: <BookOpen size={15} />, badge: diaryEntries.length },
    { id: 'placesVisited', label: 'Places Visited', icon: <MapPin size={15} />, badge: placesVisited.length },
    { id: 'requests', label: 'Requests', icon: <Send size={15} />, badge: departmentThreadCount + citizenThreadCount || undefined },
    { id: 'evidence', label: 'Evidence', icon: <FolderOpen size={15} />, badge: evidence.length || undefined },
    { id: 'participants', label: 'Case Participants', icon: <Users size={15} />, badge: participants.length || undefined },
    { id: 'complaint', label: 'Original Complaint', icon: <FileText size={15} /> },
    { id: 'case_understanding', label: 'Case Understanding', icon: <Brain size={15} /> },
    { id: 'timeline', label: 'Timeline', icon: <Clock size={15} />, badge: caseUnderstanding?.timeline?.length || undefined },
    { id: 'custody', label: 'Custody', icon: <Shield size={15} />, badge: warrants.filter((w: any) => ['draft','sent_to_magistrate','approved','in_custody'].includes(w.status)).length || undefined },
    { id: 'graph', label: 'Case Graph', icon: <Network size={15} /> },
    { id: 'room', label: 'Private Room', icon: <MessageSquare size={15} /> },
  ];

  if (loading && !snapshot && !checklist && diaryEntries.length === 0) {
    return (
      <div className="py-20 flex justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0" style={{ minHeight: '600px' }}>
      {/* Main workspace — takes all available width */}
      <div className="w-full min-w-0 space-y-4">
      {/* Tab Content */}
      <div className="min-h-[500px]">
        {activeTab === 'graph' && (
          <CaseCorkboard caseId={caseId} refreshTrigger={refreshTrigger} />
        )}

        {activeTab === 'room' && (
          <CaseRoomChat caseId={caseId} />
        )}

        {activeTab === 'analysis' && (
          <AnalysisPanel
            caseId={caseId}
            snapshot={snapshot}
            loading={actionLoading && !snapshot}
            participants={participants}
            evidence={evidence}
            onCorrectSnapshot={handleCorrectSnapshot}
            onTriggerAnalysis={handleTriggerAnalysis}
            onAnalysisComplete={fetchWorkspaceData}
            onAttachSectionsToParticipant={handleAttachSectionsToParticipant}
            onAttachEvidenceSections={handleAttachEvidenceSections}
            onAcceptRecommendedSection={handleAcceptRecommendedSection}
            onApproveParticipant={handleApproveParticipant}
            onAttachReasoning={handleAttachReasoning}
            actionLoading={actionLoading}
          />
        )}

          {activeTab === 'checklist' && (
            <ChecklistPanel
              checklist={checklist}
              onOpenComposer={openComposer}
              evidenceList={evidence}
              caseId={caseId}
              onRefresh={fetchWorkspaceData}
            />
          )}

          {activeTab === 'diary' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated/80 p-5 text-text-primary md:flex-row md:items-end md:justify-between shadow-xs">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">Official Daily Diary</h3>
                    <p className="mt-1 text-sm text-text-secondary">Generate a formal draft from the latest case context and finalize it for the record.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={diaryDate}
                      onChange={(e) => setDiaryDate(e.target.value)}
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary font-mono"
                    />
                    <button
                      onClick={handleGenerateDiaryDraft}
                      disabled={diaryDraftLoading}
                      className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                    >
                      {diaryDraftLoading ? 'Working…' : 'Generate Draft'}
                    </button>
                    {diaryDraft && (
                      <button
                        onClick={handleSaveDiaryDraft}
                        disabled={diaryDraftLoading}
                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-text-primary hover:bg-surface-elevated disabled:cursor-not-allowed transition-all"
                      >
                        {diaryDraftLoading ? 'Saving…' : 'Save Draft'}
                      </button>
                    )}
                  </div>
                </div>

                {diaryDraftError && <p className="mt-3 text-sm font-bold text-semantic-critical">{diaryDraftError}</p>}

                {diaryDraft && (
                  <div className="mt-4 rounded-xl border border-border bg-surface-elevated/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-text-primary">{diaryDraft.title}</p>
                        <p className="text-xs font-mono font-bold uppercase tracking-wide text-text-secondary">Status: {diaryDraft.status || 'draft'}</p>
                      </div>
                      <button
                        onClick={handleFinalizeDiaryDraft}
                        disabled={diaryDraftLoading}
                        className="rounded-xl border border-semantic-success/30 bg-semantic-success/10 px-3.5 py-2 text-sm font-bold text-semantic-success hover:bg-semantic-success/20 disabled:cursor-not-allowed transition-all"
                      >
                        {diaryDraftLoading ? 'Saving…' : 'Finalize'}
                      </button>
                    </div>
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">Official Case Diary Form (16 Standard Fields)</p>
                          <p className="text-xs text-text-secondary mt-0.5">Edit any values before finalization. Generated PDFs format these fields into official Police Roznamcha tables.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Title</label>
                          <input
                            value={diaryForm.title}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, title: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Investigation Officer</label>
                          <input
                            value={diaryForm.officialOfficerId}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, officialOfficerId: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Crime Register No. and Section</label>
                          <input
                            value={diaryForm.crimeRegisterNumber}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, crimeRegisterNumber: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Investigation Start & End Time (Field 14)</label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              placeholder="Start (e.g. 19/40)"
                              value={diaryForm.investigationStartTime}
                              onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, investigationStartTime: e.target.value }))}
                              className="w-1/2 rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                            />
                            <span className="text-xs text-text-secondary font-medium">to</span>
                            <input
                              placeholder="End (e.g. 23/00)"
                              value={diaryForm.investigationEndTime}
                              onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, investigationEndTime: e.target.value }))}
                              className="w-1/2 rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Custody Status (Field 7a)</label>
                          <input
                            placeholder="e.g. ----- or In Police Custody"
                            value={diaryForm.custodyStatus}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, custodyStatus: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Magisterial Custody Date (Field 7b)</label>
                          <input
                            placeholder="e.g. -----"
                            value={diaryForm.magisterialCustodyDate}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, magisterialCustodyDate: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Property Stolen</label>
                          <input
                            value={diaryForm.propertyStolen}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, propertyStolen: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">Property Recovered</label>
                          <input
                            value={diaryForm.propertyRecovered}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, propertyRecovered: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-primary"
                          />
                        </div>
                        <div className="lg:col-span-2 rounded-xl border border-border bg-surface-elevated/40 p-4 shadow-xs">
                          <label className="text-[11px] font-bold uppercase tracking-wide text-brand-primary">Record of Investigation (Gujarati-English Transliterated)</label>
                          <textarea
                            value={diaryForm.recordOfInvestigationGujEn}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, recordOfInvestigationGujEn: e.target.value }))}
                            rows={6}
                            className="mt-2 w-full rounded-xl border border-border bg-input-bg p-3 text-xs text-text-primary font-mono leading-relaxed focus:border-brand-primary shadow-inner"
                            placeholder="Enter the Gujarati-English narrative for the official diary."
                          />
                        </div>
                        <div className="lg:col-span-2 rounded-xl border border-border bg-surface-elevated/40 p-4 shadow-xs">
                          <label className="text-[11px] font-bold uppercase tracking-wide text-brand-primary">Record of Investigation (English Version)</label>
                          <textarea
                            value={diaryForm.recordOfInvestigationEn}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, recordOfInvestigationEn: e.target.value }))}
                            rows={6}
                            className="mt-2 w-full rounded-xl border border-border bg-input-bg p-3 text-xs text-text-primary font-mono leading-relaxed focus:border-brand-primary shadow-inner"
                            placeholder="Enter the English version for the final official record."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-text-primary">Finalized Case Diary Records</p>
                      <p className="text-xs text-text-secondary">Preview or download official bilingual (Gujarati-English & English) PDF copies.</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-lg border border-brand-primary/20">{diaryHistory.length} items</span>
                  </div>

                  {diaryHistory.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-surface-elevated/40 px-4 py-6 text-center text-sm text-text-muted">
                      No finalized case diary PDFs generated yet. Finalize a draft above to render official PDFs.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {diaryHistory.map((record) => {
                        const gujEnUrl = record.pdf_url_guj_en || record.pdf_url;
                        const enUrl = record.pdf_url_en;

                        return (
                          <div key={record.diary_id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated/70 p-4 md:flex-row md:items-center md:justify-between shadow-xs">
                            <div>
                              <p className="font-bold text-text-primary">{record.title || `Case Diary No. ${record.diary_number}`}</p>
                              <p className="text-xs text-text-secondary">
                                Date: <span className="font-mono">{new Date(record.diary_date).toLocaleDateString('en-IN')}</span> &bull; Status: <span className="font-extrabold uppercase text-semantic-success">{record.status || 'completed'}</span>
                              </p>
                              {record.crime_register_number && (
                                <p className="text-xs text-text-secondary font-mono">CR No.: {record.crime_register_number}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {gujEnUrl ? (
                                <div className="flex items-center gap-1.5 bg-surface p-1.5 rounded-xl border border-border">
                                  <span className="text-[10px] font-extrabold text-text-secondary px-1 uppercase">Guj-Eng:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewPdfUrl(gujEnUrl);
                                      setIsDiaryPreviewOpen(true);
                                    }}
                                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/20"
                                  >
                                    Preview
                                  </button>
                                  <a
                                    href={gujEnUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download
                                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-semantic-success bg-semantic-success/10 hover:bg-semantic-success/20 border border-semantic-success/20">
                                    Download
                                  </a>
                                </div>
                              ) : (
                                <span className="rounded-xl bg-semantic-warning/10 border border-semantic-warning/30 px-3 py-1.5 text-xs font-bold text-semantic-warning">Guj-Eng PDF Pending</span>
                              )}

                              {enUrl ? (
                                <div className="flex items-center gap-1.5 bg-surface p-1.5 rounded-xl border border-border">
                                  <span className="text-[10px] font-extrabold text-text-secondary px-1 uppercase">English:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewPdfUrl(enUrl);
                                      setIsDiaryPreviewOpen(true);
                                    }}
                                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/20"
                                  >
                                    Preview
                                  </button>
                                  <a
                                    href={enUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download
                                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-semantic-success bg-semantic-success/10 hover:bg-semantic-success/20 border border-semantic-success/20">
                                    Download
                                  </a>
                                </div>
                              ) : (
                                <span className="rounded-xl bg-semantic-warning/10 border border-semantic-warning/30 px-3 py-1.5 text-xs font-bold text-semantic-warning">English PDF Pending</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <CaseDiaryFeed entries={diaryEntries} onEntryClick={handleDiaryEntryClick} />
            </div>
          )}

          {activeTab === 'placesVisited' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">Places Visited</h3>
                    <p className="text-sm text-text-secondary">Manually recorded locations visited by the investigation officer. These entries are tied to the case diary timeline.</p>
                  </div>
                  <div className="rounded-xl bg-brand-primary/10 border border-brand-primary/20 px-3 py-1.5 text-xs font-mono font-bold text-brand-primary">
                    {placesVisited.length} recorded place{placesVisited.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-border bg-surface-elevated/70 p-5 shadow-xs">
                    <div className="mb-4 text-xs font-bold uppercase tracking-wider text-text-secondary">Add New Place</div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-text-secondary">Location</label>
                        <input
                          value={placeForm.address}
                          onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, address: e.target.value }))}
                          placeholder="123 Main Street, Surat, Gujarat"
                          className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-text-secondary">Visit Date</label>
                          <input
                            type="date"
                            value={placeForm.visitDate}
                            onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, visitDate: e.target.value }))}
                            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary font-mono focus:ring-2 focus:ring-brand-primary"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-text-secondary">Start Time</label>
                            <input
                              type="time"
                              value={placeForm.startTime}
                              onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, startTime: e.target.value }))}
                              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary font-mono focus:ring-2 focus:ring-brand-primary"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-text-secondary">End Time</label>
                            <input
                              type="time"
                              value={placeForm.endTime}
                              onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, endTime: e.target.value }))}
                              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary font-mono focus:ring-2 focus:ring-brand-primary"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-text-secondary">What Was Done</label>
                        <textarea
                          value={placeForm.whatWasDone}
                          onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, whatWasDone: e.target.value }))}
                          rows={4}
                          placeholder="Search, meet witness, collect evidence, record statement..."
                          className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary"
                        />
                      </div>
                      {placeFormError && <p className="text-sm font-bold text-semantic-critical">{placeFormError}</p>}
                      <button
                        type="button"
                        onClick={handleAddPlaceVisited}
                        disabled={placesVisitedLoading}
                        className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                      >
                        {placesVisitedLoading ? 'Saving…' : '+ Add Place Visited'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-elevated/70 p-5 shadow-xs">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="text-sm font-bold text-text-primary">Recent Visited Places</p>
                        <p className="text-xs text-text-secondary">These entries are visible in the case diary timeline once recorded.</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-text-secondary">{placesVisited.length} entries</span>
                    </div>

                    {placesVisited.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-surface-elevated/40 p-6 text-center text-sm text-text-secondary">
                        No visited places have been recorded yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {placesVisited.map((place) => (
                          <div key={place.place_id || place._id} className="rounded-2xl border border-border bg-surface-elevated/70 p-4 shadow-xs">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-bold text-text-primary">{place.address}</p>
                                <p className="text-xs text-text-secondary font-mono mt-1">
                                  {new Date(place.visit_date).toLocaleDateString('en-IN')} &bull; {place.start_time || 'N/A'} - {place.end_time || 'N/A'}
                                </p>
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-full px-2.5 py-0.5">Recorded</span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-text-secondary">{place.what_was_done || 'No description provided.'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <DepartmentInboxPanel
              threads={threads}
              onRefresh={fetchWorkspaceData}
              caseId={caseId}
              filter={threadFilter}
              onFilterChange={setThreadFilter}
            />
          )}

          {activeTab === 'evidence' && (
            <EvidencePanel evidence={evidence} caseId={caseId} onRefresh={fetchWorkspaceData} snapshot={snapshot} caseUnderstanding={caseUnderstanding} />
          )}

          {activeTab === 'participants' && (
            <ParticipantsPanel participants={participants} caseId={caseId} onRefresh={fetchWorkspaceData} />
          )}

          {activeTab === 'complaint' && (
            <OriginalComplaintPanel complaint={complaintData} />
          )}

          {activeTab === 'case_understanding' && (
            <CaseUnderstandingPanel caseUnderstanding={caseUnderstanding} />
          )}

          {activeTab === 'timeline' && (
            <TimelinePanel caseUnderstanding={caseUnderstanding} />
          )}
        </div>

        <RequestComposerModal
          isOpen={composerOpen}
          onClose={() => setComposerOpen(false)}
          caseId={caseId}
          stepId={composerStepId}
          departmentEntityId={composerDeptId}
          showToast={showToast}
          onSuccess={() => {
            setComposerOpen(false);
            setActiveTab('requests');
            fetchWorkspaceData();
          }}
        />

        <EvidenceViewerModal
          isOpen={!!viewingEvidence}
          onClose={() => setViewingEvidence(null)}
          evidence={evidence.find((e: any) => e.evidence_id === viewingEvidence) ?? null}
        />

        <ThreadViewerModal
          isOpen={!!viewingThreadId}
          onClose={() => setViewingThreadId(null)}
          caseId={caseId}
          threadId={viewingThreadId || ''}
        />

        <SnapshotDetailModal
          isOpen={!!viewingSnapshotId}
          onClose={() => setViewingSnapshotId(null)}
          caseId={caseId}
          snapshotId={viewingSnapshotId || ''}
        />

        <ComplaintDetailModal
          isOpen={!!viewingComplaintData}
          onClose={() => setViewingComplaintData(null)}
          complaintData={viewingComplaintData}
        />

        <StepDetailModal
          isOpen={!!viewingStepId}
          onClose={() => setViewingStepId(null)}
          caseId={caseId}
          stepId={viewingStepId || ''}
          evidenceList={evidence}
        />

        <DiaryDetailModal
          isOpen={!!selectedDiaryEntry}
          onClose={() => setSelectedDiaryEntry(null)}
          entry={selectedDiaryEntry}
        />

        <Modal
          isOpen={isDiaryPreviewOpen}
          onClose={() => setIsDiaryPreviewOpen(false)}
          title="Diary PDF Preview"
          size="lg"
        >
          <div className="space-y-4">
            {previewPdfUrl ? (
              <div className="h-[70vh] rounded-lg overflow-hidden border border-neutral-700">
                <iframe
                  src={getDiaryPreviewUrl(previewPdfUrl)}
                  title="Diary PDF Preview"
                  className="w-full h-full"
                />
              </div>
            ) : (
              <p className="text-sm text-text-secondary">No preview URL is available.</p>
            )}
            {previewPdfUrl && (
              <a
                href={getDiaryPreviewUrl(previewPdfUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-neutral-800"
              >
                Open in browser
              </a>
            )}
          </div>
        </Modal>
      </div>
      {/* Floating Copilot AI Widget with Smooth Expand/Collapse Animation */}
      {typeof window !== 'undefined' && createPortal(
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 pointer-events-none">
          {/* Animated Copilot Drawer Window */}
          <div
            className={`transition-all duration-300 transform-gpu origin-bottom-right shadow-2xl rounded-2xl overflow-hidden border border-border w-96 max-w-[92vw] h-[560px] max-h-[calc(100vh-6.5rem)] bg-surface ${copilotOpen
              ? 'scale-100 opacity-100 translate-y-0 shadow-glow pointer-events-auto'
              : 'scale-0 opacity-0 pointer-events-none translate-y-8'
              }`}
          >
            <CopilotSidebar
              caseId={caseId}
              onStateChangeApplied={fetchWorkspaceData}
              onClose={() => setCopilotOpen(false)}
            />
          </div>

          {/* Floating Round Launcher Button */}
          <button
            onClick={() => setCopilotOpen((prev) => !prev)}
            className={`h-14 w-14 rounded-full bg-brand-primary text-white shadow-xl hover:shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center border-2 border-white/20 relative group pointer-events-auto ${copilotOpen ? 'rotate-90 bg-surface-elevated text-text-primary border-border' : 'animate-pulse'
              }`}
            title={copilotOpen ? 'Close Copilot' : 'Open Copilot'}
          >
            {copilotOpen ? (
              <span className="text-2xl font-bold">&times;</span>
            ) : (
              <>
                <Bot className="h-6 w-6 text-white group-hover:rotate-12 transition-transform duration-300" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-accent border border-white text-[8px] font-extrabold text-white items-center justify-center">AI</span>
                </span>
              </>
            )}
          </button>
        </div>,
        document.body
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}


// ─── Evidence Panel ────────────────────────────────────────────────────────

const evidenceTypeIcon: Record<string, string> = {
  bank_statement: '🏦',
  cdr: '📞',
  kyc_document: '🪪',
  screenshot: '🖼️',
  video: '🎥',
  audio: '🔊',
  transaction_log: '💳',
  other: '📄',
};

function EvidencePanel({ evidence, caseId, onRefresh, snapshot, caseUnderstanding }: { evidence: any[]; caseId: string; onRefresh: () => void; snapshot?: any; caseUnderstanding?: import('@/components/case-understanding/CaseUnderstandingView').CaseUnderstandingData | null }) {
  const [selectedEvidence, setSelectedEvidence] = React.useState<any | null>(null);
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const requestedEvidence = snapshot?.missing_information || [];

  if (evidence.length === 0 && requestedEvidence.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <FolderOpen className="h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-text-secondary">No evidence attached yet</p>
        <p className="text-xs text-neutral-400 max-w-xs">
          Evidence items added via the investigation workflow appear here.
        </p>
        <button
          onClick={() => setAddModalOpen(true)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Evidence
        </button>
        <AddEvidenceModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} caseId={caseId} onSuccess={onRefresh} />
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-text-primary">Case Evidence File</h3>
        <button
          onClick={() => setAddModalOpen(true)}
          className="px-3.5 py-1.5 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-brand-primary/90 transition-all shadow-xs"
        >
          + Add Attachment
        </button>
      </div>

      {/* ── Pending requested blocks ── */}
      {requestedEvidence.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {requestedEvidence.map((req: string, idx: number) => (
            <div key={`req-${idx}`} className="bg-surface-elevated/50 border border-dashed border-border rounded-2xl p-4 shadow-xs flex gap-3 opacity-60">
              <div className="text-2xl">⏳</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">Evidence Request - {idx + 1}</p>
                <p className="text-xs text-text-secondary capitalize">Requested / Yet to upload</p>
                <div className="mt-2">
                  <span className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border bg-surface text-text-secondary border-border">
                    PENDING FROM COMPLAINANT
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Evidence cards — from CI evidence_intelligence if available, else raw list ── */}
      {(() => {
        const ciItems: any[] = caseUnderstanding?.evidence_intelligence || caseUnderstanding?.evidence_analysis || [];

        // Helper: find matching raw evidence by evidence_id or filename
        const findRaw = (ciItem: any): any | null =>
          evidence.find((e: any) =>
            (e.evidence_id && ciItem.evidence_id && e.evidence_id === ciItem.evidence_id) ||
            (e.originalFilename && ciItem.filename && e.originalFilename === ciItem.filename) ||
            (e.title && ciItem.filename && e.title === ciItem.filename)
          ) || null;

        const importanceBadgeClass = (imp: string) => {
          switch (imp?.toLowerCase()) {
            case 'critical': return 'bg-semantic-critical/10 text-semantic-critical border-semantic-critical/30';
            case 'high': return 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30';
            case 'medium': return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
            default: return 'bg-surface text-text-secondary border-border';
          }
        };

        // ── Render from CI evidence_intelligence ──
        if (ciItems.length > 0) {
          // De-duplicate by filename/evidence_id
          const seen = new Set<string>();
          const unique = ciItems.filter((ci: any) => {
            const key = ci.filename || ci.evidence_id;
            if (key && seen.has(key)) return false;
            if (key) seen.add(key);
            return true;
          });

          const importanceBorder = (imp: string) => {
            switch (imp?.toLowerCase()) {
              case 'critical': return 'border-l-semantic-critical';
              case 'high': return 'border-l-semantic-warning';
              case 'medium': return 'border-l-brand-primary';
              default: return 'border-l-brand-primary/40';
            }
          };

          const importanceBadge = (imp: string) => {
            switch (imp?.toLowerCase()) {
              case 'critical': return 'bg-semantic-critical/10 text-semantic-critical border-semantic-critical/30';
              case 'high': return 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30';
              case 'medium': return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
              default: return 'bg-surface text-text-secondary border-border';
            }
          };

          // Lucide icon by file extension
          const FileIcon = (filename: string) => {
            const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext))
              return <FileImage size={18} className="text-brand-primary" />;
            if (['mp4', 'mov', 'avi', 'webm'].includes(ext))
              return <FileVideo size={18} className="text-brand-primary" />;
            if (['mp3', 'wav', 'ogg', 'aac'].includes(ext))
              return <FileAudio size={18} className="text-brand-primary" />;
            return <File size={18} className="text-brand-primary" />;
          };

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {unique.map((ci: any, idx: number) => {
                const caption = ci.caption || ci.filename || `Evidence ${idx + 1}`;
                const summary = (ci.summary || '').trim();
                const supports: string[] = ci.supports || ci.allegations_supported || [];
                const rawEv = findRaw(ci);

                return (
                  <div
                    key={ci.evidence_id || idx}
                    onClick={() => setSelectedEvidence(rawEv || ci)}
                    className={`bg-surface border border-border border-l-4 ${importanceBorder(ci.importance)} rounded-2xl p-4 cursor-pointer hover:border-brand-primary/50 hover:shadow-md transition-all group flex flex-col gap-2.5 shadow-xs`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                        {FileIcon(ci.filename || '')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-text-primary leading-snug line-clamp-2 group-hover:text-brand-primary transition-colors">
                            {caption}
                          </p>
                          <span className={`flex-shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wide ${importanceBadge(ci.importance)}`}>
                            {ci.importance || 'medium'}
                          </span>
                        </div>
                        {ci.filename && ci.filename !== caption && (
                          <p className="text-[10px] text-text-secondary mt-0.5 truncate font-mono">{ci.filename}</p>
                        )}
                      </div>
                    </div>

                    {/* Summary */}
                    {summary && (
                      <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                        {summary}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                      <span className="font-bold uppercase tracking-wider">Confidence Score:</span>
                      <span className="font-bold text-text-primary">{Math.round(Number(ci.confidence ?? 0) > 1 ? Number(ci.confidence ?? 0) : (Number(ci.confidence ?? 0) * 100))}%</span>
                    </div>

                    {/* Supports allegations */}
                    {supports.length > 0 && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Supports Allegations</p>
                        <div className="flex flex-wrap gap-1.5">
                          {supports.map((alg: string, aIdx: number) => (
                            <span key={aIdx} className="px-2.5 py-0.5 text-[10px] bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-full font-bold">
                              {alg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
                      {rawEv ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-semantic-success bg-semantic-success/10 px-2.5 py-0.5 rounded-full border border-semantic-success/30">
                          <CheckCircle2 size={11} className="text-semantic-success" />
                          Full details available
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-text-secondary">
                          <AlertCircle size={11} />
                          AI summary only
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[11px] font-bold text-brand-primary group-hover:underline transition-colors">
                        View Details <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // ── Fallback: raw evidence grid (original design) ──
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evidence.map((ev: any) => (
              <div
                key={ev.evidence_id || ev._id}
                onClick={() => setSelectedEvidence(ev)}
                className="bg-surface border border-border rounded-2xl p-4 shadow-xs flex gap-3.5 cursor-pointer hover:border-brand-primary/50 hover:shadow-md transition-all group"
              >
                <div className="text-2xl group-hover:scale-110 transition-transform">{evidenceTypeIcon[ev.type] ?? '📄'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-primary truncate group-hover:text-brand-primary transition-colors">{ev.title || `Evidence Item ${ev.status === "processing" ? "(Processing)" : ""}`}</p>
                  <p className="text-xs text-text-secondary capitalize">{ev.type?.replace(/_/g, ' ')}</p>
                  <div className="mt-1">
                    <span className="text-[10px] font-mono font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md border border-border">
                      Added by {ev.source?.replace(/_/g, ' ') || 'complainant'} on {new Date(ev.collected_at || ev.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  {ev.ai_description && <p className="text-xs text-text-secondary mt-2 line-clamp-2">{ev.ai_description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ev.status === 'verified' ? 'bg-semantic-success/10 text-semantic-success border-semantic-success/30' : 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30'
                      }`}>
                      {ev.status === 'verified' ? '✓ Verified' : 'Unverified'}
                    </span>
                    <span className="text-[10px] font-bold text-text-primary">
                      Confidence Score: {Math.round(Number(ev.confidence_score ?? 0))}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}


      <EvidenceViewerModal
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        evidence={selectedEvidence}
      />
      <AddEvidenceModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        caseId={caseId}
        onSuccess={onRefresh}
      />

      {/* ── Missing Info & Evidence (from Case Intelligence) ── */}
      {(() => {
        const missingItems = caseUnderstanding?.missing_information_and_evidence || [
          ...(caseUnderstanding?.missing_information || []).map((m: any) => ({ title: m.item, description: m.reason, importance: m.importance })),
          ...(caseUnderstanding?.missing_evidence || []).map((m: any) => ({ title: m.evidence_name, description: m.reason_relevant, importance: m.importance })),
        ];
        if (!missingItems.length) return null;
        return (
          <div className="mt-8">
            <Card className="p-6">
              <CardHeader title="Missing Information & Evidence (Complainant Clarifications)" />
              <div className="mt-4 space-y-3">
                {missingItems.map((item: any, i: number) => (
                  <MissingInfoCardIO
                    key={i}
                    item={item}
                    caseId={caseId}
                  />
                ))}
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ── Contradictions (from Case Intelligence) ── */}
      {(() => {
        const contradictions = caseUnderstanding?.contradictions;
        if (!contradictions || contradictions.length === 0) return (
          <div className="mt-6">
            <Card className="p-6">
              <CardHeader title="Contradictions & Discrepancies" />
              <div className="mt-4">
                <p className="text-xs font-bold text-semantic-success bg-semantic-success/10 p-3.5 rounded-xl border border-semantic-success/30 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-semantic-success flex-shrink-0" />
                  No contradictions or conflicts detected across complaint and evidence.
                </p>
              </div>
            </Card>
          </div>
        );
        return (
          <div className="mt-6">
            <Card className="p-6">
              <CardHeader title="Contradictions & Discrepancies" />
              <div className="mt-4 space-y-3">
                {contradictions.map((c: any, i: number) => {
                  const evIds = c.related_evidence_ids || c.involved_evidence_ids || [];
                  return (
                    <div key={i} className="p-3.5 border border-semantic-critical/30 bg-semantic-critical/10 rounded-xl text-xs text-semantic-critical font-bold space-y-1">
                      <p>• {c.description}</p>
                      {evIds.length > 0 && (
                        <p className="text-[11px] font-mono text-semantic-critical/80">Involved Evidence IDs: {evIds.join(', ')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        );
      })()}
    </>
  );
}

// ─── Missing Info Card (IO Evidence Panel) ────────────────────────────────────
function MissingInfoCardIO({ item, caseId }: { item: { title: string; description: string; importance: string }; caseId: string }) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'sent'>('idle');

  React.useEffect(() => {
    if (!caseId) return;
    apiClient.get(`/cases/${caseId}/requests`).then((res) => {
      const requests = res.data?.data ?? [];
      const isSent = requests.some((req: any) =>
        req.request_type === 'citizen_request' &&
        (req.draft_content?.includes(item.title) || req.step_title?.includes(item.title))
      );
      if (isSent) setStatus('sent');
    }).catch(() => { });
  }, [caseId, item.title]);

  const handleRequest = async () => {
    if (status !== 'idle') return;
    setStatus('loading');
    try {
      await apiClient.post(`/cases/${caseId}/citizen-request/missing-info`, {
        item: item.title,
        reason: item.description,
        importance: item.importance,
        type: 'missing_information_and_evidence',
      });
      setStatus('sent');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send request to complainant');
      setStatus('idle');
    }
  };

  return (
    <div className="p-4 border border-semantic-warning/30 bg-semantic-warning/10 rounded-xl text-xs space-y-2.5">
      <div className="flex justify-between items-start gap-2">
        <span className="font-bold text-text-primary text-sm">{item.title}</span>
        <span className="uppercase text-[10px] font-extrabold bg-semantic-warning/20 text-semantic-warning border border-semantic-warning/30 px-2.5 py-0.5 rounded-md shrink-0">
          {item.importance}
        </span>
      </div>
      <p className="text-text-secondary leading-relaxed font-medium">{item.description}</p>
      <div className="pt-1">
        <button
          onClick={handleRequest}
          disabled={status !== 'idle'}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${status === 'sent'
            ? 'bg-semantic-success/20 text-semantic-success border border-semantic-success/30 cursor-default'
            : status === 'loading'
              ? 'bg-surface-elevated text-text-muted border border-border cursor-not-allowed'
              : 'bg-brand-primary text-white hover:bg-brand-primary/90 shadow-xs cursor-pointer'
            }`}
        >
          {status === 'sent' ? (
            <><CheckCheck size={13} /> Requested from Complainant</>
          ) : status === 'loading' ? (
            <><Loader2 size={13} className="animate-spin" /> Sending...</>
          ) : (
            <><Send size={13} /> Request from Complainant</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Participants Panel ──────────────────────────────────────────────────────

function ParticipantsPanel({ participants, caseId, onRefresh }: { participants: any[]; caseId: string; onRefresh: () => void }) {
  const [roleFilter, setRoleFilter] = React.useState<string>('All');
  const [selectedParticipant, setSelectedParticipant] = React.useState<any | null>(null);
  const [promotingId, setPromotingId] = React.useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [editingParticipant, setEditingParticipant] = React.useState<any | null>(null);
  const [deleteConfirming, setDeleteConfirming] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const uniqueRoles = Array.from(new Set(participants.flatMap((p) => p.roles || [])));

  const filteredParticipants = roleFilter === 'All'
    ? participants
    : participants.filter((p) => (p.roles || []).includes(roleFilter));

  const handlePromote = async (e: React.MouseEvent, p: any) => {
    e.stopPropagation();
    setPromotingId(p.participant_id);
    try {
      await apiClient.patch(`/cases/${caseId}/participants/${p.participant_id}/promote-to-accused`);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to promote participant.');
    } finally {
      setPromotingId(null);
    }
  };

  const handleDelete = async (participantId: string) => {
    setLoading(true);
    try {
      await apiClient.delete(`/cases/${caseId}/participants/${participantId}`);
      setDeleteConfirming(null);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete participant.');
    } finally {
      setLoading(false);
    }
  };

  if (participants.length === 0 && !isAddModalOpen) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <Users className="h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-text-secondary">No participants found</p>
        <p className="text-xs text-neutral-400 max-w-xs">
          Participants approved via the AI analysis will appear here.
        </p>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Participant
        </button>
        <AddParticipantModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          caseId={caseId}
          onSuccess={() => {
            setIsAddModalOpen(false);
            onRefresh();
          }}
        />
      </div>
    );
  }

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case 'Accused': return 'bg-semantic-critical/10 text-semantic-critical border-semantic-critical/30';
      case 'Suspect': return 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30';
      case 'Victim': return 'bg-semantic-success/10 text-semantic-success border-semantic-success/30';
      case 'Witness': return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
      case 'Complainant': return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
      default: return 'bg-surface-elevated text-text-secondary border-border';
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-xs font-bold border border-border rounded-xl px-3 py-2 bg-input-bg text-text-primary focus:border-brand-primary shadow-xs"
        >
          <option value="All">All Roles</option>
          {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3.5 py-2 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Users size={14} /> + Add Participant
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredParticipants.map((p: any) => {
          const isSuspect = (p.roles || []).includes('Suspect');
          const isAccused = (p.roles || []).includes('Accused');
          const promoting = promotingId === p.participant_id;

          return (
            <div
              key={p.participant_id || p._id}
              className="bg-surface border border-border rounded-2xl p-4 shadow-xs hover:border-brand-primary/40 transition-all group relative space-y-3"
            >
              <div className="flex justify-between items-start gap-2">
                <h4
                  className="text-sm font-bold text-text-primary cursor-pointer group-hover:text-brand-primary transition-colors flex-1"
                  onClick={() => setSelectedParticipant(p)}
                >
                  {p.name}
                </h4>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditingParticipant(p);
                      setIsEditModalOpen(true);
                    }}
                    className="p-1.5 text-text-secondary hover:text-brand-primary hover:bg-surface-elevated rounded-lg transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  {deleteConfirming === p.participant_id ? (
                    <div className="absolute right-3 top-12 bg-surface border border-semantic-critical/30 rounded-xl p-3 shadow-xl z-20 whitespace-nowrap">
                      <p className="text-xs font-bold text-semantic-critical mb-2">Delete Participant?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(p.participant_id)}
                          disabled={loading}
                          className="px-2.5 py-1 text-xs font-bold bg-semantic-critical text-white rounded-lg hover:bg-semantic-critical/90 disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirming(null)}
                          className="px-2.5 py-1 text-xs font-bold bg-surface-elevated text-text-primary rounded-lg border border-border"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirming(p.participant_id)}
                      className="p-1.5 text-text-secondary hover:text-semantic-critical hover:bg-surface-elevated rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(p.roles || []).map((role: string) => (
                  <span key={role} className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg border ${roleBadgeColor(role)}`}>
                    {role}
                  </span>
                ))}
              </div>

              {(p.contact?.phone || p.contact?.email) && (
                <p className="text-[11px] text-text-secondary font-medium">
                  {p.contact.phone && `Phone: ${p.contact.phone}`}
                  {p.contact.phone && p.contact.email && ' · '}
                  {p.contact.email && `Email: ${p.contact.email}`}
                </p>
              )}

              {isSuspect && !isAccused && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePromote(e, p);
                  }}
                  disabled={promoting}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl bg-semantic-critical hover:bg-semantic-critical/90 text-white disabled:opacity-60 transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Scale size={13} /> {promoting ? '...' : 'Promote to Accused'}
                </button>
              )}

              <button
                className="text-xs font-bold text-brand-primary hover:underline cursor-pointer inline-flex items-center gap-1 pt-1"
                onClick={() => setSelectedParticipant(p)}
              >
                Click for full details &rarr;
              </button>
            </div>
          );
        })}
      </div>

      {/* Participant Detail Modal */}
      {selectedParticipant && (
        <ParticipantDetailModal
          participant={selectedParticipant}
          caseId={caseId}
          onClose={() => setSelectedParticipant(null)}
          onRefresh={() => {
            onRefresh();
            // keep modal open but data refreshes underneath
          }}
          onEdit={(p) => {
            setEditingParticipant(p);
            setSelectedParticipant(null);
            setIsEditModalOpen(true);
          }}
          onDelete={(p) => {
            setSelectedParticipant(null);
            setDeleteConfirming(p.participant_id);
          }}
        />
      )}

      {/* Add Participant Modal */}
      <AddParticipantModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        caseId={caseId}
        onSuccess={() => {
          setIsAddModalOpen(false);
          onRefresh();
        }}
      />

      {/* Edit Participant Modal */}
      {editingParticipant && (
        <EditParticipantModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingParticipant(null);
          }}
          participant={editingParticipant}
          caseId={caseId}
          onSuccess={() => {
            setIsEditModalOpen(false);
            setEditingParticipant(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

// ─── Participant Detail Modal ────────────────────────────────────────────────

function ParticipantDetailModal({
  participant: p,
  caseId,
  onClose,
  onEdit,
  onDelete,
  onRefresh,
}: {
  participant: any;
  caseId: string;
  onClose: () => void;
  onEdit?: (p: any) => void;
  onDelete?: (p: any) => void;
  onRefresh?: () => void;
}) {
  const [stmtContent, setStmtContent] = React.useState('');
  const [stmtDate, setStmtDate] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [stmtLoading, setStmtLoading] = React.useState(false);

  // Audio transcription state
  const [transcribing, setTranscribing] = React.useState(false);
  const [transcribeError, setTranscribeError] = React.useState<string | null>(null);
  const audioInputRef = React.useRef<HTMLInputElement>(null);

  const [reasoningContent, setReasoningContent] = React.useState('');
  const [reasoningLoading, setReasoningLoading] = React.useState(false);
  const [editingReasoningId, setEditingReasoningId] = React.useState<string | null>(null);
  const [editingReasoningContent, setEditingReasoningContent] = React.useState('');

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case 'Accused': return 'bg-semantic-critical/10 text-semantic-critical border-semantic-critical/30';
      case 'Suspect': return 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30';
      case 'Victim': return 'bg-semantic-success/10 text-semantic-success border-semantic-success/30';
      case 'Witness': return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
      case 'Complainant': return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
      default: return 'bg-surface-elevated text-text-secondary border-border';
    }
  };

  const appliedSections: any[] = [
    ...(p.accusedProfile?.appliedSections || []),
    ...(p.suspectProfile?.appliedSections || []),
  ];

  const handleAddStatement = async () => {
    if (!stmtContent.trim() || !stmtDate) return;
    setStmtLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/participants/${p.participant_id}/statements`, {
        content: stmtContent.trim(),
        recordedAt: new Date(stmtDate).toISOString(),
      });
      setStmtContent('');
      setStmtDate(new Date().toISOString().slice(0, 16));
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add statement');
    } finally {
      setStmtLoading(false);
    }
  };

  const handleDeleteStatement = async (statementId: string) => {
    if (!confirm('Delete this statement?')) return;
    try {
      await apiClient.delete(`/cases/${caseId}/participants/${p.participant_id}/statements/${statementId}`);
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete statement');
    }
  };

  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setTranscribing(true);
    setTranscribeError(null);

    try {
      const form = new FormData();
      form.append('file', file);

      const res = await apiClient.post(
        `/cases/${caseId}/participants/${p.participant_id}/statements/transcribe`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      const { transcript, detectedLanguage, translatedText } = res.data.data;
      setStmtContent((prev) => {
        const base = prev.trim();
        return base ? `${base}\n\n${transcript}` : transcript;
      });

      if (translatedText && detectedLanguage && detectedLanguage !== 'en') {
        setTranscribeError(`Detected language: ${detectedLanguage}. English translation also available.`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Transcription failed.';
      setTranscribeError(msg);
    } finally {
      setTranscribing(false);
    }
  };

  const handleAddReasoning = async () => {
    if (!reasoningContent.trim()) return;
    setReasoningLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/participants/${p.participant_id}/reasoning`, {
        content: reasoningContent.trim(),
        source: 'officer',
      });
      setReasoningContent('');
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add reasoning');
    } finally {
      setReasoningLoading(false);
    }
  };

  const handleUpdateReasoning = async (reasoningId: string) => {
    if (!editingReasoningContent.trim()) return;
    setReasoningLoading(true);
    try {
      await apiClient.patch(`/cases/${caseId}/participants/${p.participant_id}/reasoning/${reasoningId}`, {
        content: editingReasoningContent.trim(),
      });
      setEditingReasoningId(null);
      setEditingReasoningContent('');
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update reasoning');
    } finally {
      setReasoningLoading(false);
    }
  };

  const handleDeleteReasoning = async (reasoningId: string) => {
    if (!confirm('Delete this reasoning entry?')) return;
    try {
      await apiClient.delete(`/cases/${caseId}/participants/${p.participant_id}/reasoning/${reasoningId}`);
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete reasoning');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0 bg-surface">
          <div>
            <h2 className="text-base font-bold text-text-primary">{p.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {(p.roles || []).map((role: string) => (
                <span key={role} className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg border ${roleBadgeColor(role)}`}>
                  {role}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button onClick={() => onEdit(p)} className="p-2 text-text-secondary hover:text-brand-primary hover:bg-surface-elevated rounded-full transition-colors cursor-pointer" title="Edit">
                <Pencil size={15} />
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(p)} className="p-2 text-text-secondary hover:text-semantic-critical hover:bg-surface-elevated rounded-full transition-colors cursor-pointer" title="Delete">
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-text-secondary hover:bg-surface-elevated rounded-full transition-colors cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-surface-elevated/30">
          {/* Contact */}
          {(p.contact?.phone || p.contact?.email || p.contact?.address) && (
            <section className="bg-surface border border-border rounded-xl p-3.5 space-y-1.5 shadow-xs">
              <h3 className="text-[11px] font-bold uppercase text-brand-primary tracking-wider">Contact Information</h3>
              <div className="text-xs text-text-primary space-y-1 font-medium">
                {p.contact.phone && <p>Phone: {p.contact.phone}</p>}
                {p.contact.email && <p>Email: {p.contact.email}</p>}
                {p.contact.address && <p>Address: {p.contact.address}</p>}
              </div>
            </section>
          )}

          {/* Identifiers */}
          {p.identifiers?.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase text-text-secondary tracking-wider">Identifiers</h3>
              <div className="flex flex-wrap gap-1.5">
                {p.identifiers.map((id: any, i: number) => (
                  <span key={i} className="text-xs bg-surface text-text-primary px-2.5 py-1 rounded-lg border border-border font-mono font-medium">
                    <span className="font-bold text-brand-primary">{id.type}:</span> {id.value}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Victim Profile */}
          {p.victimProfile && (p.victimProfile.injuryDetails || p.victimProfile.lossDetails) && (
            <section className="bg-semantic-success/10 border border-semantic-success/30 rounded-xl p-3.5 space-y-1 text-xs text-text-primary">
              <h3 className="text-[11px] font-bold uppercase text-semantic-success tracking-wider mb-1">Victim Profile</h3>
              {p.victimProfile.injuryDetails && <p><span className="font-bold">Injury:</span> {p.victimProfile.injuryDetails}</p>}
              {p.victimProfile.lossDetails && <p><span className="font-bold">Loss:</span> {p.victimProfile.lossDetails}</p>}
            </section>
          )}

          {/* Suspect Profile */}
          {p.suspectProfile && !(p.roles || []).includes('Accused') && (p.suspectProfile.motive || p.suspectProfile.alibi) && (
            <section className="bg-semantic-warning/10 border border-semantic-warning/30 rounded-xl p-3.5 space-y-1 text-xs text-text-primary">
              <h3 className="text-[11px] font-bold uppercase text-semantic-warning tracking-wider mb-1">Suspect Profile</h3>
              {p.suspectProfile.motive && <p><span className="font-bold">Motive:</span> {p.suspectProfile.motive}</p>}
              {p.suspectProfile.alibi && <p><span className="font-bold">Alibi:</span> {p.suspectProfile.alibi}</p>}
            </section>
          )}

          {/* Applied Legal Sections */}
          {appliedSections.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase text-brand-primary tracking-wider">Applied Legal Sections</h3>
              <div className="space-y-2">
                {appliedSections.map((sec: any, i: number) => (
                  <div key={i} className="bg-brand-primary/10 border border-brand-primary/30 rounded-xl p-3.5 text-xs">
                    <p className="font-bold text-brand-primary">{sec.code} — {sec.title}</p>
                    {sec.reason && <p className="text-text-primary mt-1 leading-relaxed">{sec.reason}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Complainant Profile */}
          {p.complainantProfile?.relationshipToIncident && (
            <section className="bg-surface border border-border rounded-xl p-3.5 text-xs text-text-primary">
              <h3 className="text-[11px] font-bold uppercase text-text-secondary tracking-wider mb-1">Complainant</h3>
              <p className="font-medium">Relation to Incident: {p.complainantProfile.relationshipToIncident}</p>
            </section>
          )}

          {/* ── Statements ──────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase text-brand-primary tracking-wider">Statements</h3>

            {/* Existing statements */}
            {Array.isArray(p.statements) && p.statements.length > 0 ? (
              <div className="space-y-2">
                {p.statements.map((stmt: any) => (
                  <div key={stmt.id} className="bg-surface border border-border rounded-xl p-3 text-xs shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-text-primary font-medium flex-1 leading-relaxed">{stmt.content}</p>
                      <button
                        onClick={() => handleDeleteStatement(stmt.id)}
                        className="text-text-secondary hover:text-semantic-critical transition-colors flex-shrink-0 p-1 cursor-pointer"
                        title="Delete statement"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="text-[10px] text-text-secondary font-mono mt-1">
                      {stmt.recordedAt ? new Date(stmt.recordedAt).toLocaleString('en-IN') : 'No date'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary italic">No statements recorded yet.</p>
            )}

            {/* Add statement form */}
            <div className="border border-border rounded-xl p-3.5 bg-surface space-y-2 shadow-xs">
              <p className="text-xs font-bold text-text-primary">Add New Statement</p>
              <textarea
                value={stmtContent}
                onChange={(e) => setStmtContent(e.target.value)}
                placeholder="Enter statement content..."
                rows={3}
                className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-3 text-xs font-medium placeholder:text-text-muted resize-none"
              />

              {/* Audio upload row */}
              <div className="flex items-center gap-2">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.webm,.opus,.aac"
                  className="hidden"
                  onChange={handleAudioFileChange}
                />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={transcribing}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${transcribing
                    ? 'bg-neutral-800 text-neutral-400 border-neutral-700 cursor-not-allowed'
                    : 'bg-neutral-900/50 text-purple-700 border-purple-300 hover:bg-neutral-900/50 cursor-pointer'
                    }`}
                  title="Upload audio file to auto-fill transcript"
                >
                  {transcribing ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Transcribing...
                    </>
                  ) : (
                    <>🎙️ Upload Audio</>
                  )}
                </button>
                <span className="text-[10px] text-neutral-400">MP3, WAV, OGG, M4A, FLAC, WEBM • max 50 MB</span>
              </div>

              {/* Transcription feedback */}
              {transcribeError && (
                <p className={`text-xs px-2 py-1 rounded ${transcribeError.startsWith('Detected language')
                  ? 'bg-blue-900/20 text-blue-400 border border-blue-100'
                  : 'bg-red-900/20 text-red-500 border border-red-100'
                  }`}>
                  {transcribeError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1">
                  <label className="text-[10px] text-text-secondary font-bold uppercase tracking-wider mb-1 block">Recorded At</label>
                  <input
                    type="datetime-local"
                    value={stmtDate}
                    onChange={(e) => setStmtDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-border rounded-xl bg-input-bg text-text-primary text-xs font-medium focus:border-brand-primary"
                  />
                </div>
                <button
                  onClick={handleAddStatement}
                  disabled={stmtLoading || !stmtContent.trim()}
                  className="self-end px-3.5 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {stmtLoading ? '...' : '+ Add Statement'}
                </button>
              </div>
            </div>
          </section>

          {/* ── Reasoning ───────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase text-brand-primary tracking-wider">Reasoning</h3>

            {/* Existing reasoning entries */}
            {Array.isArray(p.reasoning) && p.reasoning.length > 0 ? (
              <div className="space-y-2">
                {p.reasoning.map((r: any) => (
                  <div key={r.id} className="bg-surface border border-border rounded-xl p-3 text-xs shadow-xs">
                    {editingReasoningId === r.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingReasoningContent}
                          onChange={(e) => setEditingReasoningContent(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary p-3 text-xs font-medium"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateReasoning(r.id)}
                            disabled={reasoningLoading}
                            className="px-3 py-1.5 bg-brand-primary text-white text-xs font-bold rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 cursor-pointer"
                          >
                            {reasoningLoading ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingReasoningId(null); setEditingReasoningContent(''); }}
                            className="px-3 py-1.5 border border-border text-text-primary text-xs font-bold rounded-lg hover:bg-surface-elevated cursor-pointer">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${r.source === 'ai' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-semantic-success/10 text-semantic-success border-semantic-success/30'}`}>
                              {r.source === 'ai' ? 'AI Suggestion' : 'Officer Note'}
                            </span>
                            <span className="text-[10px] text-text-secondary font-mono">{new Date(r.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-text-primary font-medium leading-relaxed">{r.content}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingReasoningId(r.id); setEditingReasoningContent(r.content); }}
                            className="p-1 text-text-secondary hover:text-brand-primary transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteReasoning(r.id)}
                            className="p-1 text-text-secondary hover:text-semantic-critical transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary italic">No reasoning entries yet.</p>
            )}

            {/* Add reasoning form */}
            <div className="border border-border rounded-xl p-3.5 bg-surface space-y-2 shadow-xs">
              <p className="text-xs font-bold text-text-primary">Add Reasoning Note</p>
              <textarea
                value={reasoningContent}
                onChange={(e) => setReasoningContent(e.target.value)}
                placeholder="Add investigative reasoning or observation..."
                rows={3}
                className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-3 text-xs font-medium placeholder:text-text-muted resize-none"
              />
              <button
                onClick={handleAddReasoning}
                disabled={reasoningLoading || !reasoningContent.trim()}
                className="px-3.5 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                {reasoningLoading ? '...' : '+ Add Reasoning'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ─── Original Complaint Panel ──────────────────────────────────────────────

function OriginalComplaintPanel({ complaint }: { complaint: any | null }) {
  if (!complaint) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <FileText className="h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-text-secondary">Loading complaint details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-elevated/70 rounded-xl border border-border p-4 shadow-xs">
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <Calendar size={12} className="text-brand-primary" /> Date &amp; Time
          </p>
          <p className="text-sm font-bold text-text-primary">
            {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}
          </p>
        </div>
        <div className="bg-surface-elevated/70 rounded-xl border border-border p-4 shadow-xs">
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <MapPin size={12} className="text-brand-primary" /> Place of Occurrence
          </p>
          <p className="text-sm font-bold text-text-primary">{complaint.incidentPlace}</p>
        </div>
        <div className="bg-surface-elevated/70 rounded-xl border border-border p-4 shadow-xs">
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Category</p>
          <p className="text-sm font-bold text-brand-primary uppercase">
            {complaint.category?.replace('_', ' ') || 'Uncategorized'}
          </p>
        </div>
      </div>

      {/* Complainant */}
      <div className="bg-surface-elevated/70 rounded-xl border border-border p-5 shadow-xs space-y-1">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Complainant</p>
        <p className="text-sm font-bold text-text-primary">
          {complaint.citizen?.firstName} {complaint.citizen?.lastName}
        </p>
        <p className="text-xs text-text-secondary">{complaint.citizen?.phone}</p>
        <p className="text-xs text-text-secondary">{complaint.citizen?.email}</p>
      </div>

      {/* Brief Summary */}
      <div className="bg-surface-elevated/70 rounded-xl border border-border p-5 shadow-xs">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Brief Summary</p>
        <p className="text-sm font-bold text-text-primary">{complaint.shortDescription}</p>
      </div>

      {/* Detailed Description */}
      <div className="bg-surface-elevated/70 rounded-xl border border-border p-5 shadow-xs">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Detailed Description</p>
        <p className="text-sm text-text-primary whitespace-pre-line leading-relaxed">
          {complaint.detailedDescription || <span className="text-text-muted italic">No detailed description provided.</span>}
        </p>
      </div>

      {/* Evidence attachments */}
      {complaint.evidence?.length > 0 && (
        <div className="bg-surface-elevated/70 rounded-xl border border-border p-5 shadow-xs">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">
            Attached Evidence ({complaint.evidence.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {complaint.evidence.map((file: any, index: number) => (
              <div key={file.id || `evidence-${index}`} className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-surface hover:bg-surface-elevated transition-colors shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={18} className="text-brand-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text-primary truncate">{file.originalFilename}</p>
                    <p className="text-[10px] text-text-secondary font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB &bull; {file.extension?.toUpperCase()}</p>
                  </div>
                </div>
                <a href={file.secureUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-2 rounded-lg bg-surface-elevated hover:bg-brand-primary/10 text-brand-primary transition-colors" title="Download">
                  <Download size={15} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Case Understanding Panel ──────────────────────────────────────────────

function CaseUnderstandingPanel({ caseUnderstanding, caseId }: { caseUnderstanding: CaseUnderstandingData | null; caseId?: string }) {
  if (!caseUnderstanding) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary">
          <Brain className="h-10 w-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-text-primary">Case Understanding Not Ready</p>
          <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
            The AI Case Understanding pipeline hasn't processed this complaint yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      <CaseUnderstandingView data={caseUnderstanding} caseId={caseId} />
    </div>
  );
}


// ─── Timeline Panel ────────────────────────────────────────────────────────

function TimelinePanel({ caseUnderstanding }: { caseUnderstanding: CaseUnderstandingData | null }) {
  if (!caseUnderstanding) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary">
          <Clock className="h-10 w-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-text-primary">Timeline Not Ready</p>
          <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
            The AI Case Understanding pipeline hasn't processed this complaint yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      <Card className="p-6">
        <CardHeader title="Chronological Case Timeline" />
        <div className="mt-5 space-y-5">
          {(!caseUnderstanding.timeline || caseUnderstanding.timeline.length === 0) ? (
            <p className="text-sm text-text-muted italic">No timeline events extracted.</p>
          ) : (
            caseUnderstanding.timeline.map((event, idx) => (
              <div key={idx} className="flex gap-4 items-start border-l-2 border-brand-primary pl-4 py-2 bg-surface-elevated/40 rounded-r-xl p-3 border border-border/50">
                <div className="space-y-1.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-mono">
                    {event.timestamp}
                  </span>
                  <p className="text-sm text-text-primary font-bold mt-1.5">{event.description}</p>
                  {event.supporting_evidence_ids && event.supporting_evidence_ids.length > 0 && (
                    <p className="text-xs text-text-secondary">
                      Evidence Ref: <span className="font-mono">{event.supporting_evidence_ids.join(', ')}</span>
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Add Participant Modal ─────────────────────────────────────────────────

interface ParticipantFormData {
  name: string;
  roles: string[];
  contact: { phone?: string; email?: string; address?: string };
  identifiers: Array<{ type: string; value: string }>;
  victimProfile?: { injuryDetails?: string; lossDetails?: string };
  witnessProfile?: { statement?: string };
  complainantProfile?: { relationshipToIncident?: string };
  [key: string]: any;
}

function AddParticipantModal({
  isOpen,
  onClose,
  caseId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = React.useState<ParticipantFormData>({
    name: '',
    roles: [],
    contact: {},
    identifiers: [],
    victimProfile: {},
    witnessProfile: {},
    complainantProfile: {},
  });
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const roleOptions = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'];

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, name: e.target.value });
    if (errors.name) setErrors({ ...errors, name: '' });
  };

  const handleRoleToggle = (role: string) => {
    setFormData({
      ...formData,
      roles: formData.roles.includes(role)
        ? formData.roles.filter(r => r !== role)
        : [...formData.roles, role],
    });
    if (errors.roles) setErrors({ ...errors, roles: '' });
  };

  const handleContactChange = (field: string, value: string) => {
    setFormData({
      ...formData,
      contact: { ...formData.contact, [field]: value || undefined },
    });
  };

  const handleProfileChange = (profileType: string, field: string, value: string) => {
    setFormData({
      ...formData,
      [profileType]: { ...(formData[profileType] || {}), [field]: value || undefined },
    });
  };

  const handleAddIdentifier = () => {
    setFormData({
      ...formData,
      identifiers: [...formData.identifiers, { type: '', value: '' }],
    });
  };

  const handleIdentifierChange = (index: number, field: string, value: string) => {
    const newIdentifiers = [...formData.identifiers];
    newIdentifiers[index] = { ...newIdentifiers[index], [field]: value };
    setFormData({ ...formData, identifiers: newIdentifiers });
  };

  const handleRemoveIdentifier = (index: number) => {
    setFormData({
      ...formData,
      identifiers: formData.identifiers.filter((_, i) => i !== index),
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (formData.roles.length === 0) newErrors.roles = 'Select at least one role';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        roles: formData.roles,
        contact: formData.contact,
        identifiers: formData.identifiers.filter(id => id.type && id.value),
      };

      // Add role-specific profile data
      if (formData.roles.includes('Victim') && (formData.victimProfile?.injuryDetails || formData.victimProfile?.lossDetails)) {
        payload.victimProfile = formData.victimProfile;
      }
      if (formData.roles.includes('Complainant') && formData.complainantProfile?.relationshipToIncident) {
        payload.complainantProfile = formData.complainantProfile;
      }

      await apiClient.post(`/cases/${caseId}/participants`, payload);
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add participant');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-md pt-20 pb-8 px-4 sm:px-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-5 border-b border-border bg-surface shrink-0">
          <h2 className="text-lg font-bold text-text-primary">Add New Participant</h2>
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary transition-colors text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-surface-elevated/20">
          {/* Name */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5 block">
              Full Name <span className="text-semantic-critical">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={handleNameChange}
              placeholder="Enter full name"
              className={`w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 ${errors.name
                ? 'border-semantic-critical focus:ring-semantic-critical/20'
                : 'border-border focus:ring-brand-primary'
                }`}
            />
            {errors.name && <p className="text-xs font-bold text-semantic-critical mt-1">{errors.name}</p>}
          </div>

          {/* Roles */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2.5 block">
              Roles <span className="text-semantic-critical">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {roleOptions.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-elevated transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.roles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="w-4 h-4 accent-brand-primary cursor-pointer"
                  />
                  <span className="text-sm font-bold text-text-primary">{role}</span>
                </label>
              ))}
            </div>
            {errors.roles && <p className="text-xs font-bold text-semantic-critical mt-1">{errors.roles}</p>}
          </div>

          {/* Contact Information */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Contact Information</label>
            <input
              type="tel"
              value={formData.contact.phone || ''}
              onChange={(e) => handleContactChange('phone', e.target.value)}
              placeholder="Phone number"
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <input
              type="email"
              value={formData.contact.email || ''}
              onChange={(e) => handleContactChange('email', e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <input
              type="text"
              value={formData.contact.address || ''}
              onChange={(e) => handleContactChange('address', e.target.value)}
              placeholder="Address"
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          {/* Identifiers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Identifiers (Optional)</label>
              <button
                type="button"
                onClick={handleAddIdentifier}
                className="text-xs font-bold text-brand-primary hover:underline transition-colors"
              >
                + Add Identifier
              </button>
            </div>
            <div className="space-y-2">
              {formData.identifiers.map((id, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={id.type}
                    onChange={(e) => handleIdentifierChange(idx, 'type', e.target.value)}
                    placeholder="Type (e.g., Aadhar, PAN, License)"
                    className="flex-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                  <input
                    type="text"
                    value={id.value}
                    onChange={(e) => handleIdentifierChange(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveIdentifier(idx)}
                    className="px-3 py-2 text-semantic-critical hover:bg-semantic-critical/10 rounded-xl transition-colors font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Victim Profile */}
          {formData.roles.includes('Victim') && (
            <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-2xl p-4 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-primary block">Victim Profile Details</label>
              <input
                type="text"
                value={formData.victimProfile?.injuryDetails || ''}
                onChange={(e) => handleProfileChange('victimProfile', 'injuryDetails', e.target.value)}
                placeholder="Injury details (optional)"
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <textarea
                value={formData.victimProfile?.lossDetails || ''}
                onChange={(e) => handleProfileChange('victimProfile', 'lossDetails', e.target.value)}
                placeholder="Loss details (optional)"
                rows={3}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          )}

          {/* Complainant Profile */}
          {formData.roles.includes('Complainant') && (
            <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-2xl p-4 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-primary block">Complainant Profile Details</label>
              <input
                type="text"
                value={formData.complainantProfile?.relationshipToIncident || ''}
                onChange={(e) => handleProfileChange('complainantProfile', 'relationshipToIncident', e.target.value)}
                placeholder="Relationship to incident (optional)"
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          )}

          <p className="text-xs text-text-secondary italic">Statements and reasoning can be added from the participant detail view after creation.</p>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border text-text-primary font-bold rounded-xl hover:bg-surface-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-brand-primary text-white font-bold rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-xs"
            >
              {loading ? 'Adding...' : 'Add Participant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// // ─── Edit Participant Modal ────────────────────────────────────────────────

// function EditParticipantModal({
//   isOpen,
//   onClose,
//   participant,
//   caseId,
//   onSuccess,
// }: {
//   isOpen: boolean;
//   onClose: () => void;
//   participant: any;
//   caseId: string;
//   onSuccess: () => void;
// }) {
//   const [formData, setFormData] = React.useState<ParticipantFormData>({
//     name: '',
//     roles: [],
//     contact: {},
//     identifiers: [],
//   });
//   const [loading, setLoading] = React.useState(false);
//   const [errors, setErrors] = React.useState<Record<string, string>>({});

//   const roleOptions = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'];

//   React.useEffect(() => {
//     if (participant) {
//       setFormData({
//         name: participant.name || '',
//         roles: participant.roles || [],
//         contact: participant.contact || {},
//         identifiers: participant.identifiers || [],
//         victimProfile: participant.victimProfile || {},
//         witnessProfile: participant.witnessProfile || {},
//         complainantProfile: participant.complainantProfile || {},
//       });
//     }
//   }, [participant, isOpen]);

//   const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setFormData({ ...formData, name: e.target.value });
//     if (errors.name) setErrors({ ...errors, name: '' });
//   };

//   const handleRoleToggle = (role: string) => {
//     setFormData({
//       ...formData,
//       roles: formData.roles.includes(role)
//         ? formData.roles.filter(r => r !== role)
//         : [...formData.roles, role],
//     });
//   };

//   const handleContactChange = (field: string, value: string) => {
//     setFormData({
//       ...formData,
//       contact: { ...formData.contact, [field]: value || undefined },
//     });
//   };

//   const handleProfileChange = (profileType: string, field: string, value: string) => {
//     setFormData({
//       ...formData,
//       [profileType]: { ...(formData[profileType] || {}), [field]: value || undefined },
//     });
//   };

//   const handleAddIdentifier = () => {
//     setFormData({
//       ...formData,
//       identifiers: [...formData.identifiers, { type: '', value: '' }],
//     });
//   };

//   const handleIdentifierChange = (index: number, field: string, value: string) => {
//     const newIdentifiers = [...formData.identifiers];
//     newIdentifiers[index] = { ...newIdentifiers[index], [field]: value };
//     setFormData({ ...formData, identifiers: newIdentifiers });
//   };

//   const handleRemoveIdentifier = (index: number) => {
//     setFormData({
//       ...formData,
//       identifiers: formData.identifiers.filter((_, i) => i !== index),
//     });
//   };

//   const validateForm = () => {
//     const newErrors: Record<string, string> = {};
//     if (!formData.name.trim()) newErrors.name = 'Name is required';
//     if (formData.roles.length === 0) newErrors.roles = 'Select at least one role';
//     setErrors(newErrors);
//     return Object.keys(newErrors).length === 0;
//   };

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!validateForm()) return;

//     setLoading(true);
//     try {
//       const payload: any = {
//         name: formData.name.trim(),
//         roles: formData.roles,
//         contact: formData.contact,
//         identifiers: formData.identifiers.filter(id => id.type && id.value),
//       };

//       // Add role-specific profile data
//       if (formData.roles.includes('Victim') && (formData.victimProfile?.injuryDetails || formData.victimProfile?.lossDetails)) {
//         payload.victimProfile = formData.victimProfile;
//       }
//       if (formData.roles.includes('Complainant') && formData.complainantProfile?.relationshipToIncident) {
//         payload.complainantProfile = formData.complainantProfile;
//       }

//       await apiClient.patch(`/cases/${caseId}/participants/${participant.participant_id}`, payload);
//       onSuccess();
//     } catch (err: any) {
//       alert(err.response?.data?.message || 'Failed to update participant');
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (!isOpen) return null;

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
//       <div
//         className="bg-neutral-900/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
//         onClick={(e) => e.stopPropagation()}
//       >
//         {/* Header */}
//         <div className="sticky top-0 flex items-center justify-between p-6 border-b border-neutral-100 bg-neutral-900/50">
//           <h2 className="text-xl font-bold text-white">Edit Participant</h2>
//           <button onClick={onClose} className="p-1 text-neutral-400 hover:text-text-secondary transition-colors text-2xl leading-none">×</button>
//         </div>

//         <form onSubmit={handleSubmit} className="p-6 space-y-5">
//           {/* Name */}
//           <div>
//             <label className="text-sm font-semibold text-text-secondary mb-2 block">
//               Full Name <span className="text-red-500">*</span>
//             </label>
//             <input
//               type="text"
//               value={formData.name}
//               onChange={handleNameChange}
//               placeholder="Enter full name"
//               className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
//                 errors.name
//                   ? 'border-red-300 focus:ring-red-200'
//                   : 'border-neutral-700 focus:ring-blue-200'
//               }`}
//             />
//             {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
//           </div>

//           {/* Roles */}
//           <div>
//             <label className="text-sm font-semibold text-text-secondary mb-3 block">
//               Roles <span className="text-red-500">*</span>
//             </label>
//             <div className="grid grid-cols-2 gap-3">
//               {roleOptions.map(role => (
//                 <label key={role} className="flex items-center gap-2 cursor-pointer">
//                   <input
//                     type="checkbox"
//                     checked={formData.roles.includes(role)}
//                     onChange={() => handleRoleToggle(role)}
//                     className="w-4 h-4 accent-blue-600 cursor-pointer"
//                   />
//                   <span className="text-sm text-text-secondary">{role}</span>
//                 </label>
//               ))}
//             </div>
//             {errors.roles && <p className="text-xs text-red-500 mt-1">{errors.roles}</p>}
//           </div>

//           {/* Contact Information */}
//           <div className="space-y-3">
//             <label className="text-sm font-semibold text-text-secondary">Contact Information</label>
//             <input
//               type="tel"
//               value={formData.contact.phone || ''}
//               onChange={(e) => handleContactChange('phone', e.target.value)}
//               placeholder="Phone number"
//               className="w-full px-4 py-2.5 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
//             />
//             <input
//               type="email"
//               value={formData.contact.email || ''}
//               onChange={(e) => handleContactChange('email', e.target.value)}
//               placeholder="Email address"
//               className="w-full px-4 py-2.5 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
//             />
//             <input
//               type="text"
//               value={formData.contact.address || ''}
//               onChange={(e) => handleContactChange('address', e.target.value)}
//               placeholder="Address"
//               className="w-full px-4 py-2.5 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
//             />
//           </div>

//           {/* Identifiers */}
//           <div>
//             <div className="flex items-center justify-between mb-3">
//               <label className="text-sm font-semibold text-text-secondary">Identifiers (Optional)</label>
//               <button
//                 type="button"
//                 onClick={handleAddIdentifier}
//                 className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors"
//               >
//                 + Add Identifier
//               </button>
//             </div>
//             <div className="space-y-2">
//               {formData.identifiers.map((id, idx) => (
//                 <div key={idx} className="flex gap-2">
//                   <input
//                     type="text"
//                     value={id.type}
//                     onChange={(e) => handleIdentifierChange(idx, 'type', e.target.value)}
//                     placeholder="Type (e.g., Aadhar, PAN, License)"
//                     className="flex-1 px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
//                   />
//                   <input
//                     type="text"
//                     value={id.value}
//                     onChange={(e) => handleIdentifierChange(idx, 'value', e.target.value)}
//                     placeholder="Value"
//                     className="flex-1 px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
//                   />
//                   <button
//                     type="button"
//                     onClick={() => handleRemoveIdentifier(idx)}
//                     className="px-2 py-2 text-red-500 hover:bg-red-900/20 rounded transition-colors"
//                   >
//                     🗑️
//                   </button>
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* Victim Profile */}
//           {formData.roles.includes('Victim') && (
//             <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 space-y-3">
//               <label className="text-sm font-semibold text-green-800 block">Victim Profile Details</label>
//               <input
//                 type="text"
//                 value={formData.victimProfile?.injuryDetails || ''}
//                 onChange={(e) => handleProfileChange('victimProfile', 'injuryDetails', e.target.value)}
//                 placeholder="Injury details (optional)"
//                 className="w-full px-4 py-2.5 border border-green-800/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
//               />
//               <textarea
//                 value={formData.victimProfile?.lossDetails || ''}
//                 onChange={(e) => handleProfileChange('victimProfile', 'lossDetails', e.target.value)}
//                 placeholder="Loss details (optional)"
//                 rows={3}
//                 className="w-full px-4 py-2.5 border border-green-800/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
//               />
//             </div>
//           )}

//           {/* Complainant Profile */}
//           {formData.roles.includes('Complainant') && (
//             <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 space-y-3">
//               <label className="text-sm font-semibold text-blue-800 block">Complainant Profile Details</label>
//               <input
//                 type="text"
//                 value={formData.complainantProfile?.relationshipToIncident || ''}
//                 onChange={(e) => handleProfileChange('complainantProfile', 'relationshipToIncident', e.target.value)}
//                 placeholder="Relationship to incident (optional)"
//                 className="w-full px-4 py-2.5 border border-blue-800/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
//               />
//             </div>
//           )}

//           <p className="text-xs text-neutral-400 italic">Statements and reasoning are managed from the participant detail view.</p>

//           {/* Actions */}
//           <div className="flex gap-3 pt-4 border-t border-neutral-100">
//             <button
//               type="button"
//               onClick={onClose}
//               className="flex-1 px-4 py-2.5 border border-neutral-700 text-text-secondary font-semibold rounded-lg hover:bg-neutral-900/50 transition-colors"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={loading}
//               className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
//             >
//               {loading ? 'Updating...' : 'Update Participant'}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }



// ─── Edit / View Participant Modal (combined) ─────────────────────────────────

function EditParticipantModal({
  isOpen,
  onClose,
  participant: initialParticipant,
  caseId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  participant: any;
  caseId: string;
  onSuccess: (updated?: any) => void;
}) {
  // ── Local participant state — updated optimistically on every mutation ────
  const [p, setP] = React.useState<any>(initialParticipant);
  React.useEffect(() => { setP(initialParticipant); }, [initialParticipant, isOpen]);

  // ── Edit form state ──────────────────────────────────────────────────────
  const [formData, setFormData] = React.useState<ParticipantFormData>({ name: '', roles: [], contact: {}, identifiers: [] });
  const [formLoading, setFormLoading] = React.useState(false);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (initialParticipant) {
      setFormData({
        name: initialParticipant.name || '',
        roles: initialParticipant.roles || [],
        contact: initialParticipant.contact || {},
        identifiers: (initialParticipant.identifiers || []).map((id: any) => ({ ...id })),
        victimProfile: initialParticipant.victimProfile || {},
        complainantProfile: initialParticipant.complainantProfile || {},
        suspectProfile: initialParticipant.suspectProfile || {},
      });
    }
  }, [initialParticipant, isOpen]);

  // ── Statement state ──────────────────────────────────────────────────────
  const [stmtContent, setStmtContent] = React.useState('');
  const [stmtDate, setStmtDate] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [stmtLoading, setStmtLoading] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [transcribeError, setTranscribeError] = React.useState<string | null>(null);
  const audioInputRef = React.useRef<HTMLInputElement>(null);

  // ── Reasoning state ──────────────────────────────────────────────────────
  const [reasoningContent, setReasoningContent] = React.useState('');
  const [reasoningLoading, setReasoningLoading] = React.useState(false);
  const [editingReasoningId, setEditingReasoningId] = React.useState<string | null>(null);
  const [editingReasoningContent, setEditingReasoningContent] = React.useState('');

  // ── Identifier upload state ───────────────────────────────────────────────
  const [identifierUploading, setIdentifierUploading] = React.useState<number | null>(null);
  const [viewingDocUrl, setViewingDocUrl] = React.useState<string | null>(null);
  const identifierFileRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const roleOptions = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'];

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case 'Accused': return 'bg-red-50 text-red-700 border-red-200';
      case 'Suspect': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Victim': return 'bg-green-50 text-green-700 border-green-200';
      case 'Witness': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Complainant': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
    }
  };

  const handleProfileChange = (profileType: string, field: string, value: string | boolean) => {
    const normalizedValue = field === 'isAccused' ? Boolean(value) : value || undefined;
    setFormData((prev) => ({
      ...prev,
      [profileType]: { ...(prev[profileType] || {}), [field]: normalizedValue },
    }));
  };

  // Helper — after any mutation, get fresh participant from API and update local state instantly
  const refreshParticipant = React.useCallback(async () => {
    try {
      const res = await apiClient.get(`/cases/${caseId}/participants`);
      const list: any[] = res.data.data || [];
      const fresh = list.find((x) => x.participant_id === p?.participant_id);
      if (fresh) { setP(fresh); onSuccess(fresh); }
    } catch { /* silently ignore */ }
  }, [caseId, p?.participant_id, onSuccess]);

  // ── Form handlers ────────────────────────────────────────────────────────
  const handleRoleToggle = (role: string) => {
    setFormData((prev) => ({ ...prev, roles: prev.roles.includes(role) ? prev.roles.filter(r => r !== role) : [...prev.roles, role] }));
  };
  const handleContactChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, contact: { ...prev.contact, [field]: value || undefined } }));
  };
  const handleAddIdentifier = () => {
    setFormData((prev) => ({ ...prev, identifiers: [...prev.identifiers, { type: '', value: '' }] }));
  };
  const handleIdentifierChange = (idx: number, field: string, value: string) => {
    setFormData((prev) => {
      const ids = [...prev.identifiers];
      ids[idx] = { ...ids[idx], [field]: value };
      return { ...prev, identifiers: ids };
    });
  };
  const handleRemoveIdentifier = (idx: number) => {
    setFormData((prev) => ({ ...prev, identifiers: prev.identifiers.filter((_, i) => i !== idx) }));
  };

  // ── Identifier file upload ────────────────────────────────────────────────
  const handleIdentifierFileChange = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIdentifierUploading(idx);
    try {
      // 1. Get signed upload params
      const sigRes = await apiClient.post(`/cases/${caseId}/participants/${p.participant_id}/identifiers/upload-signature`);
      const { signature, timestamp, apiKey, cloudName, folder, publicId } = sigRes.data.data;
      // 2. Upload directly to Cloudinary
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', apiKey);
      form.append('timestamp', String(timestamp));
      form.append('signature', signature);
      form.append('folder', folder);
      form.append('public_id', publicId);
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: 'POST', body: form });
      if (!uploadRes.ok) throw new Error('Cloudinary upload failed');
      const uploadData = await uploadRes.json();
      const secureUrl: string = uploadData.secure_url;
      // 3. Save fileUrl into identifier row (optimistic)
      setFormData((prev) => {
        const ids = [...prev.identifiers];
        ids[idx] = { ...ids[idx], fileUrl: secureUrl } as any;
        return { ...prev, identifiers: ids };
      });
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setIdentifierUploading(null);
    }
  };

  // ── Form submit ──────────────────────────────────────────────────────────
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (formData.roles.length === 0) errs.roles = 'Select at least one role';
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setFormLoading(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        roles: formData.roles,
        contact: formData.contact,
        identifiers: formData.identifiers.filter(id => id.type && id.value),
      };
      if (formData.roles.includes('Victim') && (formData.victimProfile?.injuryDetails || formData.victimProfile?.lossDetails)) {
        payload.victimProfile = formData.victimProfile;
      }
      if (formData.roles.includes('Complainant') && formData.complainantProfile?.relationshipToIncident) {
        payload.complainantProfile = formData.complainantProfile;
      }
      const res = await apiClient.patch(`/cases/${caseId}/participants/${p.participant_id}`, payload);
      const updated = res.data.data;
      setP(updated);
      onSuccess(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update participant');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Statement handlers ─────────────────────────────────────────────────
  const handleAddStatement = async () => {
    if (!stmtContent.trim() || !stmtDate) return;
    setStmtLoading(true);
    try {
      const res = await apiClient.post(`/cases/${caseId}/participants/${p.participant_id}/statements`, {
        content: stmtContent.trim(),
        recordedAt: new Date(stmtDate).toISOString(),
      });
      setStmtContent('');
      setStmtDate(new Date().toISOString().slice(0, 16));
      const updated = res.data.data;
      setP(updated);
      onSuccess(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add statement');
    } finally {
      setStmtLoading(false);
    }
  };

  const handleDeleteStatement = async (statementId: string) => {
    if (!confirm('Delete this statement?')) return;
    try {
      const res = await apiClient.delete(`/cases/${caseId}/participants/${p.participant_id}/statements/${statementId}`);
      const updated = res.data.data;
      setP(updated);
      onSuccess(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete statement');
    }
  };

  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post(`/cases/${caseId}/participants/${p.participant_id}/statements/transcribe`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { transcript } = res.data.data;
      setStmtContent((prev) => prev.trim() ? `${prev.trim()}\n\n${transcript}` : transcript);
    } catch (err: any) {
      setTranscribeError(err.response?.data?.message || 'Transcription failed.');
    } finally {
      setTranscribing(false);
    }
  };

  // ── Reasoning handlers ─────────────────────────────────────────────────
  const handleAddReasoning = async () => {
    if (!reasoningContent.trim()) return;
    setReasoningLoading(true);
    try {
      const res = await apiClient.post(`/cases/${caseId}/participants/${p.participant_id}/reasoning`, {
        content: reasoningContent.trim(),
        source: 'officer',
      });
      setReasoningContent('');
      const updated = res.data.data;
      setP(updated);
      onSuccess(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add reasoning');
    } finally {
      setReasoningLoading(false);
    }
  };

  const handleUpdateReasoning = async (reasoningId: string) => {
    if (!editingReasoningContent.trim()) return;
    setReasoningLoading(true);
    try {
      const res = await apiClient.patch(`/cases/${caseId}/participants/${p.participant_id}/reasoning/${reasoningId}`, {
        content: editingReasoningContent.trim(),
      });
      setEditingReasoningId(null);
      setEditingReasoningContent('');
      const updated = res.data.data;
      setP(updated);
      onSuccess(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update reasoning');
    } finally {
      setReasoningLoading(false);
    }
  };

  const handleDeleteReasoning = async (reasoningId: string) => {
    if (!confirm('Delete this reasoning entry?')) return;
    try {
      const res = await apiClient.delete(`/cases/${caseId}/participants/${p.participant_id}/reasoning/${reasoningId}`);
      const updated = res.data.data;
      setP(updated);
      onSuccess(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete reasoning');
    }
  };

  const appliedSections: any[] = p?.suspectProfile?.appliedSections || [];

  if (!isOpen || !p) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-neutral-900/50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between p-6 border-b border-neutral-700 bg-neutral-900/50 z-10">
          <div>
            <h2 className="text-xl font-bold text-white">{p.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(p.roles || []).map((role: string) => (
                <span key={role} className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleBadgeColor(role)}`}>{role}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-text-secondary transition-colors text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-8">

          {/* Edit Form */}
          <form onSubmit={handleFormSubmit} className="space-y-5">
            <h3 className="text-base font-bold text-text-secondary border-b border-neutral-700 pb-2">Edit Participant Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="text-sm font-semibold text-text-secondary mb-2 block">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter full name"
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${formErrors.name ? 'border-red-300 focus:ring-red-200' : 'border-neutral-700 focus:ring-blue-200'}`}
                />
                {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
              </div>
              {/* Contact */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-secondary">Contact</label>
                <input type="tel" value={formData.contact.phone || ''} onChange={(e) => handleContactChange('phone', e.target.value)} placeholder="Phone" className="w-full px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <input type="email" value={formData.contact.email || ''} onChange={(e) => handleContactChange('email', e.target.value)} placeholder="Email" className="w-full px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <input type="text" value={formData.contact.address || ''} onChange={(e) => handleContactChange('address', e.target.value)} placeholder="Address" className="w-full px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
            </div>

            {/* Roles */}
            <div className="col-span-full">
              <label className="text-sm font-semibold text-text-secondary mb-3 block">
                Roles <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {['Victim', 'Witness', 'Suspect', 'Complainant'].map(role => (
                  <label key={role} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.roles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-sm text-text-secondary">{role}</span>
                  </label>
                ))}
              </div>
              {formErrors.roles && <p className="text-xs text-red-500 mt-1">{formErrors.roles}</p>}
            </div>

            {/* Identifiers */}
            <div className="col-span-full">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-text-secondary">Identifiers (Optional)</label>
                <button type="button" onClick={handleAddIdentifier} className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors">
                  + Add Identifier
                </button>
              </div>
              <div className="space-y-3">
                {formData.identifiers.map((id, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={id.type}
                      onChange={(e) => handleIdentifierChange(idx, 'type', e.target.value)}
                      placeholder="Type (e.g., Aadhar, PAN, License)"
                      className="flex-1 px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <input
                      type="text"
                      value={id.value}
                      onChange={(e) => handleIdentifierChange(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="flex gap-1">
                      {identifierUploading === idx ? (
                        <span className="px-2 py-2 text-blue-400"><Loader2 size={16} className="animate-spin" /></span>
                      ) : (
                        <label className="px-2 py-2 text-blue-400 hover:bg-blue-900/20 rounded transition-colors cursor-pointer" title="Attach document">
                          📎
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.mp3,.wav,.mp4,.mov"
                            onChange={(e) => handleIdentifierFileChange(idx, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                      {(id as any).fileUrl && (
                        <button
                          type="button"
                          onClick={() => window.open((id as any).fileUrl, '_blank')}
                          className="px-2 py-2 text-green-400 hover:bg-green-900/20 rounded transition-colors"
                          title="View uploaded document"
                        >
                          👁️
                        </button>
                      )}
                      <button type="button" onClick={() => handleRemoveIdentifier(idx)} className="px-2 py-2 text-red-500 hover:bg-red-900/20 rounded transition-colors">
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Role-specific profiles */}
            {formData.roles.includes('Victim') && (
              <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 space-y-3">
                <label className="text-sm font-semibold text-green-800 block">Victim Profile Details</label>
                <input type="text" value={formData.victimProfile?.injuryDetails || ''} onChange={(e) => handleProfileChange('victimProfile', 'injuryDetails', e.target.value)} placeholder="Injury details (optional)" className="w-full px-4 py-2.5 border border-green-800/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                <textarea value={formData.victimProfile?.lossDetails || ''} onChange={(e) => handleProfileChange('victimProfile', 'lossDetails', e.target.value)} placeholder="Loss details (optional)" rows={3} className="w-full px-4 py-2.5 border border-green-800/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
            )}
            {formData.roles.includes('Complainant') && (
              <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 space-y-3">
                <label className="text-sm font-semibold text-blue-800 block">Complainant Profile Details</label>
                <input type="text" value={formData.complainantProfile?.relationshipToIncident || ''} onChange={(e) => handleProfileChange('complainantProfile', 'relationshipToIncident', e.target.value)} placeholder="Relationship to incident (optional)" className="w-full px-4 py-2.5 border border-blue-800/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
            )}
            {formData.roles.includes('Suspect') && (
              <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-4 space-y-3">
                <label className="text-sm font-semibold text-orange-800 block">Suspect Profile Details</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.suspectProfile?.isAccused)}
                    onChange={(e) => handleProfileChange('suspectProfile', 'isAccused', e.target.checked)}
                    className="w-4 h-4 accent-orange-600 cursor-pointer"
                  />
                  <span className="text-sm text-orange-700">Mark as Accused</span>
                </label>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-700">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-700 text-text-secondary font-semibold rounded-lg hover:bg-neutral-900/50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={formLoading} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {formLoading ? 'Updating...' : 'Update Participant'}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}

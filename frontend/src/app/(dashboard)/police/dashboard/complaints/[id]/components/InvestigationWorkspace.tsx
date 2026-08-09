'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
import { Bot, BookOpen, ClipboardList, Send, FolderOpen, Sparkles, Users, FileText, Brain, Calendar, MapPin, Download, CheckCheck, Loader2, Clock, FileImage, FileVideo, FileAudio, File, ChevronRight, CheckCircle2, AlertCircle, Shield } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import ThreadViewerModal from './ThreadViewerModal';
import SnapshotDetailModal from './SnapshotDetailModal';
import StepDetailModal from './StepDetailModal';
import { AddEvidenceModal } from './AddEvidenceModal';
import ComplaintDetailModal from './ComplaintDetailModal';
import { DiaryDetailModal } from './DiaryDetailModal';
import { useTranslation } from '@/context/TranslationContext';
import { CaseUnderstandingView, CaseUnderstandingData } from '@/components/case-understanding/CaseUnderstandingView';
import { CustodyPanel } from './CustodyPanel';
import { API_ROUTES } from '@/lib/constants';

interface InvestigationWorkspaceProps {
  caseId: string;
}

type WorkspaceTab = 'analysis' | 'diary' | 'checklist' | 'requests' | 'evidence' | 'participants' | 'complaint' | 'case_understanding' | 'timeline' | 'placesVisited' | 'custody';

export function InvestigationWorkspace({ caseId }: InvestigationWorkspaceProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('analysis');
  const [copilotOpen, setCopilotOpen] = useState(true);
  const { language } = useTranslation();

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

  // Composer State
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStepId, setComposerStepId] = useState('');
  const [composerDeptId, setComposerDeptId] = useState('');

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
      if (warrantRes.status === 'fulfilled') {
        const rawWarrants = warrantRes.value.data.data;
        setWarrants(Array.isArray(rawWarrants) ? rawWarrants : []);
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
    return url.replace(/\/upload\/fl_attachment\//, '/upload/');
  };

  const openComposer = (stepId: string, deptId: string) => {
    setComposerStepId(stepId);
    setComposerDeptId(deptId);
    setComposerOpen(true);
  };

  const departmentThreadCount = threads.filter((t: any) => t.request_type !== 'citizen_request').length;
  const citizenThreadCount = threads.filter((t: any) => t.request_type === 'citizen_request').length;

  const tabs: { id: WorkspaceTab; label: string; icon: React.ReactNode; badge?: number }[] = [
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
  ];

  if (loading && !snapshot && !checklist && diaryEntries.length === 0) {
    return <div className="py-20 flex justify-center"><Loader /></div>;
  }

  return (
    <div className="flex gap-4 items-start overflow-hidden" style={{ minHeight: '600px' }}>
      {/* Main workspace — takes all available width, never overflows */}
      <div className="flex-1 min-w-0 overflow-hidden space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto items-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors relative ${
              activeTab === tab.id
                ? 'text-blue-700 border-b-2 border-blue-600'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-600'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
        {/* Copilot toggle */}
        <button
          onClick={() => setCopilotOpen(o => !o)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex-shrink-0 mr-1 ${
            copilotOpen
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
          }`}
        >
          <Sparkles size={13} />
          Copilot
        </button>
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Official Daily Diary</h3>
                  <p className="mt-1 text-sm text-slate-200">Generate a formal draft from the latest case context and finalize it for the record.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={diaryDate}
                    onChange={(e) => setDiaryDate(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                  <button
                    onClick={handleGenerateDiaryDraft}
                    disabled={diaryDraftLoading}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-200"
                  >
                    {diaryDraftLoading ? 'Working…' : 'Generate Draft'}
                  </button>
                  {diaryDraft && (
                    <button
                      onClick={handleSaveDiaryDraft}
                      disabled={diaryDraftLoading}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
                    >
                      {diaryDraftLoading ? 'Saving…' : 'Save Draft'}
                    </button>
                  )}
                </div>
              </div>

              {diaryDraftError && <p className="mt-3 text-sm text-red-600">{diaryDraftError}</p>}

              {diaryDraft && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{diaryDraft.title}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Status: {diaryDraft.status || 'draft'}</p>
                    </div>
                    <button
                      onClick={handleFinalizeDiaryDraft}
                      disabled={diaryDraftLoading}
                      className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed"
                    >
                      {diaryDraftLoading ? 'Saving…' : 'Finalize'}
                    </button>
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Official Case Diary Form (16 Standard Fields)</p>
                        <p className="text-xs text-slate-500">Edit any values before finalization. The generated PDFs will format these fields into the official two-column Police Roznamcha table layout.</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
                        <input
                          value={diaryForm.title}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, title: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Investigation Officer</label>
                        <input
                          value={diaryForm.officialOfficerId}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, officialOfficerId: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Crime Register No. and Section</label>
                        <input
                          value={diaryForm.crimeRegisterNumber}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, crimeRegisterNumber: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Investigation Start & End Time (Field 14)</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            placeholder="Start (e.g. 19/40)"
                            value={diaryForm.investigationStartTime}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, investigationStartTime: e.target.value }))}
                            className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          />
                          <span className="text-xs text-slate-400">to</span>
                          <input
                            placeholder="End (e.g. 23/00)"
                            value={diaryForm.investigationEndTime}
                            onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, investigationEndTime: e.target.value }))}
                            className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custody Status (Field 7a)</label>
                        <input
                          placeholder="e.g. ----- or In Police Custody"
                          value={diaryForm.custodyStatus}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, custodyStatus: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Magisterial Custody Date (Field 7b)</label>
                        <input
                          placeholder="e.g. -----"
                          value={diaryForm.magisterialCustodyDate}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, magisterialCustodyDate: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property Stolen</label>
                        <input
                          value={diaryForm.propertyStolen}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, propertyStolen: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property Recovered</label>
                        <input
                          value={diaryForm.propertyRecovered}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, propertyRecovered: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record of Investigation (Gujarati-English Transliterated)</label>
                        <textarea
                          value={diaryForm.recordOfInvestigationGujEn}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, recordOfInvestigationGujEn: e.target.value }))}
                          rows={6}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 font-mono"
                          placeholder="Enter the Gujarati-English narrative for the official diary."
                        />
                      </div>
                      <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record of Investigation (English Version)</label>
                        <textarea
                          value={diaryForm.recordOfInvestigationEn}
                          onChange={(e) => setDiaryForm((prev: any) => ({ ...prev, recordOfInvestigationEn: e.target.value }))}
                          rows={6}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 font-mono"
                          placeholder="Enter the English version for the final official record."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Finalized Case Diary Records</p>
                    <p className="text-xs text-slate-500">Preview or download official bilingual (Gujarati-English & English) PDF copies.</p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{diaryHistory.length} items</span>
                </div>

                {diaryHistory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No finalized case diary PDFs generated yet. Finalize a draft above to render official PDFs.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {diaryHistory.map((record) => {
                      const gujEnUrl = record.pdf_url_guj_en || record.pdf_url;
                      const enUrl = record.pdf_url_en;

                      return (
                        <div key={record.diary_id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{record.title || `Case Diary No. ${record.diary_number}`}</p>
                            <p className="text-xs text-slate-500">
                              Date: {new Date(record.diary_date).toLocaleDateString('en-IN')} • Status: <span className="font-semibold uppercase text-emerald-700">{record.status || 'completed'}</span>
                            </p>
                            {record.crime_register_number && (
                              <p className="text-xs text-slate-500">CR No.: {record.crime_register_number}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {gujEnUrl ? (
                              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 px-1">Guj-Eng:</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPdfUrl(gujEnUrl);
                                    setIsDiaryPreviewOpen(true);
                                  }}
                                  className="rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                  Preview
                                </button>
                                <a
                                  href={gujEnUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Download
                                </a>
                              </div>
                            ) : (
                              <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Guj-Eng PDF Pending</span>
                            )}

                            {enUrl ? (
                              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 px-1">English:</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPdfUrl(enUrl);
                                    setIsDiaryPreviewOpen(true);
                                  }}
                                  className="rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                  Preview
                                </button>
                                <a
                                  href={enUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Download
                                </a>
                              </div>
                            ) : (
                              <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">English PDF Pending</span>
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Places Visited</h3>
                  <p className="text-sm text-slate-500">Manually recorded locations visited by the investigation officer. These entries are tied to the case diary timeline.</p>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                  {placesVisited.length} recorded place{placesVisited.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Add New Place</div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</label>
                      <input
                        value={placeForm.address}
                        onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, address: e.target.value }))}
                        placeholder="123 Main Street, Surat, Gujarat"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visit date</label>
                        <input
                          type="date"
                          value={placeForm.visitDate}
                          onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, visitDate: e.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start time</label>
                          <input
                            type="time"
                            value={placeForm.startTime}
                            onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, startTime: e.target.value }))}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">End time</label>
                          <input
                            type="time"
                            value={placeForm.endTime}
                            onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, endTime: e.target.value }))}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">What was done</label>
                      <textarea
                        value={placeForm.whatWasDone}
                        onChange={(e) => setPlaceForm((prev: any) => ({ ...prev, whatWasDone: e.target.value }))}
                        rows={4}
                        placeholder="Search, meet witness, collect evidence, record statement..."
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </div>
                    {placeFormError && <p className="text-sm text-red-600">{placeFormError}</p>}
                    <button
                      type="button"
                      onClick={handleAddPlaceVisited}
                      disabled={placesVisitedLoading}
                      className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {placesVisitedLoading ? 'Saving…' : '+ Add place visited'}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Recent Visited Places</p>
                      <p className="text-xs text-slate-500">These entries are visible in the case diary timeline once recorded.</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{placesVisited.length} entries</span>
                  </div>

                  {placesVisited.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      No visited places have been recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {placesVisited.map((place) => (
                        <div key={place.place_id || place._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{place.address}</p>
                              <p className="text-xs text-slate-500 mt-1">
                                {new Date(place.visit_date).toLocaleDateString('en-IN')} · {place.start_time || 'N/A'} - {place.end_time || 'N/A'}
                              </p>
                            </div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Recorded</span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{place.what_was_done || 'No description provided.'}</p>
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

        {activeTab === 'custody' && (
          <CustodyPanel
            caseId={caseId}
            participants={participants}
            warrants={warrants}
            complaintData={complaintData}
            onRefresh={fetchWorkspaceData}
          />
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
            <div className="h-[70vh] rounded-lg overflow-hidden border border-slate-200">
              <iframe
                src={getDiaryPreviewUrl(previewPdfUrl)}
                title="Diary PDF Preview"
                className="w-full h-full"
              />
            </div>
          ) : (
            <p className="text-sm text-slate-600">No preview URL is available.</p>
          )}
          {previewPdfUrl && (
            <a
              href={getDiaryPreviewUrl(previewPdfUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Open in browser
            </a>
          )}
        </div>
      </Modal>
      </div>
      {/* Copilot Sidebar — hidden on small screens */}
      {copilotOpen && (
        <div className="hidden xl:block w-80 flex-shrink-0 rounded-xl overflow-hidden border border-slate-200 shadow-md" style={{ height: '700px', position: 'sticky', top: '80px' }}>
          <CopilotSidebar
            caseId={caseId}
            onStateChangeApplied={fetchWorkspaceData}
            onClose={() => setCopilotOpen(false)}
          />
        </div>
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
        <p className="text-sm font-semibold text-neutral-600">No evidence attached yet</p>
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
        <h3 className="text-lg font-bold text-neutral-800">Case Evidence File</h3>
        <button 
          onClick={() => setAddModalOpen(true)}
          className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-bold border border-blue-200 rounded hover:bg-blue-100 transition-colors"
        >
          + Add Evidence
        </button>
      </div>

      {/* ── Pending requested blocks ── */}
      {requestedEvidence.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {requestedEvidence.map((req: string, idx: number) => (
            <div key={`req-${idx}`} className="bg-neutral-50 border border-dashed border-neutral-300 rounded-xl p-4 shadow-sm flex gap-3 opacity-50">
              <div className="text-2xl">⏳</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-700 truncate">{req}</p>
                <p className="text-xs text-neutral-500 capitalize">Requested / Yet to upload</p>
                <div className="mt-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-neutral-100 text-neutral-500 border-neutral-300">
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
            case 'critical': return 'bg-red-100 text-red-800';
            case 'high':     return 'bg-orange-100 text-orange-800';
            case 'medium':   return 'bg-amber-100 text-amber-800';
            default:         return 'bg-slate-100 text-slate-600';
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
              case 'critical': return 'border-l-red-500';
              case 'high':     return 'border-l-orange-400';
              case 'medium':   return 'border-l-amber-400';
              default:         return 'border-l-blue-400';
            }
          };

          const importanceBadge = (imp: string) => {
            switch (imp?.toLowerCase()) {
              case 'critical': return 'bg-red-100 text-red-800 border-red-200';
              case 'high':     return 'bg-orange-100 text-orange-800 border-orange-200';
              case 'medium':   return 'bg-amber-100 text-amber-800 border-amber-200';
              default:         return 'bg-slate-100 text-slate-600 border-slate-200';
            }
          };

          // Lucide icon by file extension
          const FileIcon = (filename: string) => {
            const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
            if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext))
              return <FileImage size={18} className="text-slate-600" />;
            if (['mp4','mov','avi','webm'].includes(ext))
              return <FileVideo size={18} className="text-slate-600" />;
            if (['mp3','wav','ogg','aac'].includes(ext))
              return <FileAudio size={18} className="text-slate-600" />;
            return <File size={18} className="text-slate-600" />;
          };

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unique.map((ci: any, idx: number) => {
                const caption = ci.caption || ci.filename || `Evidence ${idx + 1}`;
                const summary = (ci.summary || '').trim();
                const supports: string[] = ci.supports || ci.allegations_supported || [];
                const rawEv = findRaw(ci);

                return (
                  <div
                    key={ci.evidence_id || idx}
                    onClick={() => setSelectedEvidence(rawEv || ci)}
                    className={`bg-white border border-neutral-200 border-l-4 ${importanceBorder(ci.importance)} rounded-xl p-4 cursor-pointer hover:shadow-md transition-all group flex flex-col gap-2.5`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                        {FileIcon(ci.filename || '')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-neutral-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
                            {caption}
                          </p>
                          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${importanceBadge(ci.importance)}`}>
                            {ci.importance || 'medium'}
                          </span>
                        </div>
                        {ci.filename && ci.filename !== caption && (
                          <p className="text-[10px] text-neutral-400 mt-0.5 truncate font-mono">{ci.filename}</p>
                        )}
                      </div>
                    </div>

                    {/* Summary */}
                    {summary && (
                      <p className="text-xs text-neutral-600 leading-relaxed line-clamp-3">
                        {summary}
                      </p>
                    )}

                    {/* Supports allegations */}
                    {supports.length > 0 && (
                      <div className="pt-2 border-t border-neutral-100">
                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Supports Allegations</p>
                        <div className="flex flex-wrap gap-1.5">
                          {supports.map((alg: string, aIdx: number) => (
                            <span key={aIdx} className="px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-medium">
                              {alg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-100 mt-auto">
                      {rawEv ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          Full details available
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                          <AlertCircle size={11} />
                          AI summary only
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 group-hover:text-blue-800 transition-colors">
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
                className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm flex gap-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="text-2xl group-hover:scale-110 transition-transform">{evidenceTypeIcon[ev.type] ?? '📄'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-900 truncate group-hover:text-blue-700 transition-colors">{ev.title || ev.evidence_id}</p>
                  <p className="text-xs text-neutral-500 capitalize">{ev.type?.replace(/_/g, ' ')}</p>
                  <div className="mt-1">
                    <span className="text-[9px] font-medium text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                      Added by {ev.source?.replace(/_/g, ' ') || 'complainant'} on {new Date(ev.collected_at || ev.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  {ev.ai_description && <p className="text-xs text-neutral-600 mt-2 line-clamp-2">{ev.ai_description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      ev.status === 'verified' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                      {ev.status === 'verified' ? '✓ Verified' : 'Unverified'}
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
                <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200 font-medium">
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
                    <div key={i} className="p-3 border border-red-200 bg-red-50 rounded-lg text-xs text-red-900 font-medium space-y-1">
                      <p>• {c.description}</p>
                      {evIds.length > 0 && (
                        <p className="text-[11px] text-red-700">Involved Evidence IDs: {evIds.join(', ')}</p>
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
    <div className="p-3.5 border border-amber-200 bg-amber-50/70 rounded-lg text-xs space-y-2">
      <div className="flex justify-between items-start gap-2">
        <span className="font-bold text-amber-950 text-sm">{item.title}</span>
        <span className="uppercase text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded shrink-0">{item.importance}</span>
      </div>
      <p className="text-amber-900 leading-relaxed">{item.description}</p>
      <div className="pt-1">
        <button
          onClick={handleRequest}
          disabled={status !== 'idle'}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md transition-all ${
            status === 'sent'
              ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
              : status === 'loading'
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 cursor-pointer shadow-xs'
          }`}
        >
          {status === 'sent' ? (
            <><CheckCheck size={12} /> Requested from Complainant</>
          ) : status === 'loading' ? (
            <><Loader2 size={12} className="animate-spin" /> Sending...</>
          ) : (
            <><Send size={12} /> Request from Complainant</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Participants Panel ──────────────────────────────────────────────────────

function ParticipantsPanel({ participants, caseId, onRefresh }: { participants: any[]; caseId: string; onRefresh: () => void }) {  const [roleFilter, setRoleFilter] = React.useState<string>('All');
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
        <p className="text-sm font-semibold text-neutral-600">No participants found</p>
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
      case 'Accused': return 'bg-red-50 text-red-700 border-red-200';
      case 'Suspect': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Victim': return 'bg-green-50 text-green-700 border-green-200';
      case 'Witness': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Complainant': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-sm border border-neutral-300 rounded px-3 py-1.5 bg-white text-neutral-700"
        >
          <option value="All">All Roles</option>
          {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Participant
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
              className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group relative"
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <h4 
                  className="text-base font-bold text-neutral-900 cursor-pointer group-hover:text-blue-700 transition-colors flex-1"
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
                    className="p-1 text-neutral-400 hover:text-blue-600 transition-colors" 
                    title="Edit"
                  >
                    ✏️
                  </button>
                  {deleteConfirming === p.participant_id ? (
                    <div className="absolute right-2 top-14 bg-white border border-red-200 rounded-lg p-2 shadow-lg z-10 whitespace-nowrap">
                      <p className="text-xs font-semibold text-red-700 mb-2">Delete?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(p.participant_id)}
                          disabled={loading}
                          className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirming(null)}
                          className="px-2 py-1 text-xs font-semibold bg-neutral-200 text-neutral-700 rounded hover:bg-neutral-300"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirming(p.participant_id)}
                      className="p-1 text-neutral-400 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(p.roles || []).map((role: string) => (
                  <span key={role} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleBadgeColor(role)}`}>
                    {role}
                  </span>
                ))}
              </div>

              {(p.contact?.phone || p.contact?.email) && (
                <p className="text-[11px] text-neutral-500 mt-2">
                  {p.contact.phone && `📞 ${p.contact.phone}`}
                  {p.contact.phone && p.contact.email && ' · '}
                  {p.contact.email && `✉️ ${p.contact.email}`}
                </p>
              )}

              {isSuspect && !isAccused && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePromote(e, p);
                  }}
                  disabled={promoting}
                  className="mt-3 w-full flex-shrink-0 text-xs font-bold px-2 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {promoting ? '...' : '⚖️ Promote to Accused'}
                </button>
              )}

              <p 
                className="text-[10px] text-blue-500 mt-2 cursor-pointer hover:underline"
                onClick={() => setSelectedParticipant(p)}
              >
                Click for full details →
              </p>
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
      case 'Accused': return 'bg-red-50 text-red-700 border-red-200';
      case 'Suspect': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Victim': return 'bg-green-50 text-green-700 border-green-200';
      case 'Witness': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Complainant': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
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

    // Reset the input so the same file can be re-selected if needed
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

      // Auto-fill the statement textarea with the original-language text
      // Append if there's already some content (officer may have typed some)
      setStmtContent((prev) => {
        const base = prev.trim();
        return base ? `${base}\n\n${transcript}` : transcript;
      });

      // Show a subtle hint if translation is also available
      if (translatedText && detectedLanguage && detectedLanguage !== 'en') {
        setTranscribeError(`Detected language: ${detectedLanguage}. English translation also available — check below.`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Transcription failed. Ensure the Python service is running.';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-neutral-100">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{p.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(p.roles || []).map((role: string) => (
                <span key={role} className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleBadgeColor(role)}`}>
                  {role}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {onEdit && (
              <button onClick={() => onEdit(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">✏️</button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(p)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">🗑️</button>
            )}
            <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Contact */}
          {(p.contact?.phone || p.contact?.email || p.contact?.address) && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Contact Information</h3>
              <div className="bg-neutral-50 rounded-lg p-3 text-sm text-neutral-700 space-y-1 border border-neutral-100">
                {p.contact.phone && <p>📞 {p.contact.phone}</p>}
                {p.contact.email && <p>✉️ {p.contact.email}</p>}
                {p.contact.address && <p>📍 {p.contact.address}</p>}
              </div>
            </section>
          )}

          {/* Identifiers */}
          {p.identifiers?.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Identifiers</h3>
              <div className="flex flex-wrap gap-2">
                {p.identifiers.map((id: any, i: number) => (
                  <span key={i} className="text-xs bg-neutral-100 text-neutral-700 px-2 py-1 rounded border border-neutral-200">
                    <span className="font-semibold">{id.type}:</span> {id.value}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Victim Profile */}
          {p.victimProfile && (p.victimProfile.injuryDetails || p.victimProfile.lossDetails) && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Victim Profile</h3>
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-sm text-neutral-700 space-y-1">
                {p.victimProfile.injuryDetails && <p><span className="font-semibold">Injury:</span> {p.victimProfile.injuryDetails}</p>}
                {p.victimProfile.lossDetails && <p><span className="font-semibold">Loss:</span> {p.victimProfile.lossDetails}</p>}
              </div>
            </section>
          )}

          {/* Suspect Profile (only show if not also accused) */}
          {p.suspectProfile && !(p.roles || []).includes('Accused') && (p.suspectProfile.motive || p.suspectProfile.alibi) && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Suspect Profile</h3>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm text-neutral-700 space-y-1">
                {p.suspectProfile.motive && <p><span className="font-semibold">Motive:</span> {p.suspectProfile.motive}</p>}
                {p.suspectProfile.alibi && <p><span className="font-semibold">Alibi:</span> {p.suspectProfile.alibi}</p>}
              </div>
            </section>
          )}

          {/* Applied Legal Sections */}
          {appliedSections.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Applied Legal Sections</h3>
              <div className="space-y-2">
                {appliedSections.map((sec: any, i: number) => (
                  <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
                    <p className="font-bold text-blue-800">{sec.code} — {sec.title}</p>
                    {sec.reason && <p className="text-xs text-neutral-600 mt-1">{sec.reason}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Complainant Profile */}
          {p.complainantProfile?.relationshipToIncident && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Complainant</h3>
              <p className="text-sm text-neutral-700">Relation to Incident: {p.complainantProfile.relationshipToIncident}</p>
            </section>
          )}

          {/* ── Statements ──────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-3">Statements</h3>

            {/* Existing statements */}
            {Array.isArray(p.statements) && p.statements.length > 0 ? (
              <div className="space-y-2 mb-3">
                {p.statements.map((stmt: any) => (
                  <div key={stmt.id} className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-neutral-800 flex-1">{stmt.content}</p>
                      <button
                        onClick={() => handleDeleteStatement(stmt.id)}
                        className="text-neutral-300 hover:text-red-500 transition-colors flex-shrink-0 text-xs"
                        title="Delete statement"
                      >🗑️</button>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      🕐 {stmt.recordedAt ? new Date(stmt.recordedAt).toLocaleString('en-IN') : 'No date'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 mb-3">No statements recorded yet.</p>
            )}

            {/* Add statement form */}
            <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50 space-y-2">
              <p className="text-xs font-semibold text-neutral-600">Add New Statement</p>
              <textarea
                value={stmtContent}
                onChange={(e) => setStmtContent(e.target.value)}
                placeholder="Enter statement content..."
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    transcribing
                      ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                      : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50 cursor-pointer'
                  }`}
                  title="Upload audio file to auto-fill transcript"
                >
                  {transcribing ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
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
                <p className={`text-xs px-2 py-1 rounded ${
                  transcribeError.startsWith('Detected language')
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {transcribeError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 mb-1 block">Recorded At</label>
                  <input
                    type="datetime-local"
                    value={stmtDate}
                    onChange={(e) => setStmtDate(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                <button
                  onClick={handleAddStatement}
                  disabled={stmtLoading || !stmtContent.trim()}
                  className="self-end px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {stmtLoading ? '...' : '+ Add'}
                </button>
              </div>
            </div>
          </section>

          {/* ── Reasoning ───────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-3">Reasoning</h3>

            {/* Existing reasoning entries */}
            {Array.isArray(p.reasoning) && p.reasoning.length > 0 ? (
              <div className="space-y-2 mb-3">
                {p.reasoning.map((r: any) => (
                  <div key={r.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
                    {editingReasoningId === r.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingReasoningContent}
                          onChange={(e) => setEditingReasoningContent(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateReasoning(r.id)}
                            disabled={reasoningLoading}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {reasoningLoading ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingReasoningId(null); setEditingReasoningContent(''); }}
                            className="px-3 py-1 border border-neutral-300 text-neutral-600 text-xs font-semibold rounded-lg hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.source === 'ai' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {r.source === 'ai' ? '🤖 AI' : '👮 Officer'}
                            </span>
                            <span className="text-xs text-neutral-400">{new Date(r.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-neutral-800">{r.content}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingReasoningId(r.id); setEditingReasoningContent(r.content); }}
                            className="text-neutral-300 hover:text-blue-500 transition-colors text-xs"
                            title="Edit"
                          >✏️</button>
                          <button
                            onClick={() => handleDeleteReasoning(r.id)}
                            className="text-neutral-300 hover:text-red-500 transition-colors text-xs"
                            title="Delete"
                          >🗑️</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 mb-3">No reasoning entries yet.</p>
            )}

            {/* Add reasoning form */}
            <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50 space-y-2">
              <p className="text-xs font-semibold text-neutral-600">Add Reasoning Note</p>
              <textarea
                value={reasoningContent}
                onChange={(e) => setReasoningContent(e.target.value)}
                placeholder="Add investigative reasoning or observation..."
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              />
              <button
                onClick={handleAddReasoning}
                disabled={reasoningLoading || !reasoningContent.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {reasoningLoading ? '...' : '+ Add Reasoning'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


// ─── Original Complaint Panel ──────────────────────────────────────────────

function OriginalComplaintPanel({ complaint }: { complaint: any | null }) {
  if (!complaint) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <FileText className="h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-neutral-600">Loading complaint details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-neutral-200">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
          <FileText size={18} />
        </div>
        <div>
          <h2 className="text-base font-bold text-neutral-900">{complaint.complaintNumber}</h2>
          <p className="text-xs text-neutral-500">
            Filed on {new Date(complaint.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <span className="ml-auto px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {complaint.status?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Incident meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Calendar size={10} /> Date &amp; Time
          </p>
          <p className="text-sm font-semibold text-neutral-800">
            {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}
          </p>
        </div>
        <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <MapPin size={10} /> Place of Occurrence
          </p>
          <p className="text-sm font-semibold text-neutral-800">{complaint.incidentPlace}</p>
        </div>
        <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Category</p>
          <p className="text-sm font-semibold text-neutral-800 uppercase">
            {complaint.category?.replace('_', ' ') || 'Uncategorized'}
          </p>
        </div>
      </div>

      {/* Complainant */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Complainant</p>
        <p className="text-sm font-bold text-neutral-800">
          {complaint.citizen?.firstName} {complaint.citizen?.lastName}
        </p>
        <p className="text-xs text-neutral-500">{complaint.citizen?.phone}</p>
        <p className="text-xs text-neutral-500">{complaint.citizen?.email}</p>
      </div>

      {/* Brief Summary */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Brief Summary</p>
        <p className="text-sm font-semibold text-neutral-800">{complaint.shortDescription}</p>
      </div>

      {/* Detailed Description */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Detailed Description</p>
        <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
          {complaint.detailedDescription || <span className="text-neutral-400 italic">No detailed description provided.</span>}
        </p>
      </div>

      {/* Evidence attachments */}
      {complaint.evidence?.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
            Attached Evidence ({complaint.evidence.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {complaint.evidence.map((file: any) => (
              <div key={file.publicId} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-100 bg-neutral-50 hover:bg-neutral-100 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} className="text-blue-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-800 truncate">{file.originalFilename}</p>
                    <p className="text-[10px] text-neutral-400">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.extension?.toUpperCase()}</p>
                  </div>
                </div>
                <a href={file.secureUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 rounded hover:bg-neutral-200 text-neutral-500 transition-colors" title="Download">
                  <Download size={14} />
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

function CaseUnderstandingPanel({ caseUnderstanding }: { caseUnderstanding: CaseUnderstandingData | null }) {
  if (!caseUnderstanding) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500">
          <Brain className="h-10 w-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-neutral-700">Case Understanding Not Ready</p>
          <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
            The AI Case Understanding pipeline hasn't processed this complaint yet.
          </p>
        </div>
      </div>
    );
  }

  const rawOverview: any = caseUnderstanding.case_understanding || caseUnderstanding.overview || {};
  const overviewData = {
    executive_summary: rawOverview.executive_summary || rawOverview.complaint_summary || 'No summary available.',
    incident_brief: rawOverview.incident_brief || rawOverview.incident_overview || 'No incident brief available.',
    crime_category: rawOverview.crime_category || 'Uncategorized',
    crime_subtype: rawOverview.crime_subtype || 'General',
    priority: rawOverview.priority || 'medium',
    confidence: rawOverview.confidence ?? 0.9,
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return <span className="px-3 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 border border-red-300 uppercase">Critical Priority</span>;
      case 'high': return <span className="px-3 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800 border border-orange-300 uppercase">High Priority</span>;
      case 'medium': return <span className="px-3 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 uppercase">Medium Priority</span>;
      default: return <span className="px-3 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300 uppercase">Low Priority</span>;
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">Case Understanding Intelligence</h2>
            {getPriorityBadge(overviewData.priority)}
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Category: <strong className="text-white">{overviewData.crime_category}</strong> ({overviewData.crime_subtype})
            • Confidence: <strong className="text-emerald-400">{(overviewData.confidence * 100).toFixed(0)}%</strong>
          </p>
        </div>
        {caseUnderstanding.processing_duration_ms && (
          <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
            Single-Pass LLM Latency: <strong>{(caseUnderstanding.processing_duration_ms / 1000).toFixed(2)}s</strong>
          </div>
        )}
      </div>

      <Card className="space-y-4 p-6">
        <CardHeader title="Case Understanding Overview" />
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Executive Summary</h4>
            <p className="text-sm font-semibold text-neutral-900 mt-1">{overviewData.executive_summary}</p>
          </div>
          <div className="border-t border-neutral-100 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Incident Brief</h4>
            <p className="text-sm text-neutral-700 mt-1 leading-relaxed whitespace-pre-line">{overviewData.incident_brief}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}


// ─── Timeline Panel ────────────────────────────────────────────────────────

function TimelinePanel({ caseUnderstanding }: { caseUnderstanding: CaseUnderstandingData | null }) {
  if (!caseUnderstanding) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500">
          <Clock className="h-10 w-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-neutral-700">Timeline Not Ready</p>
          <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
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
        <div className="mt-4 space-y-4">
          {(!caseUnderstanding.timeline || caseUnderstanding.timeline.length === 0) ? (
            <p className="text-sm text-neutral-500 italic">No timeline events extracted.</p>
          ) : (
            caseUnderstanding.timeline.map((event, idx) => (
              <div key={idx} className="flex gap-4 items-start border-l-2 border-slate-900 pl-4 py-1">
                <div className="space-y-1">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {event.timestamp}
                  </span>
                  <p className="text-sm text-neutral-800 font-medium mt-1">{event.description}</p>
                  {event.supporting_evidence_ids && event.supporting_evidence_ids.length > 0 && (
                    <p className="text-xs text-neutral-400">
                      Evidence Ref: {event.supporting_evidence_ids.join(', ')}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-neutral-100 bg-white">
          <h2 className="text-xl font-bold text-neutral-900">Add New Participant</h2>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-2 block">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={handleNameChange}
              placeholder="Enter full name"
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                errors.name
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-neutral-300 focus:ring-blue-200'
              }`}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          {/* Roles */}
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-3 block">
              Roles <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {roleOptions.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.roles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm text-neutral-700">{role}</span>
                </label>
              ))}
            </div>
            {errors.roles && <p className="text-xs text-red-600 mt-1">{errors.roles}</p>}
          </div>

          {/* Contact Information */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-neutral-700">Contact Information</label>
            <input
              type="tel"
              value={formData.contact.phone || ''}
              onChange={(e) => handleContactChange('phone', e.target.value)}
              placeholder="Phone number"
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              type="email"
              value={formData.contact.email || ''}
              onChange={(e) => handleContactChange('email', e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              type="text"
              value={formData.contact.address || ''}
              onChange={(e) => handleContactChange('address', e.target.value)}
              placeholder="Address"
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Identifiers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-neutral-700">Identifiers (Optional)</label>
              <button
                type="button"
                onClick={handleAddIdentifier}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
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
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <input
                    type="text"
                    value={id.value}
                    onChange={(e) => handleIdentifierChange(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveIdentifier(idx)}
                    className="px-2 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Victim Profile */}
          {formData.roles.includes('Victim') && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <label className="text-sm font-semibold text-green-800 block">Victim Profile Details</label>
              <input
                type="text"
                value={formData.victimProfile?.injuryDetails || ''}
                onChange={(e) => handleProfileChange('victimProfile', 'injuryDetails', e.target.value)}
                placeholder="Injury details (optional)"
                className="w-full px-4 py-2.5 border border-green-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
              <textarea
                value={formData.victimProfile?.lossDetails || ''}
                onChange={(e) => handleProfileChange('victimProfile', 'lossDetails', e.target.value)}
                placeholder="Loss details (optional)"
                rows={3}
                className="w-full px-4 py-2.5 border border-green-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
          )}

          {/* Complainant Profile */}
          {formData.roles.includes('Complainant') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <label className="text-sm font-semibold text-blue-800 block">Complainant Profile Details</label>
              <input
                type="text"
                value={formData.complainantProfile?.relationshipToIncident || ''}
                onChange={(e) => handleProfileChange('complainantProfile', 'relationshipToIncident', e.target.value)}
                placeholder="Relationship to incident (optional)"
                className="w-full px-4 py-2.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          <p className="text-xs text-neutral-400 italic">Statements and reasoning can be added from the participant detail view after creation.</p>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-neutral-300 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Adding...' : 'Add Participant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Participant Modal ────────────────────────────────────────────────

function EditParticipantModal({
  isOpen,
  onClose,
  participant,
  caseId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  participant: any;
  caseId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = React.useState<ParticipantFormData>({
    name: '',
    roles: [],
    contact: {},
    identifiers: [],
  });
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const roleOptions = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'];

  React.useEffect(() => {
    if (participant) {
      setFormData({
        name: participant.name || '',
        roles: participant.roles || [],
        contact: participant.contact || {},
        identifiers: participant.identifiers || [],
        victimProfile: participant.victimProfile || {},
        witnessProfile: participant.witnessProfile || {},
        complainantProfile: participant.complainantProfile || {},
      });
    }
  }, [participant, isOpen]);

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

      await apiClient.patch(`/cases/${caseId}/participants/${participant.participant_id}`, payload);
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update participant');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-neutral-100 bg-white">
          <h2 className="text-xl font-bold text-neutral-900">Edit Participant</h2>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-2 block">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={handleNameChange}
              placeholder="Enter full name"
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                errors.name
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-neutral-300 focus:ring-blue-200'
              }`}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          {/* Roles */}
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-3 block">
              Roles <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {roleOptions.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.roles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm text-neutral-700">{role}</span>
                </label>
              ))}
            </div>
            {errors.roles && <p className="text-xs text-red-600 mt-1">{errors.roles}</p>}
          </div>

          {/* Contact Information */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-neutral-700">Contact Information</label>
            <input
              type="tel"
              value={formData.contact.phone || ''}
              onChange={(e) => handleContactChange('phone', e.target.value)}
              placeholder="Phone number"
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              type="email"
              value={formData.contact.email || ''}
              onChange={(e) => handleContactChange('email', e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              type="text"
              value={formData.contact.address || ''}
              onChange={(e) => handleContactChange('address', e.target.value)}
              placeholder="Address"
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Identifiers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-neutral-700">Identifiers (Optional)</label>
              <button
                type="button"
                onClick={handleAddIdentifier}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
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
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <input
                    type="text"
                    value={id.value}
                    onChange={(e) => handleIdentifierChange(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveIdentifier(idx)}
                    className="px-2 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Victim Profile */}
          {formData.roles.includes('Victim') && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <label className="text-sm font-semibold text-green-800 block">Victim Profile Details</label>
              <input
                type="text"
                value={formData.victimProfile?.injuryDetails || ''}
                onChange={(e) => handleProfileChange('victimProfile', 'injuryDetails', e.target.value)}
                placeholder="Injury details (optional)"
                className="w-full px-4 py-2.5 border border-green-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
              <textarea
                value={formData.victimProfile?.lossDetails || ''}
                onChange={(e) => handleProfileChange('victimProfile', 'lossDetails', e.target.value)}
                placeholder="Loss details (optional)"
                rows={3}
                className="w-full px-4 py-2.5 border border-green-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
          )}

          {/* Complainant Profile */}
          {formData.roles.includes('Complainant') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <label className="text-sm font-semibold text-blue-800 block">Complainant Profile Details</label>
              <input
                type="text"
                value={formData.complainantProfile?.relationshipToIncident || ''}
                onChange={(e) => handleProfileChange('complainantProfile', 'relationshipToIncident', e.target.value)}
                placeholder="Relationship to incident (optional)"
                className="w-full px-4 py-2.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          <p className="text-xs text-neutral-400 italic">Statements and reasoning are managed from the participant detail view.</p>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-neutral-300 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Updating...' : 'Update Participant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


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
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Bot, BookOpen, ClipboardList, Send, FolderOpen, Sparkles } from 'lucide-react';
import ThreadViewerModal from './ThreadViewerModal';
import SnapshotDetailModal from './SnapshotDetailModal';
import StepDetailModal from './StepDetailModal';
import { AddEvidenceModal } from './AddEvidenceModal';
import ComplaintDetailModal from './ComplaintDetailModal';
import { DiaryDetailModal } from './DiaryDetailModal';

interface InvestigationWorkspaceProps {
  caseId: string;
}

type WorkspaceTab = 'analysis' | 'diary' | 'checklist' | 'requests' | 'evidence';

export function InvestigationWorkspace({ caseId }: InvestigationWorkspaceProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('analysis');
  const [copilotOpen, setCopilotOpen] = useState(true);

  const [snapshot, setSnapshot] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [diaryEntries, setDiaryEntries] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);

  // Composer State
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStepId, setComposerStepId] = useState('');
  const [composerDeptId, setComposerDeptId] = useState('');

  // Diary Modals State
  const [viewingEvidenceId, setViewingEvidenceId] = useState<string | null>(null);
  const [viewingThreadId, setViewingThreadId] = useState<string | null>(null);
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [viewingStepId, setViewingStepId] = useState<string | null>(null);
  const [viewingComplaintData, setViewingComplaintData] = useState<any | null>(null);
  const [selectedDiaryEntry, setSelectedDiaryEntry] = useState<any>(null);

  const fetchWorkspaceData = useCallback(async () => {
    try {
      const [snapRes, checkRes, diaryRes, reqRes, evRes] = await Promise.allSettled([
        apiClient.get(`/cases/${caseId}/analysis/latest`),
        apiClient.get(`/cases/${caseId}/checklist`),
        apiClient.get(`/cases/${caseId}/diary`),
        apiClient.get(`/cases/${caseId}/requests`),
        apiClient.get(`/cases/${caseId}/evidence`),
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
      
      if (reqRes.status === 'fulfilled') setRequests(reqRes.value.data.data || []);
      if (evRes.status === 'fulfilled') setEvidence(evRes.value.data.data || []);
      
      // Fetch threads specifically
      try {
        const threadRes = await apiClient.get(`/cases/${caseId}/threads`);
        setThreads(threadRes.data.data || []);
      } catch (err) {
        console.error('Failed to fetch threads:', err);
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

  const handleDiaryEntryClick = (entry: any) => {
    if (!entry) return;
    // For rich diary entries (analysis, requests, complaint), we open the DiaryDetailModal
    if (['analysis_run', 'request_sent', 'response_received', 'complaint_filed'].includes(entry.event_type)) {
      setSelectedDiaryEntry(entry);
      return;
    }

    switch (entry.event_type) {
      case 'evidence_added':
        if (entry.ref_ids?.evidence_id) setViewingEvidenceId(entry.ref_ids.evidence_id);
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
      await apiClient.post(`/cases/${caseId}/analyze`);
      // Poll for new snapshot, awaiting so loading state persists
      const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
      await wait(5000);
      await fetchWorkspaceData();
      await wait(5000);
      await fetchWorkspaceData();
      await wait(5000);
      await fetchWorkspaceData();
    } catch (error) {
      console.error('Failed to trigger analysis', error);
      alert('Failed to trigger analysis.');
    } finally {
      setActionLoading(false);
    }
  };

  const openComposer = (stepId: string, deptId: string) => {
    setComposerStepId(stepId);
    setComposerDeptId(deptId);
    setComposerOpen(true);
  };

  const tabs: { id: WorkspaceTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'analysis', label: 'AI Analysis', icon: <Bot size={15} /> },
    { id: 'checklist', label: 'Investigation Checklist', icon: <ClipboardList size={15} />, badge: checklist?.steps?.filter((s: any) => s.status !== 'completed').length },
    { id: 'diary', label: 'Case Diary', icon: <BookOpen size={15} />, badge: diaryEntries.length },
    { id: 'requests', label: 'Department Requests', icon: <Send size={15} />, badge: requests.filter((r: any) => r.status === 'response_received').length || undefined },
    { id: 'evidence', label: 'Evidence', icon: <FolderOpen size={15} />, badge: evidence.length || undefined },
  ];

  if (loading && !snapshot && !checklist && diaryEntries.length === 0) {
    return <div className="py-20 flex justify-center"><Loader /></div>;
  }

  return (
    <div className="flex gap-4 items-start" style={{ minHeight: '600px' }}>
      {/* Main workspace */}
      <div className="flex-1 min-w-0 space-y-4">
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
            snapshot={snapshot}
            loading={actionLoading && !snapshot}
            onCorrectSnapshot={handleCorrectSnapshot}
            onTriggerAnalysis={handleTriggerAnalysis}
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
          <CaseDiaryFeed entries={diaryEntries} onEntryClick={handleDiaryEntryClick} />
        )}

        {activeTab === 'requests' && (
          <DepartmentInboxPanel threads={threads} onRefresh={fetchWorkspaceData} caseId={caseId} />
        )}

        {activeTab === 'evidence' && (
          <EvidencePanel evidence={evidence} caseId={caseId} onRefresh={fetchWorkspaceData} />
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
        isOpen={!!viewingEvidenceId}
        onClose={() => setViewingEvidenceId(null)}
        caseId={caseId}
        evidenceId={viewingEvidenceId || ''}
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
      </div>
      {/* Copilot Sidebar */}
      {copilotOpen && (
        <div className="w-80 flex-shrink-0 rounded-xl overflow-hidden border border-slate-200 shadow-md" style={{ height: '700px', position: 'sticky', top: '80px' }}>
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

function EvidencePanel({ evidence, caseId, onRefresh }: { evidence: any[]; caseId: string; onRefresh: () => void }) {
  const [selectedEvidence, setSelectedEvidence] = React.useState<any | null>(null);
  const [addModalOpen, setAddModalOpen] = React.useState(false);

  if (evidence.length === 0) {
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
              
              {/* Show Source Tag */}
              <div className="mt-1">
                <span className="text-[9px] font-medium text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                  Added by {ev.source?.replace(/_/g, ' ') || 'complainant'} on {new Date(ev.collected_at || ev.createdAt).toLocaleDateString('en-IN')}
                </span>
              </div>

              {ev.ai_description && <p className="text-xs text-neutral-600 mt-2 line-clamp-2">{ev.ai_description}</p>}
              
              {ev.ai_tags && ev.ai_tags.length > 0 && (
                 <div className="flex flex-wrap gap-1 mt-2">
                   {ev.is_physical && (
                     <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-bold">
                       📦 PHYSICAL
                     </span>
                   )}
                   {ev.ai_tags.map((tag: string) => (
                     <span key={tag} className="text-[9px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200">
                       #{tag}
                     </span>
                   ))}
                 </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  ev.status === 'verified' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                }`}>
                  {ev.status === 'verified' ? '✓ Verified' : 'Unverified'}
                </span>
                {ev.is_physical && ev.current_location && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-neutral-100 text-neutral-700 border-neutral-200 flex items-center gap-1">
                    📍 {ev.current_location.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
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
    </>
  );
}

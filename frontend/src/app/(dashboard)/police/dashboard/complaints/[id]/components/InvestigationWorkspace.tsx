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
import { Bot, BookOpen, ClipboardList, Send, FolderOpen, Sparkles, Users } from 'lucide-react';
import ThreadViewerModal from './ThreadViewerModal';
import SnapshotDetailModal from './SnapshotDetailModal';
import StepDetailModal from './StepDetailModal';
import { AddEvidenceModal } from './AddEvidenceModal';
import ComplaintDetailModal from './ComplaintDetailModal';
import { DiaryDetailModal } from './DiaryDetailModal';

interface InvestigationWorkspaceProps {
  caseId: string;
}

type WorkspaceTab = 'analysis' | 'diary' | 'checklist' | 'requests' | 'evidence' | 'participants';

export function InvestigationWorkspace({ caseId }: InvestigationWorkspaceProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('analysis');
  const [copilotOpen, setCopilotOpen] = useState(true);

  const [snapshot, setSnapshot] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
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
  const [viewingEvidence, setViewingEvidence] = useState<any | null>(null);
  const [viewingThreadId, setViewingThreadId] = useState<string | null>(null);
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [viewingStepId, setViewingStepId] = useState<string | null>(null);
  const [viewingComplaintData, setViewingComplaintData] = useState<any | null>(null);
  const [selectedDiaryEntry, setSelectedDiaryEntry] = useState<any>(null);

  const fetchWorkspaceData = useCallback(async () => {
    try {
      const [snapRes, checkRes, diaryRes, reqRes, evRes, participantRes] = await Promise.allSettled([
        apiClient.get(`/cases/${caseId}/analysis/latest`),
        apiClient.get(`/cases/${caseId}/checklist`),
        apiClient.get(`/cases/${caseId}/diary`),
        apiClient.get(`/cases/${caseId}/requests`),
        apiClient.get(`/cases/${caseId}/evidence`),
        apiClient.get(`/cases/${caseId}/participants`),
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
      throw error;
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
    { id: 'participants', label: 'Case Participants', icon: <Users size={15} />, badge: participants.length || undefined },
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
            participants={participants}
            loading={actionLoading && !snapshot}
            onCorrectSnapshot={handleCorrectSnapshot}
            onTriggerAnalysis={handleTriggerAnalysis}
            onAttachSectionsToParticipant={handleAttachSectionsToParticipant}
            onAcceptRecommendedSection={handleAcceptRecommendedSection}
            onApproveParticipant={handleApproveParticipant}
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

        {activeTab === 'participants' && (
          <ParticipantsPanel participants={participants} caseId={caseId} onRefresh={fetchWorkspaceData} />
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
        evidence={viewingEvidence}
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

// ─── Participants Panel ──────────────────────────────────────────────────────

function ParticipantsPanel({ participants, caseId, onRefresh }: { participants: any[]; caseId: string; onRefresh: () => void }) {
  const [roleFilter, setRoleFilter] = React.useState<string>('All');
  const [selectedParticipant, setSelectedParticipant] = React.useState<any | null>(null);
  const [promotingId, setPromotingId] = React.useState<string | null>(null);

  const uniqueRoles = Array.from(new Set(participants.flatMap((p) => p.roles || [])));

  const filteredParticipants = roleFilter === 'All'
    ? participants
    : participants.filter((p) => (p.roles || []).includes(roleFilter));

  const handlePromote = async (e: React.MouseEvent, p: any) => {
    e.stopPropagation(); // don't open the detail modal
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

  if (participants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <Users className="h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-neutral-600">No participants found</p>
        <p className="text-xs text-neutral-400 max-w-xs">
          Participants approved via the AI analysis will appear here.
        </p>
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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-neutral-800">Case Participants</h3>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-sm border border-neutral-300 rounded px-3 py-1.5 bg-white text-neutral-700"
        >
          <option value="All">All Roles</option>
          {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredParticipants.map((p: any) => {
          const isSuspect = (p.roles || []).includes('Suspect');
          const isAccused = (p.roles || []).includes('Accused');
          const promoting = promotingId === p.participant_id;

          return (
            <div
              key={p.participant_id || p._id}
              onClick={() => setSelectedParticipant(p)}
              className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-base font-bold text-neutral-900 group-hover:text-blue-700 transition-colors">{p.name}</h4>
                {isSuspect && !isAccused && (
                  <button
                    onClick={(e) => handlePromote(e, p)}
                    disabled={promoting}
                    className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {promoting ? '...' : '⚖️ Promote to Accused'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1 mt-1.5">
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

              <p className="text-[10px] text-blue-500 mt-2 group-hover:underline">Click for full details →</p>
            </div>
          );
        })}
      </div>

      {/* Participant Detail Modal */}
      {selectedParticipant && (
        <ParticipantDetailModal
          participant={selectedParticipant}
          onClose={() => setSelectedParticipant(null)}
        />
      )}
    </>
  );
}

// ─── Participant Detail Modal ────────────────────────────────────────────────

function ParticipantDetailModal({ participant: p, onClose }: { participant: any; onClose: () => void }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto"
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
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors text-2xl leading-none">×</button>
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

          {/* Witness Profile */}
          {p.witnessProfile?.statement && (
            <section>
              <h3 className="text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2">Witness Statement</h3>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm text-neutral-700">
                <p>{p.witnessProfile.statement}</p>
                {p.witnessProfile.statementRecordedAt && (
                  <p className="text-xs text-neutral-400 mt-1">Recorded: {new Date(p.witnessProfile.statementRecordedAt).toLocaleString('en-IN')}</p>
                )}
              </div>
            </section>
          )}

          {/* Suspect Profile (only show if not also accused) */}
          {p.suspectProfile && !(p.roles || []).includes('Accused') && (
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
        </div>
      </div>
    </div>
  );
}


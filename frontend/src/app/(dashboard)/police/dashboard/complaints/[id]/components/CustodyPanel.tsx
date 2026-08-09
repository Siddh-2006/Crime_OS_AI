'use client';

import React, { useState, useCallback } from 'react';
import {
  Shield, User, ChevronDown, ChevronUp, CheckCircle2,
  Clock, XCircle, AlertTriangle, ExternalLink, Lock,
} from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import { WarrantDraftModal } from './WarrantDraftModal';
import { CustodyCountdown } from './CustodyCountdown';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppliedSection { code: string; title: string; reason?: string }
interface Identifier     { type: string; value: string }

interface Participant {
  participant_id: string;
  name: string;
  roles: string[];
  contact?: { phone?: string; email?: string; address?: string };
  identifiers?: Identifier[];
  suspectProfile?: { appliedSections?: AppliedSection[] };
  accusedProfile?:  { appliedSections?: AppliedSection[] };
}

interface Warrant {
  warrant_id: string;
  participant_id: string;
  status: string;
  justification: string;
  warrant_draft_content: string;
  fir_number: string;
  police_station: string;
  district: string;
  accused_name: string;
  accused_address?: string;
  applied_sections?: AppliedSection[];
  sent_at?: string;
  magistrate_approval_status?: string;
  magistrate_rejection_reason?: string;
  signed_warrant_pdf_url?: string;
  arrested_at?: string;
  custody_deadline?: string;
  produced_before_court_at?: string;
  createdAt?: string;
}

interface ComplaintData {
  firNumber?: string;
  policeStation?: { name?: string; district?: string };
}

interface CustodyPanelProps {
  caseId: string;
  participants: Participant[];
  warrants: Warrant[];
  complaintData: ComplaintData | null;
  onRefresh: () => void;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; pill: string; icon: React.ReactNode }> = {
  draft: {
    label: 'Draft',
    pill:  'bg-neutral-100 text-neutral-600 border-neutral-200',
    icon:  <Clock size={11} />,
  },
  sent_to_magistrate: {
    label: 'Sent to Magistrate',
    pill:  'bg-blue-100 text-blue-700 border-blue-200',
    icon:  <Clock size={11} className="animate-pulse" />,
  },
  approved: {
    label: 'Magistrate Approved',
    pill:  'bg-green-100 text-green-700 border-green-200',
    icon:  <CheckCircle2 size={11} />,
  },
  rejected: {
    label: 'Rejected',
    pill:  'bg-red-100 text-red-700 border-red-200',
    icon:  <XCircle size={11} />,
  },
  in_custody: {
    label: 'In Custody',
    pill:  'bg-orange-100 text-orange-700 border-orange-200',
    icon:  <Lock size={11} />,
  },
  produced_before_court: {
    label: 'Produced Before Court',
    pill:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon:  <CheckCircle2 size={11} />,
  },
  released: {
    label: 'Released',
    pill:  'bg-neutral-200 text-neutral-600 border-neutral-300',
    icon:  <CheckCircle2 size={11} />,
  },
};

const ACTIVE_STATUSES = ['draft', 'sent_to_magistrate', 'approved', 'in_custody'];

// ─── Warrant card ─────────────────────────────────────────────────────────────

function WarrantCard({
  warrant,
  participant,
  caseId,
  complaintData,
  onRefresh,
  showToast,
}: {
  warrant: Warrant;
  participant: Participant | undefined;
  caseId: string;
  complaintData: ComplaintData | null;
  onRefresh: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [expanded,        setExpanded]        = useState(false);
  const [draftOpen,       setDraftOpen]       = useState(false);
  const [custodyLoading,  setCustodyLoading]  = useState(false);
  const [produceLoading,  setProduceLoading]  = useState(false);
  const [releaseLoading,  setReleaseLoading]  = useState(false);
  const [confirmCustody,  setConfirmCustody]  = useState(false);

  const cfg = STATUS_CFG[warrant.status] ?? STATUS_CFG.draft;

  const handleTakeIntoCustody = async () => {
    if (!confirmCustody) { setConfirmCustody(true); return; }
    setCustodyLoading(true);
    setConfirmCustody(false);
    try {
      await apiClient.post(API_ROUTES.CASES.WARRANT_CUSTODY(caseId, warrant.warrant_id));
      showToast(`${warrant.accused_name} taken into custody. 24-hour timer started.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to take into custody.', 'error');
    } finally {
      setCustodyLoading(false);
    }
  };

  const handleProduce = async () => {
    setProduceLoading(true);
    try {
      await apiClient.post(API_ROUTES.CASES.WARRANT_PRODUCED(caseId, warrant.warrant_id));
      showToast(`${warrant.accused_name} marked as produced before court.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to mark produced.', 'error');
    } finally {
      setProduceLoading(false);
    }
  };

  const handleRelease = async () => {
    setReleaseLoading(true);
    try {
      await apiClient.post(API_ROUTES.CASES.WARRANT_RELEASE(caseId, warrant.warrant_id));
      showToast(`${warrant.accused_name} marked as released.`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to mark released.', 'error');
    } finally {
      setReleaseLoading(false);
    }
  };

  const isTerminal = ['rejected', 'produced_before_court', 'released'].includes(warrant.status);

  return (
    <>
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="flex items-start gap-3 p-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
            <Shield size={14} className="text-slate-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-neutral-900">{warrant.accused_name}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              FIR {warrant.fir_number} · {warrant.police_station}
              {warrant.createdAt && (
                <> · Created {new Date(warrant.createdAt).toLocaleDateString('en-IN')}</>
              )}
            </p>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {/* Context actions */}
            {warrant.status === 'draft' && (
              <button
                onClick={() => setDraftOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >
                Edit Draft
              </button>
            )}
            {warrant.status === 'approved' && (
              <button
                onClick={handleTakeIntoCustody}
                disabled={custodyLoading}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  confirmCustody
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                <Lock size={12} />
                {custodyLoading ? 'Processing…' : confirmCustody ? 'Confirm Arrest?' : 'Take into Custody'}
              </button>
            )}
            {warrant.status === 'in_custody' && (
              <div className="flex flex-col gap-1.5 items-end">
                <button
                  onClick={handleProduce}
                  disabled={produceLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={12} />
                  {produceLoading ? 'Saving…' : 'Produced Before Court'}
                </button>
                <button
                  onClick={handleRelease}
                  disabled={releaseLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                >
                  {releaseLoading ? 'Saving…' : 'Mark Released'}
                </button>
              </div>
            )}
            {warrant.signed_warrant_pdf_url && (
              <a
                href={warrant.signed_warrant_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 underline"
              >
                <ExternalLink size={10} /> Signed PDF
              </a>
            )}

            {/* Expand toggle */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-neutral-400 hover:text-neutral-600 p-0.5 transition-colors"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {/* 24-hour countdown banner */}
        {warrant.status === 'in_custody' && warrant.custody_deadline && (
          <div className="px-4 pb-3">
            <CustodyCountdown
              custodyDeadline={warrant.custody_deadline}
              accusedName={warrant.accused_name}
              onProduceBefore={handleProduce}
              producingLoading={produceLoading}
            />
          </div>
        )}

        {/* Rejection reason banner */}
        {warrant.status === 'rejected' && warrant.magistrate_rejection_reason && (
          <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="font-bold">Rejection reason: </span>
            {warrant.magistrate_rejection_reason}
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 space-y-3">
            {warrant.justification && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Justification</p>
                <p className="text-xs text-neutral-700 leading-relaxed">{warrant.justification}</p>
              </div>
            )}
            {warrant.applied_sections && warrant.applied_sections.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Applied Sections</p>
                <div className="flex flex-wrap gap-1.5">
                  {warrant.applied_sections.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
                      § {s.code}: {s.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {warrant.warrant_id && (
              <p className="text-[10px] text-neutral-300 font-mono">ID: {warrant.warrant_id}</p>
            )}
          </div>
        )}
      </div>

      {/* Draft / edit modal */}
      {participant && (
        <WarrantDraftModal
          isOpen={draftOpen}
          onClose={() => setDraftOpen(false)}
          caseId={caseId}
          participant={participant}
          complaintData={complaintData}
          existingWarrant={warrant}
          onWarrantSaved={(w) => { onRefresh(); }}
          onWarrantSent={(w)  => { setDraftOpen(false); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Participant row (for suspects/accused without a warrant yet) ──────────────

function ParticipantRow({
  participant,
  caseId,
  complaintData,
  onRefresh,
  showToast,
}: {
  participant: Participant;
  caseId: string;
  complaintData: ComplaintData | null;
  onRefresh: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const sections: AppliedSection[] =
    (participant.accusedProfile?.appliedSections?.length
      ? participant.accusedProfile.appliedSections
      : participant.suspectProfile?.appliedSections) ?? [];

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0">
          <User size={14} className="text-neutral-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-800">{participant.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {participant.roles.map(r => (
              <span key={r} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {r}
              </span>
            ))}
            {sections.length > 0 && (
              <span className="text-[10px] text-neutral-400">{sections.length} section{sections.length !== 1 ? 's' : ''} applied</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setDraftOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-800 text-white transition-colors"
        >
          <Shield size={12} /> Draft Warrant
        </button>
      </div>

      <WarrantDraftModal
        isOpen={draftOpen}
        onClose={() => setDraftOpen(false)}
        caseId={caseId}
        participant={participant}
        complaintData={complaintData}
        existingWarrant={null}
        onWarrantSaved={(w) => { setDraftOpen(false); onRefresh(); }}
        onWarrantSent={(w)  => { setDraftOpen(false); onRefresh(); }}
      />
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CustodyPanel({
  caseId,
  participants,
  warrants,
  complaintData,
  onRefresh,
}: CustodyPanelProps) {
  const { showToast } = useToast();

  // Only suspects and accused are relevant for custody
  const eligibleParticipants = participants.filter(p =>
    p.roles.includes('Suspect') || p.roles.includes('Accused'),
  );

  // Map participant_id → active warrant (non-terminal)
  const activeWarrantByParticipant = new Map<string, Warrant>();
  for (const w of warrants) {
    if (ACTIVE_STATUSES.includes(w.status)) {
      activeWarrantByParticipant.set(w.participant_id, w);
    }
  }

  // Participants with no active warrant — show "Draft Warrant" row
  const withoutWarrant = eligibleParticipants.filter(
    p => !activeWarrantByParticipant.has(p.participant_id),
  );

  // Active + terminal warrants for display
  const activeWarrants   = warrants.filter(w => ACTIVE_STATUSES.includes(w.status));
  const terminalWarrants = warrants.filter(w => !ACTIVE_STATUSES.includes(w.status));

  // Deadline alerts: in_custody warrants within 2h or past
  const deadlineAlerts = warrants.filter(w =>
    w.status === 'in_custody' &&
    w.custody_deadline &&
    new Date(w.custody_deadline).getTime() - Date.now() < 2 * 60 * 60 * 1_000,
  );

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-slate-300" />
          <div>
            <h3 className="text-base font-bold">Custody & Arrest Warrants</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Draft and send BNSS Form No. 2 arrest warrants to the magistrate. Manage custody lifecycle and BNSS §57 deadlines.
            </p>
          </div>
        </div>
        {/* Summary counts */}
        <div className="mt-3 flex gap-3 flex-wrap">
          {[
            { label: 'Active',   count: activeWarrants.length,   cls: 'bg-white/20 text-white' },
            { label: 'Pending',  count: withoutWarrant.length,   cls: 'bg-white/10 text-slate-300' },
            { label: 'Resolved', count: terminalWarrants.length, cls: 'bg-white/10 text-slate-300' },
          ].map(({ label, count, cls }) => (
            <div key={label} className={`rounded-lg px-3 py-1.5 text-center ${cls}`}>
              <div className="text-lg font-black">{count}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Urgent deadline alerts ──────────────────────────────────────────── */}
      {deadlineAlerts.map(w => (
        <CustodyCountdown
          key={w.warrant_id}
          custodyDeadline={w.custody_deadline!}
          accusedName={w.accused_name}
          onProduceBefore={async () => {
            try {
              await apiClient.post(API_ROUTES.CASES.WARRANT_PRODUCED(caseId, w.warrant_id));
              showToast(`${w.accused_name} produced before court.`, 'success');
              onRefresh();
            } catch (err: any) {
              showToast(err?.response?.data?.message ?? 'Failed.', 'error');
            }
          }}
        />
      ))}

      {/* ── Suspects/Accused without a warrant ─────────────────────────────── */}
      {withoutWarrant.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
            Suspects / Accused — No Active Warrant
          </p>
          <div className="space-y-2">
            {withoutWarrant.map(p => (
              <ParticipantRow
                key={p.participant_id}
                participant={p}
                caseId={caseId}
                complaintData={complaintData}
                onRefresh={onRefresh}
                showToast={showToast}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Active warrants ────────────────────────────────────────────────── */}
      {activeWarrants.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
            Active Warrants
          </p>
          <div className="space-y-3">
            {activeWarrants.map(w => (
              <WarrantCard
                key={w.warrant_id}
                warrant={w}
                participant={eligibleParticipants.find(p => p.participant_id === w.participant_id)}
                caseId={caseId}
                complaintData={complaintData}
                onRefresh={onRefresh}
                showToast={showToast}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Resolved warrants (collapsed) ──────────────────────────────────── */}
      {terminalWarrants.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
            Resolved Warrants
          </p>
          <div className="space-y-2">
            {terminalWarrants.map(w => (
              <WarrantCard
                key={w.warrant_id}
                warrant={w}
                participant={eligibleParticipants.find(p => p.participant_id === w.participant_id)}
                caseId={caseId}
                complaintData={complaintData}
                onRefresh={onRefresh}
                showToast={showToast}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {eligibleParticipants.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-center gap-3">
          <Shield size={36} className="text-neutral-300" />
          <div>
            <p className="text-sm font-semibold text-neutral-500">No suspects or accused on record</p>
            <p className="text-xs text-neutral-400 mt-1">
              Add participants with Suspect or Accused roles from the Case Participants tab or AI Analysis panel first.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

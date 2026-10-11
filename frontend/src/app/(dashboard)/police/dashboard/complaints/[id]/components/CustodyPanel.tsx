'use client';

import React, { useState } from 'react';
import {
  Shield, User, ChevronDown, ChevronUp, CheckCircle2,
  Clock, XCircle, AlertTriangle, ExternalLink, Lock, FileText, X, Eye,
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
  // accusedProfile was removed from the backend model — sections are always stored in suspectProfile
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

// ─── Status config (semantic tokens) ─────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; pill: string; icon: React.ReactNode }> = {
  draft: {
    label: 'Draft',
    pill:  'bg-surface-elevated text-text-secondary border-border',
    icon:  <Clock size={11} />,
  },
  sent_to_magistrate: {
    label: 'Sent to Magistrate',
    pill:  'bg-brand-primary/10 text-brand-primary border-brand-primary/30',
    icon:  <Clock size={11} className="animate-pulse" />,
  },
  approved: {
    label: 'Magistrate Approved',
    pill:  'bg-semantic-success/10 text-semantic-success border-semantic-success/30',
    icon:  <CheckCircle2 size={11} />,
  },
  rejected: {
    label: 'Rejected',
    pill:  'bg-semantic-critical/10 text-semantic-critical border-semantic-critical/30',
    icon:  <XCircle size={11} />,
  },
  in_custody: {
    label: 'In Custody',
    pill:  'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30',
    icon:  <Lock size={11} />,
  },
  produced_before_court: {
    label: 'Produced Before Court',
    pill:  'bg-semantic-success/10 text-semantic-success border-semantic-success/30',
    icon:  <CheckCircle2 size={11} />,
  },
  released: {
    label: 'Released',
    pill:  'bg-surface-elevated text-text-secondary border-border',
    icon:  <CheckCircle2 size={11} />,
  },
};

const ACTIVE_STATUSES = ['draft', 'sent_to_magistrate', 'approved', 'in_custody'];

// ─── Warrant View Modal (scrollable full document preview) ────────────────────

function WarrantViewModal({
  isOpen,
  onClose,
  warrant,
}: {
  isOpen: boolean;
  onClose: () => void;
  warrant: Warrant;
}) {
  if (!isOpen) return null;

  const cfg = STATUS_CFG[warrant.status] ?? STATUS_CFG.draft;
  const sections = warrant.applied_sections ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-surface-elevated border-b border-border rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
              <Shield size={15} className="text-brand-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">Warrant Document — {warrant.accused_name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                  {cfg.icon} {cfg.label}
                </span>
                {warrant.sent_at && (
                  <span className="text-[10px] text-text-secondary font-mono">
                    Sent {new Date(warrant.sent_at).toLocaleDateString('en-IN')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="rounded-xl border border-border bg-surface-elevated p-5">

            {/* Document header */}
            <div className="text-center pb-4 mb-4 border-b border-border">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Gujarat Police</p>
              <p className="text-base font-black text-text-primary mt-1">WARRANT OF ARREST</p>
              <p className="text-[11px] text-text-secondary mt-0.5">Bharatiya Nagarik Suraksha Sanhita, 2023 — Section 70</p>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-4">
              {[
                ['FIR No.', warrant.fir_number || '(not registered)'],
                ['Police Station', warrant.police_station],
                ['District', warrant.district],
                ['Date', warrant.createdAt ? new Date(warrant.createdAt).toLocaleDateString('en-IN') : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-text-secondary font-medium shrink-0">{label}:</span>
                  <span className="font-semibold text-text-primary">{val}</span>
                </div>
              ))}
            </div>

            {/* Accused block */}
            <div className="rounded-lg border border-border bg-surface p-4 mb-4 text-xs space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Accused Person</p>
              <p className="font-bold text-text-primary text-sm">{warrant.accused_name}</p>
              {warrant.accused_address && (
                <p className="text-text-secondary">of {warrant.accused_address}</p>
              )}
            </div>

            {/* WHEREAS */}
            <div className="mb-4">
              <p className="text-xs text-text-primary leading-relaxed">
                <span className="font-bold">WHEREAS</span> the above-named person stands charged with the offence(s) of:
              </p>
            </div>

            {/* Sections */}
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">Charged Under</p>
              {sections.length > 0 ? (
                <div className="space-y-2">
                  {sections.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-brand-primary font-bold shrink-0 min-w-[60px]">§ {s.code}</span>
                      <span className="text-text-primary">{s.title}</span>
                      {s.reason && <span className="text-text-secondary ml-1">— {s.reason}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-secondary italic text-[11px]">No sections were attached at the time of drafting.</p>
              )}
            </div>

            {/* Justification */}
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">Grounds for Arrest</p>
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                  {warrant.justification || '(No justification provided)'}
                </p>
              </div>
            </div>

            {/* Rejection reason (if rejected) */}
            {warrant.status === 'rejected' && warrant.magistrate_rejection_reason && (
              <div className="mb-4 rounded-lg border border-semantic-critical/30 bg-semantic-critical/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-semantic-critical mb-1">Magistrate Rejection Reason</p>
                <p className="text-xs text-semantic-critical leading-relaxed">{warrant.magistrate_rejection_reason}</p>
              </div>
            )}

            {/* Mandate text */}
            <div className="text-xs text-text-primary border-t border-border pt-4 space-y-2">
              <p>
                You are hereby directed to arrest the said{' '}
                <strong>{warrant.accused_name}</strong> and produce him/her before the Court /
                Magistrate without delay. <strong>HEREIN FAIL NOT.</strong>
              </p>
              <p className="text-text-secondary">
                Place: {warrant.police_station}
              </p>
            </div>

            {/* Signature row */}
            <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 gap-4 text-[10px] text-text-secondary text-center">
              <div className="border border-dashed border-border rounded-lg px-3 py-4">(Seal of the Court)</div>
              <div className="border border-dashed border-border rounded-lg px-3 py-4">(Signature of Magistrate)</div>
            </div>
          </div>

          {/* Raw text fallback — if warrant_draft_content differs from the structured preview */}
          {warrant.warrant_draft_content && (
            <details className="mt-4 group">
              <summary className="text-[10px] font-bold uppercase tracking-wider text-text-secondary cursor-pointer hover:text-text-primary transition-colors select-none">
                <span className="ml-1">Raw Warrant Text</span>
              </summary>
              <pre className="mt-2 rounded-lg border border-border bg-surface p-3 text-[11px] text-text-primary font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                {warrant.warrant_draft_content}
              </pre>
            </details>
          )}

          {/* Warrant ID */}
          <p className="text-[10px] text-text-secondary font-mono mt-3">Warrant ID: {warrant.warrant_id}</p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-surface-elevated rounded-b-2xl flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-text-secondary hover:text-text-primary font-medium transition-colors cursor-pointer">
            Close
          </button>
          {warrant.signed_warrant_pdf_url && (
            <a
              href={warrant.signed_warrant_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white transition-colors"
            >
              <ExternalLink size={13} /> View Signed PDF
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [expanded,       setExpanded]       = useState(false);
  const [draftOpen,      setDraftOpen]      = useState(false);
  const [viewOpen,       setViewOpen]       = useState(false);
  const [custodyLoading, setCustodyLoading] = useState(false);
  const [produceLoading, setProduceLoading] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [confirmCustody, setConfirmCustody] = useState(false);

  const cfg = STATUS_CFG[warrant.status] ?? STATUS_CFG.draft;
  const isTerminal = ['rejected', 'produced_before_court', 'released'].includes(warrant.status);

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
      showToast(err?.response?.data?.message ?? 'Failed.', 'error');
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
      showToast(err?.response?.data?.message ?? 'Failed.', 'error');
    } finally {
      setReleaseLoading(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
        {/* Header row */}
        <div className="flex items-start gap-3 p-4">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center cursor-pointer hover:bg-brand-primary/10 hover:border-brand-primary/20 transition-colors"
            onClick={() => setViewOpen(true)}
            title="View full warrant document"
          >
            <Shield size={14} className="text-text-secondary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-sm font-bold text-text-primary cursor-pointer hover:text-brand-primary transition-colors"
                onClick={() => setViewOpen(true)}
                title="View full warrant document"
              >
                {warrant.accused_name}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              FIR {warrant.fir_number} · {warrant.police_station}
              {warrant.createdAt && <> · Created {new Date(warrant.createdAt).toLocaleDateString('en-IN')}</>}
            </p>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {/* View Warrant button — always visible */}
            <button
              onClick={() => setViewOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary transition-colors cursor-pointer"
            >
              <Eye size={12} /> View Warrant
            </button>

            {/* Contextual actions */}
            {warrant.status === 'draft' && (
              <button
                onClick={() => setDraftOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-surface-elevated hover:bg-surface text-text-primary transition-colors cursor-pointer"
              >
                Edit Draft
              </button>
            )}

            {warrant.status === 'approved' && (
              <button
                onClick={handleTakeIntoCustody}
                disabled={custodyLoading}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer ${
                  confirmCustody
                    ? 'bg-semantic-critical hover:bg-semantic-critical/90 text-white animate-pulse'
                    : 'bg-semantic-warning hover:bg-semantic-warning/90 text-white'
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-semantic-success hover:bg-semantic-success/90 text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 size={12} />
                  {produceLoading ? 'Saving…' : 'Produced Before Court'}
                </button>
                <button
                  onClick={handleRelease}
                  disabled={releaseLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-surface-elevated hover:bg-surface text-text-secondary transition-colors disabled:opacity-50 cursor-pointer"
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
                className="inline-flex items-center gap-1 text-[10px] text-brand-primary hover:underline"
              >
                <ExternalLink size={10} /> Signed PDF
              </a>
            )}

            <button
              onClick={() => setExpanded(v => !v)}
              className="text-text-secondary hover:text-text-primary p-0.5 transition-colors cursor-pointer"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* 24-hour countdown */}
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

        {/* Rejection reason */}
        {warrant.status === 'rejected' && warrant.magistrate_rejection_reason && (
          <div className="mx-4 mb-3 rounded-xl border border-semantic-critical/20 bg-semantic-critical/5 px-3 py-2 text-xs text-semantic-critical">
            <span className="font-bold">Rejection reason: </span>
            {warrant.magistrate_rejection_reason}
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-border bg-surface-elevated px-4 py-3 space-y-3">
            {warrant.justification && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Justification</p>
                <p className="text-xs text-text-primary leading-relaxed">{warrant.justification}</p>
              </div>
            )}
            {warrant.applied_sections && warrant.applied_sections.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Applied Sections</p>
                <div className="flex flex-wrap gap-1.5">
                  {warrant.applied_sections.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-semibold">
                      § {s.code}: {s.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {warrant.warrant_id && (
              <p className="text-[10px] text-text-secondary font-mono">ID: {warrant.warrant_id}</p>
            )}
          </div>
        )}
      </div>

      {/* Full warrant document view modal */}
      <WarrantViewModal
        isOpen={viewOpen}
        onClose={() => setViewOpen(false)}
        warrant={warrant}
      />

      {/* Draft modal */}
      {participant && (
        <WarrantDraftModal
          isOpen={draftOpen}
          onClose={() => setDraftOpen(false)}
          caseId={caseId}
          participant={participant}
          complaintData={complaintData}
          existingWarrant={warrant}
          onWarrantSaved={() => { onRefresh(); }}
          onWarrantSent={() => { setDraftOpen(false); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Participant row (no active warrant yet) ──────────────────────────────────

function ParticipantRow({
  participant,
  caseId,
  complaintData,
  onRefresh,
}: {
  participant: Participant;
  caseId: string;
  complaintData: ComplaintData | null;
  onRefresh: () => void;
}) {
  const [draftOpen, setDraftOpen] = useState(false);

  // accusedProfile was removed from the backend model — sections are always stored in suspectProfile
  const sections: AppliedSection[] = participant.suspectProfile?.appliedSections ?? [];

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center flex-shrink-0">
          <User size={14} className="text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{participant.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {participant.roles.filter(r => !(r === 'Suspect' && participant.roles.includes('Accused'))).map(r => (
              <span key={r} className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-surface-elevated text-text-secondary border border-border">
                {r}
              </span>
            ))}
            {sections.length > 0 && (
              <span className="text-[10px] text-text-secondary">
                {sections.length} section{sections.length !== 1 ? 's' : ''} applied
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setDraftOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white transition-colors cursor-pointer"
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
        onWarrantSaved={() => { setDraftOpen(false); onRefresh(); }}
        onWarrantSent={() => { setDraftOpen(false); onRefresh(); }}
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

  const eligibleParticipants = participants.filter(p =>
    p.roles.includes('Suspect') || p.roles.includes('Accused'),
  );

  const activeWarrantByParticipant = new Map<string, Warrant>();
  for (const w of warrants) {
    if (ACTIVE_STATUSES.includes(w.status)) {
      activeWarrantByParticipant.set(w.participant_id, w);
    }
  }

  const withoutWarrant = eligibleParticipants.filter(
    p => !activeWarrantByParticipant.has(p.participant_id),
  );

  const activeWarrants   = warrants.filter(w => ACTIVE_STATUSES.includes(w.status));
  const terminalWarrants = warrants.filter(w => !ACTIVE_STATUSES.includes(w.status));

  // Warrants within 2h of deadline or past — shown as top-level alert
  const deadlineAlerts = warrants.filter(w =>
    w.status === 'in_custody' &&
    w.custody_deadline &&
    new Date(w.custody_deadline).getTime() - Date.now() < 2 * 60 * 60 * 1_000,
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="rounded-xl border border-border bg-surface-elevated p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
            <Shield size={18} className="text-brand-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Custody & Arrest Warrants</h3>
            <p className="text-xs text-text-secondary">
              Draft BNSS Form No. 2 warrants · Send to magistrate · Manage BNSS §57 custody deadlines
            </p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'Active',   count: activeWarrants.length },
            { label: 'Pending',  count: withoutWarrant.length },
            { label: 'Resolved', count: terminalWarrants.length },
          ].map(({ label, count }) => (
            <div key={label} className="rounded-xl border border-border bg-surface px-4 py-2 text-center min-w-[72px]">
              <div className="text-lg font-black text-text-primary">{count}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top-level deadline alerts (warrants within 2h or passed) */}
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

      {/* Suspects/Accused without a warrant */}
      {withoutWarrant.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">
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
              />
            ))}
          </div>
        </section>
      )}

      {/* Active warrants */}
      {activeWarrants.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">
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

      {/* Resolved warrants */}
      {terminalWarrants.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">
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
          <div className="w-14 h-14 rounded-2xl bg-surface-elevated border border-border flex items-center justify-center">
            <Shield size={24} className="text-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">No suspects or accused on record</p>
            <p className="text-xs text-text-secondary mt-1 max-w-xs">
              Add participants with Suspect or Accused roles from the Case Participants tab or AI Analysis panel first.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

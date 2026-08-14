'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Send, Shield, CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES } from '@/lib/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppliedSection { code: string; title: string; reason?: string }
interface Identifier     { type: string; value: string }

interface Participant {
  participant_id: string;
  name: string;
  contact?: { phone?: string; email?: string; address?: string };
  identifiers?: Identifier[];
  roles: string[];
  suspectProfile?: { appliedSections?: AppliedSection[] };
  accusedProfile?:  { appliedSections?: AppliedSection[] };
}

interface Warrant {
  warrant_id: string;
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
}

interface ComplaintData {
  firNumber?: string;
  policeStation?: { name?: string; district?: string };
}

interface WarrantDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  participant: Participant;
  complaintData: ComplaintData | null;
  existingWarrant?: Warrant | null;
  onWarrantSaved: (warrant: Warrant) => void;
  onWarrantSent:  (warrant: Warrant) => void;
}

// ─── Client-side BNSS Form No. 2 template (mirrors warrantTemplateService.ts) ─

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildPreviewContent(opts: {
  firNumber: string;
  policeStation: string;
  district: string;
  accusedName: string;
  accusedAddress?: string;
  identifiers?: Identifier[];
  sections: AppliedSection[];
  justification: string;
}): string {
  const date = formatDate(new Date());
  const sectionsText = opts.sections.length > 0
    ? opts.sections.map((s, i) =>
        `  ${i + 1}. Section ${s.code}: ${s.title}${s.reason ? ` — ${s.reason}` : ''}`
      ).join('\n')
    : '  (Applied sections not yet attached to this participant)';

  const identifierText = (opts.identifiers ?? [])
    .filter(id => id.type && id.value)
    .map(id => `  ${id.type}: ${id.value}`)
    .join('\n');

  return [
    'WARRANT OF ARREST',
    '(See Section 70, Bharatiya Nagarik Suraksha Sanhita, 2023)',
    '',
    `FIR No.       : ${opts.firNumber}`,
    `Police Station: ${opts.policeStation}, ${opts.district}`,
    `Dated         : ${date}`,
    '',
    'WHEREAS',
    '',
    `${opts.accusedName}${opts.accusedAddress ? `\nof ${opts.accusedAddress}` : ''}${identifierText ? `\n${identifierText}` : ''}`,
    '',
    'stands charged with the offence(s) of:',
    '',
    sectionsText,
    '',
    'GROUNDS FOR ARREST:',
    '',
    opts.justification || '(Justification to be filled by the IO)',
    '',
    'You are hereby directed to arrest the said person and produce',
    'him / her before the Court / Magistrate without delay.',
    '',
    'HEREIN FAIL NOT.',
    '',
    `Place : ${opts.policeStation}`,
    '',
    '(Seal of the Court)              (Signature of Magistrate)',
  ].join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WarrantDraftModal({
  isOpen,
  onClose,
  caseId,
  participant,
  complaintData,
  existingWarrant,
  onWarrantSaved,
  onWarrantSent,
}: WarrantDraftModalProps) {
  const [justification, setJustification] = useState('');
  const [justError,     setJustError]     = useState('');
  const [saving,        setSaving]         = useState(false);
  const [sending,       setSending]        = useState(false);
  const [apiError,      setApiError]       = useState('');
  const [savedWarrant,  setSavedWarrant]   = useState<Warrant | null>(existingWarrant ?? null);

  const sections: AppliedSection[] =
    (participant.accusedProfile?.appliedSections?.length
      ? participant.accusedProfile.appliedSections
      : participant.suspectProfile?.appliedSections) ?? [];

  const firNumber     = complaintData?.firNumber ?? '';
  const policeStation = complaintData?.policeStation?.name     ?? '—';
  const district      = complaintData?.policeStation?.district ?? '—';
  const noFir         = !firNumber;

  useEffect(() => {
    if (!isOpen) return;
    if (existingWarrant) {
      setSavedWarrant(existingWarrant);
      setJustification(existingWarrant.justification ?? '');
    } else {
      setSavedWarrant(null);
      setJustification('');
    }
    setJustError('');
    setApiError('');
  }, [isOpen, existingWarrant]);

  const previewContent = useMemo(() => buildPreviewContent({
    firNumber:      firNumber || '(FIR not yet registered)',
    policeStation,
    district,
    accusedName:    participant.name,
    accusedAddress: participant.contact?.address,
    identifiers:    participant.identifiers,
    sections,
    justification,
  }), [firNumber, policeStation, district, participant, sections, justification]);

  if (!isOpen) return null;

  const isDraft = !savedWarrant || savedWarrant.status === 'draft';
  const canSend = !!savedWarrant && savedWarrant.status === 'draft';

  const handleSave = async () => {
    if (justification.trim().length < 10) {
      setJustError('Please provide at least 10 characters explaining why this person should be arrested.');
      return;
    }
    setJustError('');
    setApiError('');
    setSaving(true);
    try {
      let result: Warrant;
      if (savedWarrant) {
        const res = await apiClient.patch(
          API_ROUTES.CASES.WARRANT_DETAIL(caseId, savedWarrant.warrant_id),
          { justification: justification.trim() },
        );
        result = res.data.data as Warrant;
      } else {
        const res = await apiClient.post(
          API_ROUTES.CASES.WARRANTS(caseId),
          { participant_id: participant.participant_id, justification: justification.trim() },
        );
        result = res.data.data as Warrant;
      }
      setSavedWarrant(result);
      onWarrantSaved(result);
    } catch (err: any) {
      setApiError(err?.response?.data?.message ?? err?.message ?? 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!savedWarrant) return;
    setApiError('');
    setSending(true);
    try {
      const res = await apiClient.post(API_ROUTES.CASES.WARRANT_SEND(caseId, savedWarrant.warrant_id));
      const updated = res.data.data as Warrant;
      setSavedWarrant(updated);
      onWarrantSent(updated);
      onClose();
    } catch (err: any) {
      setApiError(err?.response?.data?.message ?? err?.message ?? 'Failed to send warrant.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-border">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-surface-elevated border-b border-border rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
              <Shield size={15} className="text-brand-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">Arrest Warrant — BNSS Form No. 2</h2>
              <p className="text-[11px] text-text-secondary">{participant.name} · {participant.roles.join(', ')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        {/* No-FIR warning */}
        {noFir && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-semantic-warning/30 bg-semantic-warning/5 px-4 py-3 text-sm">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-semantic-warning" />
            <span className="text-text-primary">
              <strong>FIR not registered.</strong> A valid FIR number is required before drafting a warrant.
              Please register the FIR first.
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Already-sent status */}
          {savedWarrant && savedWarrant.status !== 'draft' && (
            <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
                <CheckCircle2 size={14} />
                Status: {savedWarrant.status.replace(/_/g, ' ')}
              </div>
              {savedWarrant.sent_at && (
                <p className="text-xs text-text-secondary">
                  Sent: {new Date(savedWarrant.sent_at).toLocaleString('en-IN')}
                </p>
              )}
              {savedWarrant.magistrate_rejection_reason && (
                <p className="text-xs text-semantic-critical">
                  Rejection: {savedWarrant.magistrate_rejection_reason}
                </p>
              )}
              {savedWarrant.signed_warrant_pdf_url && (
                <a href={savedWarrant.signed_warrant_pdf_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline">
                  <ExternalLink size={11} /> View signed warrant PDF
                </a>
              )}
            </div>
          )}

          {/* Justification — ONLY editable field */}
          {isDraft && (
            <div>
              <label className="block text-xs font-bold text-text-primary mb-1">
                Justification for Arrest <span className="text-semantic-critical">*</span>
              </label>
              <p className="text-[11px] text-text-secondary mb-2">
                State the grounds for arrest. This is the only field you need to fill — everything else auto-fills from the case.
              </p>
              <textarea
                value={justification}
                onChange={(e) => { setJustification(e.target.value); setJustError(''); }}
                rows={4}
                disabled={noFir}
                autoFocus
                placeholder="e.g. The accused is the identified perpetrator based on CDR evidence and witness statements. There is a credible risk of evidence tampering and absconding given the financial scale of the offence."
                className={`w-full rounded-xl border text-sm px-3 py-2.5 resize-none bg-surface focus:outline-none focus:ring-2 focus:ring-brand-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text-primary placeholder:text-text-secondary ${
                  justError ? 'border-semantic-critical/60' : 'border-border'
                }`}
              />
              {justError && <p className="text-xs text-semantic-critical mt-1">{justError}</p>}
            </div>
          )}

          {/* Warrant Preview */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={12} className="text-text-secondary" />
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                Warrant Preview — PDF sent to magistrate will match this
              </span>
            </div>
            <div className="rounded-xl border border-border bg-surface-elevated p-4">
              {/* Document header */}
              <div className="text-center pb-3 mb-3 border-b border-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Gujarat Police</p>
                <p className="text-sm font-black text-text-primary mt-0.5">WARRANT OF ARREST</p>
                <p className="text-[10px] text-text-secondary">Bharatiya Nagarik Suraksha Sanhita, 2023 — Section 70</p>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                {[
                  ['FIR No.',        firNumber || '(not registered)'],
                  ['Police Station', policeStation],
                  ['District',       district],
                  ['Date',           formatDate(new Date())],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-1">
                    <span className="text-text-secondary font-medium shrink-0">{label}:</span>
                    <span className={`font-semibold ${!firNumber && label === 'FIR No.' ? 'text-semantic-critical' : 'text-text-primary'}`}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Accused */}
              <div className="rounded-lg border border-border bg-surface p-3 mb-3 text-xs space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Accused</p>
                <p className="font-semibold text-text-primary">{participant.name}</p>
                {participant.contact?.address && (
                  <p className="text-text-secondary">of {participant.contact.address}</p>
                )}
                {participant.identifiers && participant.identifiers.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {participant.identifiers.map((id, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-secondary border border-border">
                        {id.type}: {id.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Sections */}
              <div className="mb-3 text-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1.5">Charged Under</p>
                {sections.length > 0 ? (
                  <div className="space-y-1">
                    {sections.map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-brand-primary font-bold shrink-0">§ {s.code}</span>
                        <span className="text-text-primary">{s.title}</span>
                        {s.reason && <span className="text-text-secondary">({s.reason})</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-text-secondary italic text-[11px]">No sections applied yet — attach sections to this participant first.</p>
                )}
              </div>

              {/* Justification in document */}
              <div className="mb-3 text-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Grounds for Arrest</p>
                <p className={`leading-relaxed ${justification.trim() ? 'text-text-primary' : 'text-text-secondary italic text-[11px]'}`}>
                  {justification.trim() || 'Enter justification above…'}
                </p>
              </div>

              {/* Mandate text */}
              <div className="text-xs text-text-primary border-t border-border pt-3 space-y-1">
                <p>
                  You are hereby directed to arrest the said{' '}
                  <strong>{participant.name}</strong> and produce him/her before the Court /
                  Magistrate without delay. <strong>HEREIN FAIL NOT.</strong>
                </p>
              </div>

              {/* Signature row */}
              <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-4 text-[10px] text-text-secondary text-center">
                <div className="border border-dashed border-border rounded-lg px-2 py-3">(Seal of the Court)</div>
                <div className="border border-dashed border-border rounded-lg px-2 py-3">(Signature of Magistrate)</div>
              </div>
            </div>
          </div>

          {/* API error */}
          {apiError && (
            <div className="rounded-xl border border-semantic-critical/30 bg-semantic-critical/5 px-4 py-3 text-sm text-semantic-critical flex items-center gap-2">
              <AlertTriangle size={13} className="flex-shrink-0" />
              {apiError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-surface-elevated rounded-b-2xl flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-text-secondary hover:text-text-primary font-medium transition-colors cursor-pointer">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {isDraft && !noFir && (
              <button
                onClick={handleSave}
                disabled={saving || sending || justification.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-border bg-surface hover:bg-surface-elevated text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? 'Saving…' : savedWarrant ? 'Update Draft' : 'Save Draft'}
              </button>
            )}
            {canSend && !noFir && (
              <button
                onClick={handleSend}
                disabled={sending || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send size={13} />
                {sending ? 'Sending…' : 'Send to Magistrate'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

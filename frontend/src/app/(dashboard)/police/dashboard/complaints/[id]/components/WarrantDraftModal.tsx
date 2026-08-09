'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, AlertTriangle, Send, Save, Shield } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES } from '@/lib/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppliedSection {
  code: string;
  title: string;
  reason?: string;
}

interface Identifier {
  type: string;
  value: string;
}

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
  existingWarrant?: Warrant | null;   // if already drafted — show send button
  onWarrantSaved: (warrant: Warrant) => void;
  onWarrantSent:  (warrant: Warrant) => void;
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
  const [justification, setJustification]         = useState('');
  const [draftContent,  setDraftContent]           = useState('');
  const [justError,     setJustError]              = useState('');
  const [saving,        setSaving]                 = useState(false);
  const [sending,       setSending]                = useState(false);
  const [apiError,      setApiError]               = useState('');
  const [savedWarrant,  setSavedWarrant]           = useState<Warrant | null>(existingWarrant ?? null);

  // Derive the applied sections: accused takes precedence over suspect
  const sections: AppliedSection[] =
    (participant.accusedProfile?.appliedSections?.length
      ? participant.accusedProfile.appliedSections
      : participant.suspectProfile?.appliedSections) ?? [];

  // Pre-fill on open / when existingWarrant changes
  useEffect(() => {
    if (!isOpen) return;
    if (existingWarrant) {
      setSavedWarrant(existingWarrant);
      setJustification(existingWarrant.justification ?? '');
      setDraftContent(existingWarrant.warrant_draft_content ?? '');
    } else {
      setSavedWarrant(null);
      setJustification('');
      setDraftContent('');
    }
    setJustError('');
    setApiError('');
  }, [isOpen, existingWarrant]);

  if (!isOpen) return null;

  const firNumber   = complaintData?.firNumber;
  const station     = complaintData?.policeStation?.name     ?? '—';
  const district    = complaintData?.policeStation?.district ?? '—';
  const noFir       = !firNumber;
  const isDraft     = !savedWarrant || savedWarrant.status === 'draft';
  const canSend     = !!savedWarrant && savedWarrant.status === 'draft';

  // ── Save draft ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!justification.trim() || justification.trim().length < 10) {
      setJustError('Justification must be at least 10 characters.');
      return;
    }
    setJustError('');
    setApiError('');
    setSaving(true);
    try {
      let result: Warrant;
      if (savedWarrant) {
        // PATCH existing draft
        const res = await apiClient.patch(
          API_ROUTES.CASES.WARRANT_DETAIL(caseId, savedWarrant.warrant_id),
          { justification: justification.trim(), warrant_draft_content: draftContent },
        );
        result = res.data.data as Warrant;
      } else {
        // POST new draft
        const res = await apiClient.post(
          API_ROUTES.CASES.WARRANTS(caseId),
          {
            participant_id:       participant.participant_id,
            justification:        justification.trim(),
            warrant_draft_content: draftContent || undefined,
          },
        );
        result = res.data.data as Warrant;
        // Seed the content field from what the server generated
        setDraftContent(result.warrant_draft_content ?? '');
      }
      setSavedWarrant(result);
      onWarrantSaved(result);
    } catch (err: any) {
      setApiError(err?.response?.data?.message ?? err?.message ?? 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  // ── Send to magistrate ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!savedWarrant) return;
    setApiError('');
    setSending(true);
    try {
      const res = await apiClient.post(
        API_ROUTES.CASES.WARRANT_SEND(caseId, savedWarrant.warrant_id),
      );
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-gradient-to-r from-slate-800 to-slate-700 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-white" />
            <div>
              <h2 className="text-sm font-bold text-white">Arrest Warrant — BNSS Form No. 2</h2>
              <p className="text-xs text-slate-300">{participant.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* No-FIR warning */}
        {noFir && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-yellow-600" />
            <span>
              <strong>FIR not registered.</strong> A valid FIR number is required before drafting an
              arrest warrant. Please register the FIR first.
            </span>
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Read-only case snapshot */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Case Details (auto-filled from FIR)
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                ['FIR No.',       firNumber  ?? '— (not registered)'],
                ['Police Station', station],
                ['District',       district],
                ['Accused',        participant.name],
                ['Address',        participant.contact?.address ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="font-semibold text-neutral-500">{label}: </span>
                  <span className={`text-neutral-800 ${label === 'FIR No.' && noFir ? 'text-red-600 font-bold' : ''}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Identifiers */}
            {participant.identifiers && participant.identifiers.length > 0 && (
              <div className="pt-2 border-t border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                  Identifiers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {participant.identifiers.map((id, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 font-medium">
                      {id.type}: {id.value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Applied sections */}
            {sections.length > 0 && (
              <div className="pt-2 border-t border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                  Applied Legal Sections
                </p>
                <div className="space-y-1">
                  {sections.map((s, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-indigo-700">§ {s.code}</span>
                      <span className="text-neutral-600"> — {s.title}</span>
                      {s.reason && <span className="text-neutral-400"> ({s.reason})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Justification — required */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Justification for Arrest <span className="text-red-500">*</span>
            </label>
            <p className="text-[10px] text-neutral-400 mb-2">
              Explain why this person needs to be arrested. This will appear in the warrant sent to the magistrate.
            </p>
            <textarea
              value={justification}
              onChange={(e) => { setJustification(e.target.value); if (justError) setJustError(''); }}
              rows={3}
              disabled={!isDraft || noFir}
              placeholder="e.g. The accused has been identified as the primary perpetrator based on call records and witness statements. There is a risk of evidence tampering and flight…"
              className={`w-full rounded-lg border text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-neutral-100 disabled:text-neutral-400 ${
                justError ? 'border-red-400' : 'border-neutral-300'
              }`}
            />
            {justError && (
              <p className="text-xs text-red-600 mt-1">{justError}</p>
            )}
          </div>

          {/* Warrant draft content — editable */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Warrant Draft Content
            </label>
            <p className="text-[10px] text-neutral-400 mb-2">
              BNSS Form No. 2 text — auto-generated from case data. You may edit before sending.
              This exact text will appear in the PDF sent to the magistrate.
            </p>
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={12}
              disabled={!isDraft || noFir}
              placeholder="Click Save Draft to generate the BNSS Form No. 2 template…"
              className="w-full rounded-lg border border-neutral-300 text-xs font-mono px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-neutral-100 disabled:text-neutral-400"
            />
          </div>

          {/* Status badge for non-draft warrants */}
          {savedWarrant && savedWarrant.status !== 'draft' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-blue-600" />
                <span className="font-semibold text-blue-800 capitalize">
                  Status: {savedWarrant.status.replace(/_/g, ' ')}
                </span>
              </div>
              {savedWarrant.sent_at && (
                <p className="text-xs text-blue-600 mt-1">
                  Sent to magistrate: {new Date(savedWarrant.sent_at).toLocaleString('en-IN')}
                </p>
              )}
              {savedWarrant.magistrate_rejection_reason && (
                <p className="text-xs text-red-600 mt-1">
                  Rejection reason: {savedWarrant.magistrate_rejection_reason}
                </p>
              )}
              {savedWarrant.signed_warrant_pdf_url && (
                <a
                  href={savedWarrant.signed_warrant_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-700 underline mt-1 inline-block"
                >
                  View signed warrant PDF ↗
                </a>
              )}
            </div>
          )}

          {/* API error */}
          {apiError && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                {apiError}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between gap-3 bg-neutral-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-700 font-medium transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {/* Save Draft */}
            {isDraft && !noFir && (
              <button
                onClick={handleSave}
                disabled={saving || sending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving…' : savedWarrant ? 'Save Changes' : 'Save Draft'}
              </button>
            )}

            {/* Send to Magistrate */}
            {canSend && !noFir && (
              <button
                onClick={handleSend}
                disabled={sending || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                <Send size={14} />
                {sending ? 'Sending…' : 'Send to Magistrate'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

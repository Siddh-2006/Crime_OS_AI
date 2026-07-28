'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Bot, UserCircle, Send, AlertTriangle, ShieldAlert, RefreshCw, Scale, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import apiClient from '@/lib/axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Suspect {
  entity: string;
  confidence: number;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
}

interface NextStep {
  step_id: string;
  reason: string;
  confidence: number;
  evidence_needed: string[];
}

interface SuggestedLegalSection {
  code: string;
  title: string;
  reason?: string;
}

interface ParticipantRecommendation {
  name: string;
  roles: string[];
  confidence: number;
  reason: string;
  recommended_sections?: SuggestedLegalSection[];
}

interface Snapshot {
  snapshot_id: string;
  timestamp: string;
  narrative_summary: string;
  suspect_candidates: Suspect[];
  participant_recommendations?: ParticipantRecommendation[];
  ranked_next_steps: NextStep[];
  confidence_breakdown?: {
    evidence_coverage: number;
    checklist_progress: number;
    corroboration: number;
    contradiction_penalty: number;
    final_score: number;
  };
  /** Array of strings (each may contain "Section X IPC: explanation") */
  suggested_legal_sections?: string[];
  trigger: string;
  officer_authored: boolean;
}

interface ProgressStage {
  stage: string;
  label: string;
  pct: number;
  done?: boolean;
  error?: string;
}

interface AnalysisPanelProps {
  caseId: string;
  snapshot: Snapshot | null;
  loading: boolean;
  participants: any[];
  onCorrectSnapshot: (message: string) => Promise<void>;
  onTriggerAnalysis: () => Promise<void>;
  /** Called when SSE delivers 'done' so the workspace can refresh the snapshot */
  onAnalysisComplete: () => void;
  onAttachSectionsToParticipant: (participantId: string, sections: SuggestedLegalSection[]) => Promise<void>;
  onAcceptRecommendedSection: (recommendation: ParticipantRecommendation, section: SuggestedLegalSection) => Promise<void>;
  onApproveParticipant?: (recommendation: ParticipantRecommendation) => Promise<void>;
  actionLoading: boolean;
}

const safeText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(safeText).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const safeArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(safeText).filter((item) => item.length > 0);
  if (value === undefined || value === null) return [];
  return [safeText(value)];
};

const safeMarkdown = (value: unknown): string => {
  const text = safeText(value);
  return text.trim().length > 0 ? text : '*No summary generated yet.*';
};

// ─── SSE helper ───────────────────────────────────────────────────────────────

function openSSE(
  caseId: string,
  onStage: (s: ProgressStage) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): () => void {
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
  const url = `${base}/cases/${caseId}/analysis/progress?token=${encodeURIComponent(token ?? '')}`;
  const es = new EventSource(url);

  es.onmessage = (ev) => {
    try {
      const data: ProgressStage = JSON.parse(ev.data);
      onStage(data);
      if (data.done) { es.close(); onDone(); }
      if (data.error) { es.close(); onError(data.error); }
    } catch { /* ignore malformed frames */ }
  };

  es.onerror = () => onError('SSE connection lost. Retrying…');

  return () => es.close();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalysisPanel({
  caseId,
  snapshot,
  loading,
  participants,
  onCorrectSnapshot,
  onTriggerAnalysis,
  onAttachSectionsToParticipant,
  onAcceptRecommendedSection,
  onApproveParticipant,
  onAnalysisComplete,
  actionLoading,
}: AnalysisPanelProps) {
  const [correctionMsg, setCorrectionMsg] = useState('');
  const [progress, setProgress] = useState<ProgressStage | null>(null);
  const [sseError, setSseError] = useState<string | null>(null);
  const [dismissedRecommendationKeys, setDismissedRecommendationKeys] = useState<string[]>([]);
  const [loadingItemKey, setLoadingItemKey] = useState<string | null>(null);
  const sseCleanupRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onAnalysisComplete);
  const sseErrorCountRef = useRef(0);

  useEffect(() => { onCompleteRef.current = onAnalysisComplete; }, [onAnalysisComplete]);

  const startSSE = useCallback(() => {
    sseCleanupRef.current?.();
    setSseError(null);
    sseErrorCountRef.current = 0;
    sseCleanupRef.current = openSSE(
      caseId,
      (stage) => setProgress(stage),
      () => { setProgress(null); onCompleteRef.current(); },
      (msg) => {
        sseErrorCountRef.current += 1;
        if (sseErrorCountRef.current >= 3) setSseError(msg);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // State-recovery on mount
  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/cases/${caseId}/analysis/status`).then((res) => {
      if (cancelled) return;
      const status: ProgressStage = res.data.data;
      if (status.done || status.stage === 'idle') { setProgress(null); return; }
      setProgress(status);
      startSSE();
    }).catch(() => { /* not critical */ });
    return () => { cancelled = true; sseCleanupRef.current?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const handleTriggerAnalysis = async () => {
    setProgress({ stage: 'queued', label: 'Analysis request received — job is in queue', pct: 5 });
    setSseError(null);
    sseErrorCountRef.current = 0;
    startSSE();
    try { await onTriggerAnalysis(); }
    catch { setProgress(null); sseCleanupRef.current?.(); }
  };

  const handleCorrect = async () => {
    if (!correctionMsg.trim()) return;
    await onCorrectSnapshot(correctionMsg);
    setCorrectionMsg('');
  };

  const isAnalysing = !!progress && !progress.done && !progress.error;
  const hasFailed = !!progress?.error;

  // ── Loading ──────────────────────────────────────────────────────────────
  const allRecommendations = snapshot?.participant_recommendations || [];

  const isRecommendationDismissed = (recommendationName: string, sectionCode: string) =>
    dismissedRecommendationKeys.includes(`${recommendationName}:${sectionCode}`);

  const handleApproveParticipantWrap = async (recommendation: ParticipantRecommendation) => {
    if (!onApproveParticipant) return;
    const key = `participant:${recommendation.name}`;
    setLoadingItemKey(key);
    await onApproveParticipant(recommendation);
    setLoadingItemKey(null);
  };

  const handleAcceptSectionWrap = async (recommendation: ParticipantRecommendation, section: SuggestedLegalSection) => {
    const key = `section:${recommendation.name}:${section.code}`;
    setLoadingItemKey(key);
    await onAcceptRecommendedSection(recommendation, section);
    setLoadingItemKey(null);
  };

  useEffect(() => {
    if (!snapshot) return;
    console.debug('AnalysisPanel snapshot', snapshot);
  }, [snapshot]);

  if (loading) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <Loader />
      </Card>
    );
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (!snapshot && !isAnalysing && !hasFailed) {
    return (
      <Card className="min-h-[400px] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Bot className="h-12 w-12 text-neutral-300" />
        <div>
          <h3 className="text-lg font-bold text-neutral-700">No Analysis Snapshot</h3>
          <p className="text-sm text-neutral-500 max-w-sm mt-2">
            The AI has not analysed this case yet. Trigger an analysis to get ranked next steps,
            suspect candidates, and a narrative summary.
          </p>
        </div>
        <Button onClick={handleTriggerAnalysis} isLoading={actionLoading} leftIcon={<Bot size={16} />}>
          Run AI Analysis
        </Button>
      </Card>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────
  if (hasFailed) {
    return (
      <Card className="min-h-[300px] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <div>
          <h3 className="text-base font-bold text-red-700">Analysis Failed</h3>
          <p className="text-sm text-neutral-500 max-w-sm mt-2">
            {progress?.error ?? 'The AI analysis encountered an error. This is usually a model timeout.'}
          </p>
          <p className="text-xs text-neutral-400 mt-2">
            Try again — it often succeeds on retry.
          </p>
        </div>
        <Button
          onClick={() => { setProgress(null); handleTriggerAnalysis(); }}
          isLoading={actionLoading}
          leftIcon={<RefreshCw size={15} />}
        >
          Retry Analysis
        </Button>
      </Card>
    );
  }

  // ── In-progress ──────────────────────────────────────────────────────────
  if (isAnalysing) {
    return (
      <Card className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center space-y-6">
        <Bot className="h-14 w-14 text-primary-400 animate-pulse" />
        <div className="space-y-1">
          <h3 className="text-base font-bold text-neutral-800">Analysis in Progress</h3>
          <p className="text-sm text-neutral-500 max-w-xs">
            The AI is working through this case. Typically takes 1–4 minutes.
            You can switch to other tabs — this view will update automatically when done.
          </p>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <div className="flex justify-between text-xs font-semibold text-neutral-500">
            <span className="truncate mr-2">{progress.label}</span>
            <span className="flex-shrink-0">{progress.pct}%</span>
          </div>
          <div className="w-full bg-neutral-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-2.5 rounded-full bg-primary-600 transition-all duration-700 ease-out"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
        {sseError && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
            ⚠️ {sseError}
          </p>
        )}
      </Card>
    );
  }

  // ── Snapshot loaded ──────────────────────────────────────────────────────
  if (!snapshot) return null;

  return (
    <div className="flex flex-col space-y-4">

      {/* Header: confidence + re-run */}
      <Card>
        <div className="flex justify-between items-start border-b border-neutral-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Bot className="text-primary-600 h-5 w-5" />
            <div>
              <h3 className="font-bold text-neutral-900">AI Investigation Analysis</h3>
              <p className="text-[10px] text-neutral-500 font-medium">
                {new Date(snapshot.timestamp).toLocaleString('en-IN')}
                {snapshot.officer_authored && (
                  <span className="ml-2 text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                    OFFICER AUTHORED
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {snapshot.confidence_breakdown && (
              <div className="text-right">
                <div className="text-2xl font-black text-primary-700">
                  {(snapshot.confidence_breakdown.final_score * 100).toFixed(0)}
                  <span className="text-sm text-neutral-400">%</span>
                </div>
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Confidence</p>
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={handleTriggerAnalysis} isLoading={actionLoading} leftIcon={<RefreshCw size={12} />}>
              Re-run
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Narrative */}
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Narrative Summary</p>
            <div className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-lg border border-neutral-200 prose prose-sm max-w-none">
              <ReactMarkdown>{safeMarkdown(snapshot.narrative_summary)}</ReactMarkdown>
            </div>
          </div>

          {/* Legal Sections — suggested_legal_sections is string[] */}
          {snapshot.suggested_legal_sections && snapshot.suggested_legal_sections.length > 0 && (
            <div className="border border-indigo-100 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-indigo-50 px-4 py-2 flex items-center gap-2 border-b border-indigo-100">
                <Scale className="text-indigo-600 h-4 w-4" />
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  Applicable Legal Sections
                </h4>
              </div>
              <ul className="p-4 bg-white space-y-2">
                {snapshot.suggested_legal_sections.map((section: any, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-neutral-700 bg-indigo-50/30 p-2 rounded border border-indigo-50">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>{typeof section === 'string' ? section : safeText(section.title ?? section.code ?? section.reason ?? section)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {allRecommendations.length > 0 && (
            <div className="mt-4 border border-emerald-100 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-emerald-50 px-4 py-2 flex items-center gap-2 border-b border-emerald-100">
                <Scale className="text-emerald-600 h-4 w-4" />
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Legal Advisor</h4>
              </div>
              <div className="p-4 bg-white space-y-4">
                {allRecommendations.map((recommendation) => {
                  const participantKey = `participant:${safeText(recommendation.name)}`;
                  // Check if participant is already approved (in participants list with same name)
                  const isApproved = participants.some(
                    (p) => safeText(p.name).trim().toLowerCase() === safeText(recommendation.name).trim().toLowerCase()
                  );

                  return (
                    <div key={`${safeText(recommendation.name)}-${safeArray(recommendation.roles).join(',')}`} className="rounded-lg border border-neutral-200 p-3 bg-neutral-50/40">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{safeText(recommendation.name)}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {safeArray(recommendation.roles).join(', ')} • {(Number(recommendation.confidence) * 100).toFixed(0)}% confidence
                          </p>
                          <p className="text-xs text-neutral-600 mt-1">{safeText(recommendation.reason)}</p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                            AI Suggestion
                          </span>
                          {!isApproved && onApproveParticipant && (
                            <Button
                              size="sm"
                              onClick={() => handleApproveParticipantWrap(recommendation)}
                              isLoading={loadingItemKey === participantKey}
                              disabled={actionLoading && loadingItemKey !== participantKey}
                              className="!px-2.5 !py-1 text-[11px]"
                            >
                              Add Participant
                            </Button>
                          )}
                          {isApproved && (
                            <span className="text-[10px] font-bold text-green-700">Added ✓</span>
                          )}
                        </div>
                      </div>

                      {recommendation.recommended_sections && recommendation.recommended_sections.length > 0 && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-neutral-200">
                          <p className="text-xs font-semibold text-neutral-600 mb-2">Suggested Sections</p>
                          {recommendation.recommended_sections.map((section) => {
                            const dismissalKey = `${safeText(recommendation.name)}:${safeText(section.code)}`;
                            const sectionKey = `section:${safeText(recommendation.name)}:${safeText(section.code)}`;
                            if (isRecommendationDismissed(safeText(recommendation.name), safeText(section.code))) return null;

                            // Check if this section is already applied to this participant
                            const participantObj = participants.find((p) => safeText(p.name).trim().toLowerCase() === safeText(recommendation.name).trim().toLowerCase());
                            const appliedSections = participantObj
                              ? (safeArray((participantObj as any).roles).includes('Accused')
                                ? ((participantObj as any).accusedProfile?.appliedSections || [])
                                : ((participantObj as any).suspectProfile?.appliedSections || []))
                              : [];
                            const isSectionAccepted = appliedSections.some((s: any) => safeText(s.code) === safeText(section.code));

                            return (
                              <div key={dismissalKey} className="flex items-start justify-between gap-3 rounded-md border border-emerald-100 bg-white p-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-neutral-800">
                                    <strong>{safeText(section.code)}</strong>: {safeText(section.title)}
                                  </p>
                                  {safeText(section.reason) && <p className="text-xs text-neutral-500 mt-1">{safeText(section.reason)}</p>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isSectionAccepted ? (
                                    <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
                                      Attached ✓
                                    </span>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAcceptSectionWrap(recommendation, section)}
                                        isLoading={loadingItemKey === sectionKey}
                                        disabled={actionLoading && loadingItemKey !== sectionKey}
                                        className="!px-2.5 !py-1 text-[11px]"
                                      >
                                        Accept
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setDismissedRecommendationKeys((current) => [...current, dismissalKey])}
                                        disabled={actionLoading}
                                        leftIcon={<XCircle size={12} />}
                                        className="!px-2.5 !py-1 text-[11px]"
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confidence Breakdown */}
          {snapshot.confidence_breakdown && (
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
              <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-2">Score Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><p className="text-neutral-500">Evidence</p><p className="font-semibold text-neutral-800">{(snapshot.confidence_breakdown.evidence_coverage * 100).toFixed(0)}%</p></div>
                <div><p className="text-neutral-500">Checklist</p><p className="font-semibold text-neutral-800">{(snapshot.confidence_breakdown.checklist_progress * 100).toFixed(0)}%</p></div>
                <div><p className="text-neutral-500">Corroboration</p><p className="font-semibold text-green-600">+{(snapshot.confidence_breakdown.corroboration * 100).toFixed(0)}</p></div>
                <div><p className="text-neutral-500">Contradiction</p><p className="font-semibold text-red-600">-{(snapshot.confidence_breakdown.contradiction_penalty * 100).toFixed(0)}</p></div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Suspects + Next Steps — 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Suspect Candidates */}
        <Card className="flex flex-col">
          <CardHeader title="Suspect Candidates" />
          <div className="mt-3 space-y-3 overflow-y-auto max-h-[300px] pr-2">
            {snapshot.suspect_candidates.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No suspects identified yet.</p>
            ) : (
              snapshot.suspect_candidates.map((s, idx) => (
                <div key={idx} className="p-3 border border-neutral-200 rounded-lg bg-white shadow-sm flex items-start gap-3">
                  <UserCircle className="text-neutral-400 h-8 w-8 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-bold text-neutral-900 truncate">{s.entity}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${s.confidence > 0.7 ? 'bg-red-100 text-red-700' : s.confidence > 0.4 ? 'bg-yellow-100 text-yellow-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {(s.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {s.contradicting_evidence_ids.length > 0 && (
                      <p className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-1">
                        <AlertTriangle size={12} /> Contradictory evidence found
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Ranked Next Steps */}
        <Card className="flex flex-col">
          <CardHeader title="Ranked Next Steps" />
          <div className="mt-3 space-y-3 overflow-y-auto max-h-[300px] pr-2">
            {snapshot.ranked_next_steps.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No further steps suggested.</p>
            ) : (
              snapshot.ranked_next_steps.map((step, idx) => (
                <div key={idx} className="p-3 border border-primary-100 rounded-lg bg-primary-50/30 flex gap-3 items-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-800">{safeText(step.step_id).replace(/_/g, ' ')}</p>
                    <p className="text-xs text-neutral-600 mt-1">{safeText(step.reason)}</p>
                    {step.evidence_needed.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {step.evidence_needed.map((ev: any) => (
                          <span key={safeText(ev)} className="text-[9px] uppercase tracking-wider bg-white border border-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded">
                            Requires: {safeText(ev)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Officer Correction Box */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="text-orange-500 h-4 w-4" />
          <h4 className="text-xs font-bold text-neutral-700 uppercase">Officer Override &amp; Correction</h4>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={correctionMsg}
            onChange={(e) => setCorrectionMsg(e.target.value)}
            placeholder="Tell the AI to correct an assumption, ignore a suspect, or prioritise a step…"
            className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCorrect()}
            disabled={actionLoading}
          />
          <Button onClick={handleCorrect} isLoading={actionLoading} disabled={!correctionMsg.trim()}>
            <Send size={16} />
          </Button>
        </div>
      </Card>
    </div>
  );
}


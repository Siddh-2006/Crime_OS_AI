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
  suggested_reasoning?: string;
}

interface EvidenceSectionRecommendation {
  evidence_id: string;
  evidence_title?: string;
  applicable_sections?: SuggestedLegalSection[];
}

interface Snapshot {
  snapshot_id: string;
  timestamp: string;
  narrative_summary: string;
  suspect_candidates: Suspect[];
  participant_recommendations?: ParticipantRecommendation[];
  evidence_section_recommendations?: EvidenceSectionRecommendation[];
  ranked_next_steps: NextStep[];
  confidence_breakdown?: {
    evidence_coverage: number;
    checklist_progress: number;
    corroboration: number;
    contradiction_penalty: number;
    final_score: number;
    accused_identification_confidence?: {
      identity_corroboration_count: number;
      legal_element_coverage: number;
      response_verification_completeness: number;
      contradiction_alibi_check: boolean;
      critical_checklist_progress: number;
      is_fully_confirmed: boolean;
      score: number;
    };
  };
  /** Case-level legal sections returned by the AI as objects or strings */
  suggested_legal_sections?: Array<{ code: string; title: string; reason?: string } | string>;
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
  evidence: any[];
  onCorrectSnapshot: (message: string) => Promise<void>;
  onTriggerAnalysis: () => Promise<void>;
  /** Called when SSE delivers 'done' so the workspace can refresh the snapshot */
  onAnalysisComplete: () => void;
  onAttachSectionsToParticipant: (participantId: string, sections: SuggestedLegalSection[]) => Promise<void>;
  onAttachEvidenceSections: (evidenceId: string, sections: SuggestedLegalSection[]) => Promise<void>;
  onAcceptRecommendedSection: (recommendation: ParticipantRecommendation, section: SuggestedLegalSection) => Promise<void>;
  onApproveParticipant?: (recommendation: ParticipantRecommendation) => Promise<void>;
  onAttachReasoning?: (recommendation: ParticipantRecommendation, reasoningContent: string) => Promise<void>;
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

const formatLegalSectionLabel = (section: unknown): string => {
  if (typeof section === 'string') return section;
  if (section && typeof section === 'object') {
    const candidate = section as Record<string, unknown>;
    const code = safeText(candidate.code);
    const title = safeText(candidate.title);
    if (code && title && code !== title) return `${code}: ${title}`;
    return code || title || safeText(section);
  }
  return safeText(section);
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
  evidence,
  onCorrectSnapshot,
  onTriggerAnalysis,
  onAttachSectionsToParticipant,
  onAttachEvidenceSections,
  onAcceptRecommendedSection,
  onApproveParticipant,
  onAttachReasoning,
  onAnalysisComplete,
  actionLoading,
}: AnalysisPanelProps) {
  const [correctionMsg, setCorrectionMsg] = useState('');
  const [progress, setProgress] = useState<ProgressStage | null>(null);
  const [sseError, setSseError] = useState<string | null>(null);
  const [dismissedRecommendationKeys, setDismissedRecommendationKeys] = useState<string[]>([]);
  const [dismissedEvidenceRecommendationKeys, setDismissedEvidenceRecommendationKeys] = useState<string[]>([]);
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

  const isEvidenceRecommendationDismissed = (evidenceId: string, sectionCode: string) =>
    dismissedEvidenceRecommendationKeys.includes(`${evidenceId}:${sectionCode}`);

  const handleApproveParticipantWrap = async (recommendation: ParticipantRecommendation) => {
    if (!onApproveParticipant) return;
    const key = `participant:${recommendation.name}`;
    setLoadingItemKey(key);
    await onApproveParticipant(recommendation);
    setLoadingItemKey(null);
  };

  const handleAttachReasoningWrap = async (recommendation: ParticipantRecommendation) => {
    if (!onAttachReasoning || !recommendation.suggested_reasoning) return;
    const key = `reasoning:${recommendation.name}`;
    setLoadingItemKey(key);
    await onAttachReasoning(recommendation, recommendation.suggested_reasoning);
    setLoadingItemKey(null);
  };

  const handleAcceptSectionWrap = async (recommendation: ParticipantRecommendation, section: SuggestedLegalSection) => {
    const key = `section:${recommendation.name}:${section.code}`;
    setLoadingItemKey(key);
    await onAcceptRecommendedSection(recommendation, section);
    setLoadingItemKey(null);
  };

  const handleAttachEvidenceSectionWrap = async (recommendation: EvidenceSectionRecommendation, section: SuggestedLegalSection) => {
    const key = `evidence-section:${recommendation.evidence_id}:${section.code}`;
    setLoadingItemKey(key);
    await onAttachEvidenceSections(recommendation.evidence_id, [section]);
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
        <div className="flex justify-between items-start border-b border-neutral-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Bot className="text-brand-primary h-5 w-5" />
            <div>
              <h3 className="font-bold text-text-primary">AI Investigation Analysis</h3>
              <p className="text-[10px] text-text-secondary font-medium">
                {new Date(snapshot.timestamp).toLocaleString('en-IN')}
                {snapshot.officer_authored && (
                  <span className="ml-2 text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                    OFFICER AUTHORED
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {snapshot.confidence_breakdown && (
              <div className="flex gap-6 border-r border-neutral-800 pr-6">
                <div className="text-right">
                  <div className="text-2xl font-black text-brand-primary" title="Health Score measures the overall completeness, consistency, and evidence coverage of the case.">
                    {(snapshot.confidence_breakdown.final_score * 100).toFixed(0)}
                    <span className="text-sm text-neutral-400">%</span>
                  </div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Health Score</p>
                </div>
                {snapshot.confidence_breakdown.accused_identification_confidence && (
                  <div className="text-right">
                    {snapshot.confidence_breakdown.accused_identification_confidence.is_fully_confirmed ? (
                      <div className="text-xl font-black text-green-500 flex items-center justify-end gap-1" title="The suspect's identity is fully corroborated.">
                        <ShieldAlert className="w-5 h-5" /> Confirmed
                      </div>
                    ) : (
                      <div className="text-2xl font-black text-amber-500" title="ID Confidence measures the certainty of the suspect's identity based on corroborating evidence and lack of contradictions.">
                        {(snapshot.confidence_breakdown.accused_identification_confidence.score * 100).toFixed(0)}
                        <span className="text-sm text-neutral-400">%</span>
                      </div>
                    )}
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">ID Confidence</p>
                  </div>
                )}
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
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Narrative Summary</p>
            <div className="text-sm text-text-primary leading-relaxed bg-surface-elevated p-4 rounded-xl border border-border prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{safeMarkdown(snapshot.narrative_summary)}</ReactMarkdown>
            </div>
          </div>

          {/* Legal Sections — case-level AI suggestions */}
          {snapshot.suggested_legal_sections && snapshot.suggested_legal_sections.length > 0 && (
            <div className="border border-brand-primary/20 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-brand-primary/10 px-4 py-2.5 flex items-center gap-2 border-b border-brand-primary/20">
                <Scale className="text-brand-primary h-4 w-4" />
                <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                  Applicable Legal Sections
                </h4>
              </div>
              <ul className="p-4 bg-surface-elevated space-y-2">
                {snapshot.suggested_legal_sections.map((section: any, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-text-secondary bg-surface p-2.5 rounded-lg border border-border">
                    <span className="text-brand-primary mt-0.5">•</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary">{formatLegalSectionLabel(section)}</p>
                      {section && typeof section === 'object' && section.reason ? (
                        <p className="text-xs text-neutral-400 mt-1">{safeText(section.reason)}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {snapshot.evidence_section_recommendations && snapshot.evidence_section_recommendations.length > 0 && (
            <div className="mt-4 border border-brand-primary/30 rounded-2xl overflow-hidden shadow-sm bg-surface">
              <div className="bg-brand-primary/10 px-5 py-3 flex items-center gap-2.5 border-b border-brand-primary/20">
                <Scale className="text-brand-primary h-4 w-4" />
                <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">Evidence Section Advisor</h4>
              </div>
              <div className="p-4 space-y-4 bg-surface-elevated/40">
                {snapshot.evidence_section_recommendations.map((recommendation) => {
                  const evidenceMatch = evidence.find((item: any) => safeText(item.evidence_id) === safeText(recommendation.evidence_id) || safeText(item._id) === safeText(recommendation.evidence_id));
                  const attachedSections = Array.isArray((evidenceMatch as any)?.applicableSections) ? (evidenceMatch as any).applicableSections : [];

                  return (
                    <div key={`${safeText(recommendation.evidence_id)}-${safeText(recommendation.evidence_title)}`} className="rounded-xl border border-border p-4 bg-surface shadow-xs space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-text-primary">{safeText(recommendation.evidence_title || recommendation.evidence_id)}</p>
                          <p className="text-xs text-text-secondary font-mono mt-0.5">{safeText(recommendation.evidence_id)}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-full px-2.5 py-0.5">
                          AI Suggestion
                        </span>
                      </div>

                      {recommendation.applicable_sections && recommendation.applicable_sections.length > 0 && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Suggested BSA Sections</p>
                          {recommendation.applicable_sections.map((section) => {
                            const dismissalKey = `${safeText(recommendation.evidence_id)}:${safeText(section.code)}`;
                            const sectionKey = `evidence-section:${safeText(recommendation.evidence_id)}:${safeText(section.code)}`;
                            if (isEvidenceRecommendationDismissed(safeText(recommendation.evidence_id), safeText(section.code))) return null;

                            const isAttached = attachedSections.some((item: any) => safeText(item.code) === safeText(section.code));

                            return (
                              <div key={dismissalKey} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-elevated/60 p-3.5 shadow-xs">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-text-primary">
                                    <strong className="text-brand-primary">{safeText(section.code)}</strong>: {safeText(section.title)}
                                  </p>
                                  {safeText(section.reason) && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{safeText(section.reason)}</p>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isAttached ? (
                                    <span className="text-[10px] font-bold text-semantic-success bg-semantic-success/10 px-2.5 py-1 rounded-lg border border-semantic-success/30">
                                      Attached &check;
                                    </span>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAttachEvidenceSectionWrap(recommendation, section)}
                                        isLoading={loadingItemKey === sectionKey}
                                        disabled={actionLoading && loadingItemKey !== sectionKey}
                                        className="!px-3 !py-1 text-xs font-bold"
                                      >
                                        Attach
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setDismissedEvidenceRecommendationKeys((current) => [...current, dismissalKey])}
                                        disabled={actionLoading}
                                        leftIcon={<XCircle size={13} />}
                                        className="!px-2.5 !py-1 text-xs font-bold text-text-secondary hover:text-semantic-critical"
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

          {allRecommendations.length > 0 && (
            <div className="mt-4 border border-brand-primary/30 rounded-2xl overflow-hidden shadow-sm bg-surface">
              <div className="bg-brand-primary/10 px-5 py-3 flex items-center gap-2.5 border-b border-brand-primary/20">
                <Scale className="text-brand-primary h-4 w-4" />
                <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">Case Participant Advisor</h4>
              </div>
              <div className="p-4 space-y-4 bg-surface-elevated/40">
                {allRecommendations.map((recommendation) => {
                  const participantKey = `participant:${safeText(recommendation.name)}`;
                  // Check if participant is already approved (in participants list with same name)
                  const isApproved = participants.some(
                    (p) => safeText(p.name).trim().toLowerCase() === safeText(recommendation.name).trim().toLowerCase()
                  );

                  return (
                    <div key={`${safeText(recommendation.name)}-${safeArray(recommendation.roles).join(',')}`} className="rounded-xl border border-border p-4 bg-surface shadow-xs">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold text-text-primary">{safeText(recommendation.name)}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {safeArray(recommendation.roles).join(', ')} • {(Number(recommendation.confidence) * 100).toFixed(0)}% confidence
                          </p>
                          <p className="text-xs text-neutral-400 mt-1">{safeText(recommendation.reason)}</p>
                          {recommendation.suggested_reasoning && (
                            <div className="mt-2 bg-indigo-900/30 border border-indigo-800/50 rounded p-2">
                              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide mb-0.5">🧠 AI Observation</p>
                              <p className="text-xs text-indigo-300">{safeText(recommendation.suggested_reasoning)}</p>
                            </div>
                          )}
                        </div>
                      <div className="flex flex-col gap-2 items-end">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-900/30 border border-emerald-700 rounded-full px-2 py-0.5">
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
                          {/* Attach Reasoning button — shown when AI suggests a major observation */}
                          {recommendation.suggested_reasoning && onAttachReasoning && (() => {
                            const reasoningKey = `reasoning:${safeText(recommendation.name)}`;
                            const participantObj = participants.find(
                              (p) => safeText(p.name).trim().toLowerCase() === safeText(recommendation.name).trim().toLowerCase()
                            );
                            const existingReasoning: any[] = participantObj?.reasoning || [];
                            const alreadyAttached = existingReasoning.some(
                              (r) => r.content.trim() === recommendation.suggested_reasoning!.trim()
                            );
                            return alreadyAttached ? (
                              <span className="text-[10px] font-bold text-blue-600">Reasoning Attached ✓</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAttachReasoningWrap(recommendation)}
                                isLoading={loadingItemKey === reasoningKey}
                                disabled={actionLoading && loadingItemKey !== reasoningKey}
                                className="!px-2.5 !py-1 text-[11px] border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                              >
                                🧠 Attach Reasoning
                              </Button>
                            );
                          })()}
                        </div>
                      </div>

                      {recommendation.recommended_sections && recommendation.recommended_sections.length > 0 && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-neutral-800">
                          <p className="text-xs font-semibold text-neutral-400 mb-2">Suggested Sections</p>
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
                              <div key={dismissalKey} className="flex items-start justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/50 p-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-text-primary">
                                    <strong>{safeText(section.code)}</strong>: {safeText(section.title)}
                                  </p>
                                  {safeText(section.reason) && <p className="text-xs text-neutral-500 mt-1">{safeText(section.reason)}</p>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isSectionAccepted ? (
                                    <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-1 rounded border border-green-700">
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
            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/20 shadow-xs">
              <p className="text-[10px] font-bold text-brand-primary uppercase tracking-wider mb-3">Investigation Score Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                {/* Evidence Coverage */}
                <div className="space-y-1.5">
                  <p className="text-text-secondary font-bold">Evidence Coverage</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-surface-elevated rounded-full h-2 overflow-hidden border border-border">
                      <div className="h-2 rounded-full bg-brand-primary" style={{ width: `${(snapshot.confidence_breakdown.evidence_coverage * 100).toFixed(0)}%` }} />
                    </div>
                    <p className="font-mono font-bold text-text-primary w-9 text-right">{(snapshot.confidence_breakdown.evidence_coverage * 100).toFixed(0)}%</p>
                  </div>
                  <p className="text-[10px] text-text-secondary leading-tight">Facts documented by collected evidence</p>
                </div>
                {/* Investigation Completeness */}
                <div className="space-y-1.5">
                  <p className="text-text-secondary font-bold">Investigation Completeness</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-surface-elevated rounded-full h-2 overflow-hidden border border-border">
                      <div className="h-2 rounded-full bg-brand-primary" style={{ width: `${(snapshot.confidence_breakdown.checklist_progress * 100).toFixed(0)}%` }} />
                    </div>
                    <p className="font-mono font-bold text-text-primary w-9 text-right">{(snapshot.confidence_breakdown.checklist_progress * 100).toFixed(0)}%</p>
                  </div>
                  <p className="text-[10px] text-text-secondary leading-tight">Required investigation steps completed</p>
                </div>
                {/* Corroboration */}
                <div className="space-y-1.5">
                  <p className="text-text-secondary font-bold">Corroborating Sources</p>
                  <p className="font-mono font-extrabold text-semantic-success text-base">+{snapshot.confidence_breakdown.corroboration}</p>
                  <p className="text-[10px] text-text-secondary leading-tight">Independent witnesses / sources confirming key facts</p>
                </div>
                {/* Contradictions */}
                <div className="space-y-1.5">
                  <p className="text-text-secondary font-bold">Contradictions Found</p>
                  <p className={`font-mono font-extrabold text-base ${snapshot.confidence_breakdown.contradiction_penalty > 0 ? 'text-semantic-critical' : 'text-text-secondary'}`}>
                    {snapshot.confidence_breakdown.contradiction_penalty > 0 ? `⚠️ ${snapshot.confidence_breakdown.contradiction_penalty}` : '✓ None'}
                  </p>
                  <p className="text-[10px] text-text-secondary leading-tight">Conflicting statements or evidence weakening the case</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Suspect Candidates — full width */}
      <Card>
        <CardHeader title="Suspect Candidates" />
        <div className="mt-3 space-y-3 overflow-y-auto max-h-[300px] pr-2">
          {snapshot.suspect_candidates.length === 0 ? (
            <p className="text-sm text-text-secondary italic">No suspects identified yet.</p>
          ) : (
            snapshot.suspect_candidates.map((s, idx) => (
              <div key={idx} className="p-4 border border-border rounded-xl bg-surface-elevated/70 flex items-start gap-3.5 shadow-xs">
                <UserCircle className="text-brand-primary h-8 w-8 flex-shrink-0 opacity-80" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-bold text-text-primary truncate">{s.entity}</p>
                    <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg border ${s.confidence > 0.7 ? 'bg-semantic-critical/10 text-semantic-critical border-semantic-critical/30' : s.confidence > 0.4 ? 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30' : 'bg-surface text-text-secondary border-border'}`}>
                      {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {s.contradicting_evidence_ids.length > 0 && (
                    <p className="text-[10px] text-semantic-critical font-bold flex items-center gap-1 mt-1">
                      <AlertTriangle size={12} /> Contradictory evidence found
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Officer Correction Box */}
      <Card>
        <div className="flex items-center gap-2 mb-2.5">
          <ShieldAlert className="text-brand-primary h-4 w-4" />
          <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Officer Override &amp; Correction</h4>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={correctionMsg}
            onChange={(e) => setCorrectionMsg(e.target.value)}
            placeholder="Tell the AI to correct an assumption, ignore a suspect, or prioritise a step…"
            className="flex-1 px-4 py-2.5 text-sm bg-surface border border-border text-text-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary placeholder:text-text-muted transition-all"
            onKeyDown={(e) => e.key === 'Enter' && handleCorrect()}
            disabled={actionLoading}
          />
          <Button onClick={handleCorrect} isLoading={actionLoading} disabled={!correctionMsg.trim()} className="!px-4">
            <Send size={16} />
          </Button>
        </div>
      </Card>
    </div>
  );
}


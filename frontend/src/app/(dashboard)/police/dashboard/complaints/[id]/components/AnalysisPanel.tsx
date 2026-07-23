'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Bot, UserCircle, Send, AlertTriangle, ShieldAlert, RefreshCw, Scale, Users, Plus, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
  roles: Array<'Victim' | 'Witness' | 'Suspect' | 'Accused' | 'Complainant'>;
  confidence: number;
  reason: string;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  recommended_sections?: SuggestedLegalSection[];
}

interface ParticipantSummary {
  participant_id: string;
  name: string;
  roles: string[];
}

interface Snapshot {
  snapshot_id: string;
  timestamp: string;
  narrative_summary: string;
  participant_recommendations?: ParticipantRecommendation[];
  ranked_next_steps: NextStep[];
  confidence_breakdown?: {
    evidence_coverage: number;
    checklist_progress: number;
    corroboration: number;
    contradiction_penalty: number;
    final_score: number;
  };
  suggested_legal_sections?: SuggestedLegalSection[];
  trigger: string;
  officer_authored: boolean;
}

interface AnalysisPanelProps {
  snapshot: Snapshot | null;
  participants: ParticipantSummary[];
  loading: boolean;
  onCorrectSnapshot: (message: string) => Promise<void>;
  onTriggerAnalysis: () => Promise<void>;
  onAttachSectionsToParticipant: (participantId: string, sections: SuggestedLegalSection[]) => Promise<void>;
  onAcceptRecommendedSection: (recommendation: ParticipantRecommendation, section: SuggestedLegalSection) => Promise<void>;
  onApproveParticipant?: (recommendation: ParticipantRecommendation) => Promise<void>;
  actionLoading: boolean;
}

export function AnalysisPanel({
  snapshot,
  participants,
  loading,
  onCorrectSnapshot,
  onTriggerAnalysis,
  onAttachSectionsToParticipant,
  onAcceptRecommendedSection,
  onApproveParticipant,
  actionLoading,
}: AnalysisPanelProps) {
  const [correctionMsg, setCorrectionMsg] = useState('');
  const [dismissedRecommendationKeys, setDismissedRecommendationKeys] = useState<string[]>([]);
  const [loadingItemKey, setLoadingItemKey] = useState<string | null>(null);

  const handleCorrect = async () => {
    if (!correctionMsg.trim()) return;
    await onCorrectSnapshot(correctionMsg);
    setCorrectionMsg('');
  };

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

  if (loading) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <Loader />
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card className="h-full min-h-[400px] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Bot className="h-12 w-12 text-neutral-300" />
        <div>
          <h3 className="text-lg font-bold text-neutral-700">No Analysis Snapshot</h3>
          <p className="text-sm text-neutral-500 max-w-sm mt-2">
            The AI has not analyzed this case yet. Trigger an initial analysis to generate suspects, next steps, and narrative summaries.
          </p>
        </div>
        <Button onClick={onTriggerAnalysis} isLoading={actionLoading} leftIcon={<Bot size={16} />}>
          Run AI Analysis
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Overview & Score */}
      <Card>
        <div className="flex justify-between items-start border-b border-neutral-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Bot className="text-primary-600 h-5 w-5" />
            <div>
              <h3 className="font-bold text-neutral-900">AI Investigation Analysis</h3>
              <p className="text-[10px] text-neutral-500 font-medium">
                Snapshot: {snapshot.snapshot_id} | {new Date(snapshot.timestamp).toLocaleString('en-IN')}
                {snapshot.officer_authored && (
                  <span className="ml-2 text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                    OFFICER AUTHORED
                  </span>
                )}
              </p>
            </div>
          </div>
          {snapshot.confidence_breakdown && (
            <div className="text-right">
              <div className="text-2xl font-black text-primary-700">
                {(snapshot.confidence_breakdown.final_score * 100).toFixed(0)}<span className="text-sm text-neutral-400">%</span>
              </div>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Confidence Score</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Narrative Summary</p>
              {!snapshot.narrative_summary && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onTriggerAnalysis}
                  isLoading={actionLoading}
                  leftIcon={<RefreshCw size={12} />}
                >
                  Generate Summary
                </Button>
              )}
            </div>
            <div className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-lg border border-neutral-200">
              {snapshot.narrative_summary ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{snapshot.narrative_summary}</ReactMarkdown>
                </div>
              ) : (
                <span className="italic text-neutral-400">No summary generated yet — click &quot;Generate Summary&quot; above to run the AI.</span>
              )}
            </div>
          </div>



          {allRecommendations.length > 0 && (
            <div className="mt-4 border border-emerald-100 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-emerald-50 px-4 py-2 flex items-center gap-2 border-b border-emerald-100">
                <Scale className="text-emerald-600 h-4 w-4" />
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Legal Advisor</h4>
              </div>
              <div className="p-4 bg-white space-y-4">
                {allRecommendations.map((recommendation) => {
                  const participantKey = `participant:${recommendation.name}`;
                  // Check if participant is already approved (in participants list with same name)
                  const isApproved = participants.some(
                    (p) => p.name.trim().toLowerCase() === recommendation.name.trim().toLowerCase()
                  );

                  return (
                    <div key={`${recommendation.name}-${recommendation.roles.join(',')}`} className="rounded-lg border border-neutral-200 p-3 bg-neutral-50/40">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{recommendation.name}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {recommendation.roles.join(', ')} • {(recommendation.confidence * 100).toFixed(0)}% confidence
                          </p>
                          <p className="text-xs text-neutral-600 mt-1">{recommendation.reason}</p>
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
                            const dismissalKey = `${recommendation.name}:${section.code}`;
                            const sectionKey = `section:${recommendation.name}:${section.code}`;
                            if (isRecommendationDismissed(recommendation.name, section.code)) return null;

                            // Check if this section is already applied to this participant
                            const participantObj = participants.find((p) => p.name.trim().toLowerCase() === recommendation.name.trim().toLowerCase());
                            const appliedSections = participantObj
                              ? (participantObj.roles.includes('Accused') ? (participantObj as any).accusedProfile?.appliedSections : (participantObj as any).suspectProfile?.appliedSections) || []
                              : [];
                            const isSectionAccepted = appliedSections.some((s: any) => s.code === section.code);

                            return (
                              <div key={dismissalKey} className="flex items-start justify-between gap-3 rounded-md border border-emerald-100 bg-white p-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-neutral-800">
                                    <strong>{section.code}</strong>: {section.title}
                                  </p>
                                  {section.reason && <p className="text-xs text-neutral-500 mt-1">{section.reason}</p>}
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

          {snapshot.confidence_breakdown && (
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
              <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-2">Score Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-neutral-500">Evidence</p>
                  <p className="font-semibold text-neutral-800">{(snapshot.confidence_breakdown.evidence_coverage * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-neutral-500">Checklist</p>
                  <p className="font-semibold text-neutral-800">{(snapshot.confidence_breakdown.checklist_progress * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-neutral-500">Corroboration</p>
                  <p className="font-semibold text-green-600">+{(snapshot.confidence_breakdown.corroboration * 100).toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Contradiction</p>
                  <p className="font-semibold text-red-600">-{(snapshot.confidence_breakdown.contradiction_penalty * 100).toFixed(0)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 mt-4">
        {/* Next Steps */}
        <Card className="flex flex-col lg:col-span-2">
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
                    <p className="text-sm font-bold text-neutral-800">{step.step_id.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-neutral-600 mt-1">{step.reason}</p>
                    {step.evidence_needed.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {step.evidence_needed.map(ev => (
                          <span key={ev} className="text-[9px] uppercase tracking-wider bg-white border border-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded">
                            Requires: {ev}
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



      {/* Correction Chat Box */}
      <Card className="mt-auto">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="text-orange-500 h-4 w-4" />
          <h4 className="text-xs font-bold text-neutral-700 uppercase">Officer Override & Correction</h4>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={correctionMsg}
            onChange={(e) => setCorrectionMsg(e.target.value)}
            placeholder="Instruct the AI to correct assumptions, ignore a suspect, or prioritize a step..."
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

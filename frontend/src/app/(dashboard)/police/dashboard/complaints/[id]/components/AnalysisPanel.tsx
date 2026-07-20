'use client';

import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Bot, UserCircle, Send, AlertTriangle, ShieldAlert, CheckCircle2, RefreshCw, Scale } from 'lucide-react';
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

interface Snapshot {
  snapshot_id: string;
  timestamp: string;
  narrative_summary: string;
  suspect_candidates: Suspect[];
  ranked_next_steps: NextStep[];
  confidence_breakdown?: {
    evidence_coverage: number;
    checklist_progress: number;
    corroboration: number;
    contradiction_penalty: number;
    final_score: number;
  };
  suggested_legal_sections?: string[];
  trigger: string;
  officer_authored: boolean;
}

interface AnalysisPanelProps {
  snapshot: Snapshot | null;
  loading: boolean;
  onCorrectSnapshot: (message: string) => Promise<void>;
  onTriggerAnalysis: () => Promise<void>;
  actionLoading: boolean;
}

export function AnalysisPanel({ snapshot, loading, onCorrectSnapshot, onTriggerAnalysis, actionLoading }: AnalysisPanelProps) {
  const [correctionMsg, setCorrectionMsg] = useState('');

  const handleCorrect = async () => {
    if (!correctionMsg.trim()) return;
    await onCorrectSnapshot(correctionMsg);
    setCorrectionMsg('');
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

          {/* Legal Advisor Section */}
          {snapshot.suggested_legal_sections && snapshot.suggested_legal_sections.length > 0 && (
            <div className="mt-4 border border-indigo-100 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-indigo-50 px-4 py-2 flex items-center gap-2 border-b border-indigo-100">
                <Scale className="text-indigo-600 h-4 w-4" />
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Legal Advisor (Applicable Sections)</h4>
              </div>
              <div className="p-4 bg-white">
                <ul className="space-y-2">
                  {snapshot.suggested_legal_sections.map((section, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-neutral-700 bg-indigo-50/30 p-2 rounded border border-indigo-50">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span><ReactMarkdown>{section}</ReactMarkdown></span>
                    </li>
                  ))}
                </ul>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
        {/* Suspects */}
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

        {/* Next Steps */}
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

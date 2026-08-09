'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  Lock,
  Send,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Building2,
} from 'lucide-react';
import apiClient from '@/lib/axios';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { StepProofModal } from './StepProofModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistStep {
  _id?: string;
  step_id: string;
  title?: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  criticality?: 'high' | 'medium' | 'low';
  required_evidence?: string[];
  evidence_needed?: string[];
  proof_evidence_ids?: string[];
  evidence_collected?: string[];
  department_entity_id?: string;
  target?: 'department_entity' | 'complainant' | string;
  locked_by_request_id?: string;
  completed_at?: string;
}

interface ChecklistPanelProps {
  checklist: { steps: ChecklistStep[] } | null;
  onOpenComposer: (stepId: string, deptId: string) => void;
  evidenceList: any[];
  caseId: string;
  onRefresh: () => void;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  completed: {
    icon: <CheckCircle2 size={16} />,
    pill: 'bg-green-900/30 text-green-400 border-green-800/50',
    bar:  'bg-green-500',
    row:  'border-l-4 border-green-400 bg-green-900/10',
    label: 'Completed',
  },
  in_progress: {
    icon: <Clock size={16} className="animate-pulse" />,
    pill: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
    bar:  'bg-blue-500',
    row:  'border-l-4 border-blue-400 bg-blue-900/10',
    label: 'In Progress',
  },
  blocked: {
    icon: <Lock size={16} />,
    pill: 'bg-red-900/30 text-red-400 border-red-800/50',
    bar:  'bg-red-400',
    row:  'border-l-4 border-red-400 bg-red-900/10',
    label: 'Blocked',
  },
  pending: {
    icon: <Circle size={16} />,
    pill: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
    bar:  'bg-yellow-400',
    row:  'border-l-4 border-yellow-400 bg-neutral-900/50',
    label: 'Pending',
  },
} as const;

const CRITICALITY_DOT: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-yellow-400',
  low:    'bg-blue-400',
};

// ─── Single step row ──────────────────────────────────────────────────────────

function StepRow({
  step,
  index,
  caseId,
  evidenceList,
  onOpenComposer,
  onRefresh,
}: {
  step: ChecklistStep;
  index: number;
  caseId: string;
  evidenceList: any[];
  onOpenComposer: (stepId: string, deptId: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [citizenLoading, setCitizenLoading] = useState(false);

  const cfg    = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
  const title  = step.title || step.description || step.step_id.replace(/_/g, ' ');
  const evNeeded    = step.required_evidence ?? step.evidence_needed ?? [];
  const evCollected = step.proof_evidence_ids ?? step.evidence_collected ?? [];
  const evPct = evNeeded.length > 0 ? Math.round((evCollected.length / evNeeded.length) * 100) : 0;

  const isDept      = step.target === 'department_entity' || !!step.department_entity_id;
  const isCitizen   = step.target === 'complainant';
  const isInternal  = !isDept && !isCitizen;
  const isLocked    = !!step.locked_by_request_id;

  const handleCitizenRequest = async () => {
    setCitizenLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/citizen-request`, { step_id: step.step_id });
      onRefresh();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to create citizen request');
    } finally {
      setCitizenLoading(false);
    }
  };

  return (
    <>
      <div className={`rounded-lg border ${cfg.row} overflow-hidden transition-all`}>
        {/* Main row */}
        <div className="flex items-start gap-3 p-3">
          {/* Step number */}
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[11px] font-bold text-neutral-500 mt-0.5">
            {index + 1}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Criticality dot */}
              {step.criticality && (
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${CRITICALITY_DOT[step.criticality] ?? 'bg-neutral-300'}`}
                  title={`${step.criticality} criticality`}
                />
              )}

              {/* Title */}
              <span className="text-sm font-semibold text-white capitalize leading-snug">
                {title}
              </span>

              {/* Status pill */}
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                {cfg.icon}
                {cfg.label}
              </span>

              {/* Locked badge */}
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500 border border-neutral-700">
                  <Lock size={10} /> Awaiting response
                </span>
              )}
            </div>

            {/* Target badge */}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {isDept && step.department_entity_id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-800/50">
                  <Building2 size={10} /> {step.department_entity_id}
                </span>
              )}
              {isCitizen && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-900/20 text-yellow-400 border border-yellow-800/50">
                  <UserCheck size={10} /> Complainant
                </span>
              )}

              {/* Evidence progress */}
              {evNeeded.length > 0 && (
                <span className="text-[10px] text-neutral-400 font-medium">
                  Evidence: {evCollected.length}/{evNeeded.length}
                </span>
              )}

              {/* Completed timestamp */}
              {step.status === 'completed' && step.completed_at && (
                <span className="text-[10px] text-neutral-400">
                  {new Date(step.completed_at).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>

            {/* Evidence progress bar */}
            {evNeeded.length > 0 && (
              <div className="mt-2 w-full bg-neutral-800 rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all ${evPct === 100 ? 'bg-green-500' : 'bg-blue-400'}`}
                  style={{ width: `${evPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Right side: actions + expand */}
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {/* Action button */}
            {step.status !== 'completed' && (
              <>
                {isDept && !isLocked && (
                  <button
                    onClick={() => onOpenComposer(step.step_id, step.department_entity_id || 'UNKNOWN_DEPARTMENT')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    <Send size={12} /> Request
                  </button>
                )}
                {isInternal && (
                  <button
                    onClick={() => setProofOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    <CheckCircle2 size={12} /> Complete
                  </button>
                )}
                {isCitizen && step.status !== 'blocked' && (
                  <button
                    onClick={handleCitizenRequest}
                    disabled={citizenLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-colors disabled:opacity-50"
                  >
                    <UserCheck size={12} /> {citizenLoading ? '…' : 'Ask Citizen'}
                  </button>
                )}
              </>
            )}

            {/* Expand toggle */}
            {(evNeeded.length > 0 || step.description || step.title) && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-neutral-400 hover:text-neutral-600 transition-colors p-0.5"
                title={expanded ? 'Collapse' : 'Expand details'}
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-4 pb-3 border-t border-neutral-100 bg-neutral-50/50">
            {(step.description || step.title) && (
              <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
                {step.description && step.title ? step.description : (step.description || step.title)}
              </p>
            )}
            {evNeeded.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                  Required Evidence
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {evNeeded.map(ev => {
                    const collected = evCollected.includes(ev);
                    return (
                      <span
                        key={ev}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          collected
                            ? 'bg-green-900/30 text-green-400 border-green-800/50'
                            : 'bg-neutral-900/50 text-neutral-500 border-neutral-700'
                        }`}
                      >
                        {collected ? <CheckCircle2 size={9} /> : <Circle size={9} />}
                        {ev}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <StepProofModal
        isOpen={proofOpen}
        onClose={() => setProofOpen(false)}
        caseId={caseId}
        stepId={step.step_id}
        evidenceList={evidenceList}
        onSuccess={() => { setProofOpen(false); onRefresh(); }}
      />
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ChecklistPanel({ checklist, onOpenComposer, evidenceList, caseId, onRefresh }: ChecklistPanelProps) {
  if (!checklist) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-sm text-neutral-400 italic">
        No checklist generated yet. Run AI Analysis to generate investigation steps.
      </div>
    );
  }

  const steps = checklist.steps ?? [];
  const completed  = steps.filter(s => s.status === 'completed').length;
  const blocked    = steps.filter(s => s.status === 'blocked').length;
  const inProgress = steps.filter(s => s.status === 'in_progress').length;
  const pending    = steps.filter(s => s.status === 'pending').length;
  const pct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="bg-neutral-900/50 rounded-xl border border-neutral-700 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Investigation Checklist</h3>
          <span className="text-xs font-semibold text-neutral-500">
            {completed}/{steps.length} complete
          </span>
        </div>

        {/* Overall progress bar */}
        <div className="w-full bg-neutral-800 rounded-full h-2 mb-3">
          <div
            className="h-2 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Status counts */}
        <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold">
          <div className="bg-green-900/20 border border-green-800/50 rounded-lg py-1.5">
            <div className="text-lg font-black text-green-500">{completed}</div>
            <div className="text-green-500 uppercase tracking-wider">Done</div>
          </div>
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg py-1.5">
            <div className="text-lg font-black text-blue-500">{inProgress}</div>
            <div className="text-blue-500 uppercase tracking-wider">Active</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg py-1.5">
            <div className="text-lg font-black text-yellow-500">{pending}</div>
            <div className="text-yellow-500 uppercase tracking-wider">Pending</div>
          </div>
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg py-1.5">
            <div className="text-lg font-black text-red-500">{blocked}</div>
            <div className="text-red-500 uppercase tracking-wider">Blocked</div>
          </div>
        </div>

        {/* Criticality legend */}
        <div className="mt-3 flex items-center gap-3 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> High</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/> Medium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/> Low</span>
        </div>
      </div>

      {/* Step list */}
      {steps.length === 0 ? (
        <div className="text-sm text-neutral-400 italic text-center py-8">
          No steps in this checklist.
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <StepRow
              key={step.step_id}
              step={step}
              index={i}
              caseId={caseId}
              evidenceList={evidenceList}
              onOpenComposer={onOpenComposer}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

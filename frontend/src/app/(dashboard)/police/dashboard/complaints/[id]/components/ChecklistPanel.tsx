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
    pill: 'bg-semantic-success/10 text-semantic-success border border-semantic-success/30 font-bold',
    bar:  'bg-semantic-success',
    row:  'border-l-4 border-semantic-success bg-surface border-y border-r border-border shadow-xs',
    label: 'Completed',
  },
  in_progress: {
    icon: <Clock size={16} className="animate-pulse" />,
    pill: 'bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-bold',
    bar:  'bg-brand-primary',
    row:  'border-l-4 border-brand-primary bg-surface border-y border-r border-border shadow-xs',
    label: 'In Progress',
  },
  blocked: {
    icon: <Lock size={16} />,
    pill: 'bg-semantic-critical/10 text-semantic-critical border border-semantic-critical/30 font-bold',
    bar:  'bg-semantic-critical',
    row:  'border-l-4 border-semantic-critical bg-surface border-y border-r border-border shadow-xs',
    label: 'Blocked',
  },
  pending: {
    icon: <Circle size={16} />,
    pill: 'bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/30 font-bold',
    bar:  'bg-semantic-warning',
    row:  'border-l-4 border-semantic-warning bg-surface border-y border-r border-border shadow-xs',
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
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-[11px] font-mono font-bold text-text-secondary mt-0.5 shadow-xs">
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
              <span className="text-sm font-bold text-text-primary capitalize leading-snug">
                {title}
              </span>

              {/* Status pill */}
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${cfg.pill}`}>
                {cfg.icon}
                {cfg.label}
              </span>

              {/* Locked badge */}
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-surface-elevated text-text-secondary border border-border">
                  <Lock size={10} /> Awaiting response
                </span>
              )}
            </div>

            {/* Target badge */}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {isDept && step.department_entity_id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  <Building2 size={10} /> {step.department_entity_id}
                </span>
              )}
              {isCitizen && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/30">
                  <UserCheck size={10} /> Complainant
                </span>
              )}

              {/* Evidence progress */}
              {evNeeded.length > 0 && (
                <span className="text-[10px] text-text-secondary font-mono font-medium">
                  Evidence: {evCollected.length}/{evNeeded.length}
                </span>
              )}

              {/* Completed timestamp */}
              {step.status === 'completed' && step.completed_at && (
                <span className="text-[10px] text-text-secondary font-mono">
                  {new Date(step.completed_at).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>

            {/* Evidence progress bar */}
            {evNeeded.length > 0 && (
              <div className="mt-2 w-full bg-surface-elevated rounded-full h-1.5 border border-border overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-brand-primary transition-all"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white shadow-xs transition-all"
                  >
                    <Send size={12} /> Request
                  </button>
                )}
                {isInternal && (
                  <button
                    onClick={() => setProofOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white shadow-xs transition-all"
                  >
                    <CheckCircle2 size={12} /> Complete
                  </button>
                )}
                {isCitizen && step.status !== 'blocked' && (
                  <button
                    onClick={handleCitizenRequest}
                    disabled={citizenLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-semantic-warning text-white hover:bg-semantic-warning/90 shadow-xs transition-all disabled:opacity-50"
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
                className="text-text-secondary hover:text-text-primary transition-colors p-1"
                title={expanded ? 'Collapse' : 'Expand details'}
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-4 pb-3 border-t border-border bg-surface-elevated/40">
            {(step.description || step.title) && (
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                {step.description && step.title ? step.description : (step.description || step.title)}
              </p>
            )}
            {evNeeded.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">
                  Required Evidence
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {evNeeded.map(ev => {
                    const collected = evCollected.includes(ev);
                    return (
                      <span
                        key={ev}
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                          collected
                            ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
                            : 'bg-surface text-text-secondary border-border'
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
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">Investigation Checklist</h3>
          <span className="text-xs font-mono font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-lg border border-brand-primary/20">
            {completed}/{steps.length} Complete ({pct}%)
          </span>
        </div>

        {/* Overall progress bar */}
        <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden border border-border/50">
          <div
            className="h-2 rounded-full bg-brand-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Status counts */}
        <div className="grid grid-cols-4 gap-3 text-center text-xs font-bold">
          <div className="bg-semantic-success/10 border border-semantic-success/30 rounded-xl py-2 shadow-xs">
            <div className="text-lg font-black text-semantic-success">{completed}</div>
            <div className="text-[10px] text-semantic-success uppercase tracking-wider font-extrabold">Done</div>
          </div>
          <div className="bg-brand-primary/10 border border-brand-primary/30 rounded-xl py-2 shadow-xs">
            <div className="text-lg font-black text-brand-primary">{inProgress}</div>
            <div className="text-[10px] text-brand-primary uppercase tracking-wider font-extrabold">Active</div>
          </div>
          <div className="bg-semantic-warning/10 border border-semantic-warning/30 rounded-xl py-2 shadow-xs">
            <div className="text-lg font-black text-semantic-warning">{pending}</div>
            <div className="text-[10px] text-semantic-warning uppercase tracking-wider font-extrabold">Pending</div>
          </div>
          <div className="bg-semantic-critical/10 border border-semantic-critical/30 rounded-xl py-2 shadow-xs">
            <div className="text-lg font-black text-semantic-critical">{blocked}</div>
            <div className="text-[10px] text-semantic-critical uppercase tracking-wider font-extrabold">Blocked</div>
          </div>
        </div>

        {/* Criticality legend */}
        <div className="pt-2 border-t border-border flex items-center gap-4 text-xs font-semibold text-text-secondary">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-semantic-critical inline-block shadow-xs"/> High</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-semantic-warning inline-block shadow-xs"/> Medium</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-primary inline-block shadow-xs"/> Low</span>
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

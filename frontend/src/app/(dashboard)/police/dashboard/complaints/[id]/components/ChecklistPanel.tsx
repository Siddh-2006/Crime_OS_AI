'use client';

import React from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Circle, AlertCircle, Clock, Send, Lock } from 'lucide-react';
import apiClient from '@/lib/axios';

import { StepProofModal } from './StepProofModal';

interface ChecklistStep {
  step_id: string;
  description: string;
  status: 'pending' | 'completed' | 'blocked';
  evidence_needed: string[];
  evidence_collected: string[];
  department_entity_id?: string;
  target?: 'department_entity' | 'complainant';
  completed_at?: string;
  proof_evidence_ids?: string[];
  locked_by_request_id?: string;
}

interface CaseChecklistData {
  steps: ChecklistStep[];
}

interface ChecklistPanelProps {
  checklist: CaseChecklistData | null;
  onOpenComposer: (stepId: string, deptId: string) => void;
  evidenceList: any[];
  caseId: string;
  onRefresh: () => void;
}

export function ChecklistPanel({ checklist, onOpenComposer, evidenceList, caseId, onRefresh }: ChecklistPanelProps) {
  const [proofModalStepId, setProofModalStepId] = React.useState<string | null>(null);
  const [requestingCitizen, setRequestingCitizen] = React.useState<string | null>(null);

  const handleCitizenRequest = async (stepId: string) => {
    setRequestingCitizen(stepId);
    try {
      await apiClient.post(`/cases/${caseId}/citizen-request`, {
        step_id: stepId,
      });
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Error creating citizen request');
    } finally {
      setRequestingCitizen(null);
    }
  };

  if (!checklist) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-neutral-400 italic">No checklist generated yet.</p>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-green-500 h-5 w-5" />;
      case 'blocked': return <AlertCircle className="text-red-500 h-5 w-5" />;
      case 'pending': return <Clock className="text-yellow-500 h-5 w-5" />;
      default: return <Circle className="text-neutral-300 h-5 w-5" />;
    }
  };

  return (
    <Card className="h-full max-h-[800px] flex flex-col">
      <CardHeader title="Investigation Checklist" />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(checklist.steps ?? []).map((step) => {
          const title = step.title || step.description || step.step_id;
          const evidenceNeeded = step.required_evidence || step.evidence_needed || [];
          const evidenceCollected = step.proof_evidence_ids || step.evidence_collected || [];
          // Note: for department steps, we need to know the department_entity_id. In the new DB, this might come from another place, but for now we fallback to step.department_entity_id if it exists.
          const isDeptStep = !!step.department_entity_id || !!step.locked_by_request_id;
          const isCitizenStep = step.target === 'complainant';
          const isManualStep = !isDeptStep && !isCitizenStep;

          return (
            <div
              key={step.step_id}
              className={`p-4 border rounded-lg transition-colors ${step.status === 'completed'
                  ? 'bg-green-50/30 border-green-200'
                  : step.status === 'blocked'
                    ? 'bg-red-50/30 border-red-200'
                    : 'bg-white border-neutral-200 shadow-sm'
                }`}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getStatusIcon(step.status)}</div>
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 capitalize">
                      {step.step_id.replace(/_/g, ' ')}
                    </h4>
                    <p className="text-xs text-neutral-600 mt-1">{title}</p>

                    {evidenceNeeded.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {evidenceNeeded.map(ev => (
                          <span key={ev} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${evidenceCollected.includes(ev)
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                            }`}>
                            {ev} {evidenceCollected.includes(ev) && '✓'}
                          </span>
                        ))}
                      </div>
                    )}

                    {step.department_entity_id && step.target !== 'complainant' && (
                      <p className="text-[10px] text-blue-600 font-semibold mt-2 uppercase tracking-wider">
                        Dept: {step.department_entity_id}
                      </p>
                    )}
                    {step.target === 'complainant' && (
                      <p className="text-[10px] text-purple-600 font-semibold mt-2 uppercase tracking-wider">
                        Target: Complainant
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  {step.status === 'completed' && step.completed_at && (
                    <span className="text-[10px] text-neutral-400 font-medium">
                      {new Date(step.completed_at).toLocaleDateString()}
                    </span>
                  )}

                  {step.status !== 'completed' && (step.department_entity_id || step.target === 'department_entity') && step.target !== 'complainant' && (
                    <Button
                      size="sm"
                      variant={step.status === 'blocked' ? 'danger' : 'primary'}
                      onClick={() => onOpenComposer(step.step_id, step.department_entity_id || 'UNKNOWN_DEPARTMENT')}
                      className="mt-1"
                    >
                      <Send size={14} className="mr-1" /> Request
                    </Button>
                  )}
                  {step.status !== 'completed' && step.target === 'complainant' && (
                    <Button
                      size="sm"
                      variant={step.status === 'blocked' ? 'danger' : 'primary'}
                      onClick={() => handleCitizenRequest(step.step_id)}
                      disabled={requestingCitizen === step.step_id || step.status === 'blocked'}
                      className="mt-1 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Send size={14} className="mr-1" /> {step.status === 'blocked' ? 'Requested' : 'Ask Citizen'}
                    </Button>
                  )}
                  {step.status === 'pending' && (!step.target || step.target === 'internal' || (step.target !== 'department_entity' && step.target !== 'complainant')) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-1"
                      onClick={() => setProofModalStepId(step.step_id)}
                    >
                      Attach Proof & Complete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {proofModalStepId && (
        <StepProofModal
          isOpen={!!proofModalStepId}
          onClose={() => setProofModalStepId(null)}
          caseId={caseId}
          stepId={proofModalStepId}
          evidenceList={evidenceList}
          onSuccess={() => {
            setProofModalStepId(null);
            onRefresh();
          }}
        />
      )}
    </Card>
  );
}

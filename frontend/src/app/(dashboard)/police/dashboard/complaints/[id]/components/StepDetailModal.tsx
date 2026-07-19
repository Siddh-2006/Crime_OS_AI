'use client';

import React, { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import apiClient from '@/lib/axios';
import { Loader } from '@/components/ui/Loader';

interface StepDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stepId: string;
  evidenceList: any[];
}

export default function StepDetailModal({ isOpen, onClose, caseId, stepId, evidenceList }: StepDetailModalProps) {
  const [step, setStep] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && stepId) {
      setLoading(true);
      apiClient.get(`/cases/${caseId}/checklist`)
        .then((res) => {
          const s = res.data.data.steps.find((x: any) => x.step_id === stepId);
          setStep(s);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setStep(null);
    }
  }, [isOpen, caseId, stepId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg text-green-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Checklist Step Details</h2>
              <p className="text-xs text-neutral-500 capitalize">{stepId.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/30">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader /></div>
          ) : !step ? (
            <div className="h-full flex items-center justify-center text-neutral-400 italic">Step not found</div>
          ) : (
            <div className="space-y-6">
              
              <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-neutral-800">Status</h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase border border-green-200">
                    {step.status}
                  </span>
                </div>
                {step.completed_at && (
                  <p className="text-xs text-neutral-500">
                    Completed on: {new Date(step.completed_at).toLocaleString('en-IN')}
                  </p>
                )}
              </div>

              <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-3 border-b border-neutral-100 pb-2">Attached Proof</h3>
                
                {(!step.proof_evidence_ids || step.proof_evidence_ids.length === 0) ? (
                  <p className="text-xs text-neutral-500 italic">No proof attached.</p>
                ) : (
                  <div className="space-y-3">
                    {step.proof_evidence_ids.map((proofId: string) => {
                      const ev = evidenceList.find(e => e.evidence_id === proofId);
                      return (
                        <div key={proofId} className="flex gap-3 items-center bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                          <div className="text-xl">
                            {ev?.type === 'bank_statement' ? '🏦' : ev?.type === 'cdr' ? '📞' : '📄'}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-neutral-900">{ev ? ev.title : proofId}</p>
                            <p className="text-xs text-neutral-500">{ev ? ev.type : 'Unknown Evidence'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

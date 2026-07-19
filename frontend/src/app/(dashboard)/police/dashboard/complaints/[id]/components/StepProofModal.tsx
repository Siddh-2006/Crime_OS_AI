'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { X, Check, Upload } from 'lucide-react';
import apiClient from '@/lib/axios';
import { AddEvidenceModal } from './AddEvidenceModal';

interface StepProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stepId: string;
  evidenceList: any[];
  onSuccess: () => void;
  onRefresh?: () => void; // Optional to not break existing usages, but we will pass it
}

export function StepProofModal({ isOpen, onClose, caseId, stepId, evidenceList, onSuccess, onRefresh }: StepProofModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addEvidenceOpen, setAddEvidenceOpen] = useState(false);

  if (!isOpen) return null;

  const handleComplete = async () => {
    if (selectedIds.length === 0) {
      setError('Please select at least one evidence item to serve as proof.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/cases/${caseId}/checklist/${stepId}/complete`, {
        proof_evidence_ids: selectedIds
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to complete step');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-neutral-100">
            <div>
              <h3 className="font-bold text-neutral-900">Attach Proof for Completion</h3>
              <p className="text-xs text-neutral-500 capitalize">{stepId.replace(/_/g, ' ')}</p>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Select Evidence Items
                </label>
                <Button variant="ghost" size="sm" onClick={() => setAddEvidenceOpen(true)}>
                  <Upload size={14} className="mr-1" /> Upload New
                </Button>
              </div>
              {evidenceList.length === 0 ? (
                <p className="text-sm text-neutral-500 italic border border-dashed p-4 rounded-lg text-center">
                  No evidence available in the case. <br/>
                  <a href="#" className="text-blue-600 font-semibold" onClick={(e) => { e.preventDefault(); setAddEvidenceOpen(true); }}>Click here</a> to upload some.
                </p>
              ) : (
                <div className="space-y-2">
                  {evidenceList.map(ev => {
                    const id = ev.evidence_id || ev._id;
                    const isSelected = selectedIds.includes(id);
                    return (
                      <div
                        key={id}
                        onClick={() => toggleSelection(id)}
                        className={`p-3 rounded-lg border cursor-pointer flex gap-3 items-center transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-neutral-200 hover:border-blue-200'
                          }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-neutral-300'
                          }`}>
                          {isSelected && <Check size={14} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{ev.title || ev.type}</p>
                          <p className="text-xs text-neutral-500 line-clamp-1">{ev.description || ev.ai_description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-neutral-100 flex justify-end gap-3 bg-neutral-50/50 rounded-b-xl">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={loading || selectedIds.length === 0}>
              {loading ? 'Completing...' : 'Complete Step'}
            </Button>
          </div>

        </div>
      </div>

      <AddEvidenceModal 
        isOpen={addEvidenceOpen} 
        onClose={() => setAddEvidenceOpen(false)} 
        caseId={caseId} 
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }} 
      />
    </>
  );
}

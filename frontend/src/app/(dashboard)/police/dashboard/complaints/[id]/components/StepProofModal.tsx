'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { X, Check, Upload, CheckCircle2 } from 'lucide-react';
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
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/cases/${caseId}/checklist/${stepId}/complete`, {
        notes,
        proof_evidence_ids: selectedIds
      });
      onSuccess();
      onRefresh?.();
      onClose();
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

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden">

          {/* Header */}
          <div className="flex justify-between items-center p-5 border-b border-border bg-surface shrink-0">
            <div>
              <h3 className="font-bold text-text-primary text-base">Complete Checklist Step</h3>
              <p className="text-xs text-text-secondary capitalize font-mono mt-0.5">{stepId.replace(/_/g, ' ')}</p>
            </div>
            <button onClick={onClose} className="p-2 text-text-secondary hover:bg-surface-elevated rounded-full transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-surface-elevated/30">
            {error && (
              <div className="bg-semantic-critical/10 text-semantic-critical text-xs font-bold p-3 rounded-xl border border-semantic-critical/30">
                {error}
              </div>
            )}

            {/* Checklist Action Summary / Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-text-primary uppercase tracking-wider">
                Action Taken / Findings Summary
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detail what happened, findings, or reasons for completing this step..."
                className="w-full rounded-xl border border-border bg-input-bg text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary p-3 text-xs font-medium placeholder:text-text-muted"
              />
            </div>

            {/* Attach Proof / Evidence */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-text-primary uppercase tracking-wider">
                  Attached Proof / Evidence (Optional)
                </label>
                <Button variant="ghost" size="sm" onClick={() => setAddEvidenceOpen(true)} className="!px-2 !py-1 text-xs">
                  <Upload size={13} className="mr-1" /> Upload File
                </Button>
              </div>

              {evidenceList.length === 0 ? (
                <div className="text-xs text-text-secondary italic border border-dashed border-border p-4 rounded-xl text-center space-y-1 bg-surface">
                  <p>No evidence items attached to this case yet.</p>
                  <button
                    type="button"
                    className="text-brand-primary font-bold hover:underline"
                    onClick={() => setAddEvidenceOpen(true)}
                  >
                    Click here to upload proof
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {evidenceList.map(ev => {
                    const id = ev.evidence_id || ev._id;
                    const isSelected = selectedIds.includes(id);
                    return (
                      <div
                        key={id}
                        onClick={() => toggleSelection(id)}
                        className={`p-3 rounded-xl border cursor-pointer flex gap-3 items-center transition-all ${
                          isSelected
                            ? 'bg-brand-primary/10 border-brand-primary/40'
                            : 'bg-surface border-border hover:bg-surface-elevated'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-brand-primary border-brand-primary text-white' : 'border-border bg-surface'
                          }`}
                        >
                          {isSelected && <Check size={13} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-text-primary truncate">{ev.title || ev.type}</p>
                          <p className="text-[11px] text-text-secondary truncate">{ev.description || ev.ai_description || 'Evidence File'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex justify-end gap-3 bg-surface shrink-0">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleComplete} isLoading={loading}>
              <CheckCircle2 size={14} className="mr-1.5" /> Mark Step Done
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
    </>,
    document.body
  );
}

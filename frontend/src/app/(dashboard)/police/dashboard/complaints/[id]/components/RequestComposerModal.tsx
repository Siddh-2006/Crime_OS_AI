'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileUpload, UploadedFile } from '@/components/ui/FileUpload';
import { Loader } from '@/components/ui/Loader';
import { Send, Edit3, ShieldAlert } from 'lucide-react';
import apiClient from '@/lib/axios';

interface RequestComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  stepId: string;
  departmentEntityId: string;
  onSuccess: () => void;
  showToast?: (message: string, variant: 'success' | 'error' | 'info' | 'warning') => void;
}

export function RequestComposerModal({ isOpen, onClose, caseId, stepId, departmentEntityId, onSuccess, showToast }: RequestComposerModalProps) {
  const isUnknownDept = !departmentEntityId || departmentEntityId === 'UNKNOWN_DEPARTMENT';
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [editableContent, setEditableContent] = useState('');
  const [caseEvidence, setCaseEvidence] = useState<any[]>([]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [overrideDept, setOverrideDept] = useState('');
  const effectiveDept = isUnknownDept ? overrideDept : departmentEntityId;
  
  // Fetch departments list whenever modal opens
  useEffect(() => {
    if (isOpen && departments.length === 0) {
      apiClient.get('/cases/departments').then(r => setDepartments(r.data.data || [])).catch(() => {});
    }
  }, [isOpen]);

  // Fetch or create draft on open — re-runs when effectiveDept changes (e.g. user picks dept from override)
  useEffect(() => {
    if (!isOpen || !caseId || !stepId || !effectiveDept) return;
    
    // Reset draft state for fresh generation
    setDraft(null);
    setEditableContent('');

    const initDraft = async () => {
      setLoading(true);
      try {
        const res = await apiClient.post(`/cases/${caseId}/requests/draft`, {
          step_id: stepId,
          department_entity_id: effectiveDept,
          request_type: 'external_department',
          recipient_type: 'department'
        });
        const newDraft = res.data.data;
        setDraft(newDraft);
        setEditableContent(newDraft.draft_content || '');
        
        if (newDraft.attachments && Array.isArray(newDraft.attachments)) {
          setSelectedEvidenceIds(newDraft.attachments);
        }

        const evRes = await apiClient.get(`/cases/${caseId}/evidence`);
        setCaseEvidence(evRes.data.data || []);
      } catch (error) {
        console.error("Failed to generate draft", error);
        setDraft(false); // mark as failed
      } finally {
        setLoading(false);
      }
    };
    initDraft();
  }, [isOpen, caseId, stepId, effectiveDept]);

  const handleUpdateDraft = async () => {
    if (!draft || !draft.request_id) return;
    setActionLoading(true);
    try {
      await apiClient.patch(`/cases/${caseId}/requests/${draft.request_id}`, {
        draft_content: editableContent,
        attachments: selectedEvidenceIds
      });
      // Optionally show toast
    } catch (error) {
      console.error("Update failed", error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft || !draft.request_id) return;
    setActionLoading(true);
    try {
      // Save latest edits and attachments first
      await apiClient.patch(`/cases/${caseId}/requests/${draft.request_id}`, {
        draft_content: editableContent,
        attachments: selectedEvidenceIds,
        status: 'reviewed'
      });
      await apiClient.post(`/cases/${caseId}/requests/${draft.request_id}/send`);
      showToast?.('✅ Request sent successfully! Check the Requests tab for status.', 'success');
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to send request. Please try again.';
      showToast?.(msg, 'error');
      console.error('Send failed', error);
    } finally {
      setActionLoading(false);
    }
  };

  // Reset override when modal closes
  useEffect(() => {
    if (!isOpen) setOverrideDept('');
  }, [isOpen]);

  if (!isOpen) return null;

  // If department is unknown and not yet selected, show picker first
  if (isUnknownDept && !overrideDept) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Select Target Department" size="sm">
        <div className="space-y-4 py-2">
          <p className="text-sm text-neutral-600">The AI could not determine the target department for this step. Please select it manually before generating the draft.</p>
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Department</label>
            <select
              value={overrideDept}
              onChange={e => setOverrideDept(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            >
              <option value="">-- Select a department --</option>
              {departments.map((d: any) => (
                <option key={d.entity_id} value={d.entity_id}>{d.entity_name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => {}} disabled={!overrideDept}>Generate Draft</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Request Composer: ${effectiveDept}`}
      size="lg"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <Button variant="secondary" onClick={onClose} disabled={actionLoading}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleUpdateDraft} isLoading={actionLoading} leftIcon={<Edit3 size={15}/>}>
            Save Draft
          </Button>
          <Button onClick={handleSend} isLoading={actionLoading} leftIcon={<Send size={15}/>}>
            Send Official Request
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 flex justify-center"><Loader /></div>
      ) : draft ? (
        <div className="space-y-5">
          <div className="bg-brand-primary/10 border border-brand-primary/30 p-4 rounded-xl flex gap-3 text-xs text-text-primary shadow-xs">
            <ShieldAlert className="flex-shrink-0 mt-0.5 text-brand-primary" size={18} />
            <p className="leading-relaxed">
              This draft was automatically generated by AI based on case facts and checklist requirements. 
              Please review and edit before officially dispatching to <strong className="text-brand-primary">{effectiveDept}</strong>.
            </p>
          </div>

          <div className="bg-surface-elevated/60 border border-border rounded-xl p-3.5 text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary font-bold uppercase tracking-wider text-[11px]">To:</span>
              <span className="font-mono font-bold text-brand-primary px-2.5 py-0.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20">{effectiveDept}</span>
            </div>
            <span className="text-[11px] text-text-secondary font-medium">Official Dispatch Request</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-brand-primary uppercase tracking-wider mb-2">Draft Content</label>
            <textarea 
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              rows={12}
              className="w-full p-4 font-sans text-xs font-medium leading-relaxed border border-border rounded-xl focus:border-brand-primary focus:ring-1 focus:ring-brand-primary bg-input-bg text-text-primary shadow-inner"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Attach Case Evidence (Optional)</label>
            <div className="border border-border rounded-xl max-h-48 overflow-y-auto bg-surface p-2 space-y-1.5 shadow-xs">
              {caseEvidence.length === 0 ? (
                <div className="text-xs text-text-secondary p-3 text-center italic">No evidence available for this case.</div>
              ) : (
                caseEvidence.map(ev => {
                  const isChecked = selectedEvidenceIds.includes(ev.evidence_id);
                  const cloudinaryUrl = ev.cloudinary_url ||
                    (ev.storage_ref && !ev.storage_ref.startsWith('none') && !ev.storage_ref.startsWith('mock')
                      ? (ev.storage_ref.startsWith('http')
                          ? ev.storage_ref
                          : `https://res.cloudinary.com/q9ixw3zp/image/upload/${ev.storage_ref}`)
                      : null);
                  return (
                    <label key={ev.evidence_id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${isChecked ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-surface-elevated/40 border-border hover:border-brand-primary/30'}`}>
                      <input 
                        type="checkbox" 
                        className="mt-0.5 border-border rounded text-brand-primary focus:ring-brand-primary"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEvidenceIds(prev => [...prev, ev.evidence_id]);
                          } else {
                            setSelectedEvidenceIds(prev => prev.filter(id => id !== ev.evidence_id));
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-text-primary truncate">{(ev.original_filename || ev.type || '').replace(/_/g, ' ').toUpperCase()}</span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border uppercase ${ev.source === 'complainant' ? 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30' : 'bg-semantic-success/10 text-semantic-success border-semantic-success/30'}`}>
                            {ev.source === 'complainant' ? 'Complainant' : ev.source || 'IO'}
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border uppercase ${ev.status === 'verified' ? 'bg-semantic-success/10 text-semantic-success border-semantic-success/30' : 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'}`}>
                            {ev.status}
                          </span>
                        </div>
                        {ev.ai_description && (
                          <div className="text-[11px] text-text-secondary mt-1 line-clamp-1">{ev.ai_description}</div>
                        )}
                        {cloudinaryUrl && (
                          <a href={cloudinaryUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-primary hover:underline mt-1 inline-block" onClick={e => e.stopPropagation()}>
                            View File &rarr;
                          </a>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : draft === false ? (
        <div className="py-12 text-center text-semantic-critical font-bold text-xs">Failed to generate draft. Please try again.</div>
      ) : (
        <div className="py-12 flex justify-center"><Loader /></div>
      )}
    </Modal>
  );
}

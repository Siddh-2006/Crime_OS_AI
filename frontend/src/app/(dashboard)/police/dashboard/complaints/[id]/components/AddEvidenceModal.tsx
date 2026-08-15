'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/axios';

interface AddEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}

export function AddEvidenceModal({ isOpen, onClose, caseId, onSuccess }: AddEvidenceModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    type: 'other',
    description: '',
    source: 'IO_UPLOAD',
    is_physical: false,
    secureUrl: '',
    fileType: 'application/pdf',
  });

  const handleSubmit = async () => {
    if (!formData.title) return;
    if (!formData.secureUrl || !/^https?:\/\//i.test(formData.secureUrl)) {
      alert('Please enter a valid evidence URL (http/https) before saving.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post(`/cases/${caseId}/evidence`, {
        title: formData.title,
        type: formData.type,
        description: formData.description,
        source: formData.source,
        is_physical: formData.is_physical,
        secureUrl: formData.secureUrl,
        resourceType: formData.type,
        mimeType: formData.fileType,
        originalFilename: formData.title || 'io_evidence',
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(`Failed to upload evidence: ${e.response?.data?.message || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Evidence">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Evidence Title</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="e.g. Suspect Bank Statement"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Evidence Type</label>
          <select
            className="w-full px-3 py-2 border rounded-lg text-sm"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          >
            <option value="bank_statement">Bank Statement</option>
            <option value="transaction_log">Transaction Log</option>
            <option value="cdr">Call Detail Record (CDR)</option>
            <option value="kyc_document">KYC Document</option>
            <option value="screenshot">Screenshot</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Evidence URL</label>
          <input
            type="url"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="https://example.com/evidence.pdf"
            value={formData.secureUrl}
            onChange={(e) => setFormData({ ...formData, secureUrl: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Description</label>
          <textarea
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Provide context about this evidence..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isPhysical"
            checked={formData.is_physical}
            onChange={(e) => setFormData({ ...formData, is_physical: e.target.checked })}
          />
          <label htmlFor="isPhysical" className="text-sm font-semibold text-neutral-800">
            This is physical evidence (requires storage in Malkhana)
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={loading}>Upload Evidence</Button>
        </div>
      </div>
    </Modal>
  );
}

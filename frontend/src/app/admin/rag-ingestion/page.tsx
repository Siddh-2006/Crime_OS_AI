'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import apiClient from '@/lib/axios';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import AdminNavbar from '@/components/admin/AdminNavbar';

export default function RagIngestionPage() {
  const [docType, setDocType] = useState('SOP');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{ status: string; doc_type?: string; filename?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, showToast, removeToast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const pollStatus = async (id: string) => {
    try {
      const res = await apiClient.get(`/admin/rag/status/${id}`);
      const data = res.data.data;
      setJobStatus(data);

      if (data.status === 'Completed' || data.status?.startsWith('Failed')) {
        setIsUploading(false);
        if (data.status === 'Completed') {
          showToast('success', 'Document successfully ingested into RAG vector store!');
        } else {
          showToast('error', `Ingestion failed: ${data.status}`);
        }
      } else {
        setTimeout(() => pollStatus(id), 2000);
      }
    } catch (err: any) {
      setIsUploading(false);
      showToast('error', 'Failed to poll status.');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showToast('error', 'Please select a PDF file first.');
      return;
    }
    
    setIsUploading(true);
    setJobId(null);
    setJobStatus({ status: 'Starting upload...' });
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', docType);

    try {
      const res = await apiClient.post('/admin/rag/ingest', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const newJobId = res.data.data.job_id;
      setJobId(newJobId);
      showToast('success', 'Upload successful, ingestion started.');
      
      pollStatus(newJobId);
    } catch (err: any) {
      setIsUploading(false);
      showToast('error', err.response?.data?.message || 'Failed to upload document.');
      setJobStatus(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <AdminNavbar />
      
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-text-primary mb-2">Knowledge Base Ingestion</h1>
          <p className="text-text-secondary">Upload legal sections, SOPs, and guidelines directly into the AI RAG system.</p>
        </div>

        <Card className="p-8 bg-surface-elevated border-border">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Document Type</label>
              <Select 
                value={docType} 
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-input-bg border-border text-text-primary"
                disabled={isUploading}
                options={[
                  { value: 'SOP', label: 'SOP (Standard Operating Procedure)' },
                  { value: 'BNS', label: 'BNS (Bharatiya Nyaya Sanhita)' },
                  { value: 'BNSS', label: 'BNSS (Bharatiya Nagarik Suraksha Sanhita)' },
                  { value: 'BSA', label: 'BSA (Bharatiya Sakshya Adhiniyam)' },
                  { value: 'OTHER', label: 'Other Guideline' }
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Upload PDF</label>
              <div 
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors
                  ${file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border hover:border-input-border bg-input-bg'}`}
              >
                <input 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
                
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="text-text-primary font-medium">{file.name}</p>
                      <p className="text-sm text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    {!isUploading && (
                      <Button variant="outline" size="sm" onClick={() => setFile(null)} className="mt-2 text-xs">
                        Remove
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center text-text-secondary">
                      <Upload size={24} />
                    </div>
                    <div>
                      <p className="text-text-primary font-medium">Click to upload or drag and drop</p>
                      <p className="text-sm text-text-muted">PDF files only</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button 
              className="w-full h-12 text-md mt-4" 
              onClick={handleUpload}
              disabled={!file || isUploading}
            >
              {isUploading ? 'Ingesting...' : 'Ingest Document to RAG'}
            </Button>

            {jobStatus && (
              <div className="mt-8 p-6 rounded-lg bg-input-bg border border-border">
                <h3 className="text-sm font-medium text-text-secondary mb-4">Ingestion Status</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {jobStatus.status === 'Completed' ? (
                      <CheckCircle className="text-emerald-500" size={20} />
                    ) : jobStatus.status.startsWith('Failed') ? (
                      <AlertCircle className="text-rose-500" size={20} />
                    ) : (
                      <Loader2 className="text-blue-500 animate-spin" size={20} />
                    )}
                    <span className="text-text-primary font-medium">{jobStatus.status}</span>
                  </div>
                  {jobId && <span className="text-xs text-text-muted font-mono">ID: {jobId.split('-')[0]}...</span>}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

/**
 * Offline Evidence Manager
 * 
 * Component to manage downloading evidence for offline access.
 * Shows download status and allows users to download specific evidence files.
 */

'use client';

import React, { useState } from 'react';
import { Download, Check, Loader2, AlertCircle } from 'lucide-react';

interface OfflineEvidenceManagerProps {
  evidence: any[];
  caseId: string;
}

export function OfflineEvidenceManager({ evidence, caseId }: OfflineEvidenceManagerProps) {
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const handleDownload = async (evidenceItem: any) => {
    const evidenceId = evidenceItem.evidence_id || evidenceItem._id;
    const url = evidenceItem.cloudinary_url || evidenceItem.url;

    if (!url) {
      setErrors(new Map(errors.set(evidenceId, 'No URL available')));
      return;
    }

    setDownloadingIds(new Set(downloadingIds.add(evidenceId)));
    setErrors(new Map(errors));
    errors.delete(evidenceId);

    try {
      // Fetch the file
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const fileName = evidenceItem.filename || `evidence_${evidenceId}`;

      // Trigger browser download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setDownloadedIds(new Set(downloadedIds.add(evidenceId)));
    } catch (error: any) {
      console.error('Download failed:', error);
      setErrors(new Map(errors.set(evidenceId, error.message || 'Download failed')));
    } finally {
      const newDownloading = new Set(downloadingIds);
      newDownloading.delete(evidenceId);
      setDownloadingIds(newDownloading);
    }
  };

  if (!evidence || evidence.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-text-primary">Offline Evidence Access</h4>
          <p className="text-xs text-text-secondary mt-0.5">
            Download evidence files for offline viewing
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {evidence.map((item) => {
          const evidenceId = item.evidence_id || item._id;
          const isDownloading = downloadingIds.has(evidenceId);
          const isDownloaded = downloadedIds.has(evidenceId);
          const error = errors.get(evidenceId);

          return (
            <div
              key={evidenceId}
              className="flex items-center justify-between rounded-lg bg-surface p-3 text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">
                  {item.filename || item.description || 'Evidence file'}
                </p>
                {error && (
                  <p className="text-xs text-semantic-critical mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {error}
                  </p>
                )}
              </div>

              <button
                onClick={() => handleDownload(item)}
                disabled={isDownloading || !item.cloudinary_url}
                className={`ml-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  isDownloaded
                    ? 'bg-semantic-success/10 text-semantic-success cursor-default'
                    : isDownloading
                    ? 'bg-brand-primary/10 text-brand-primary cursor-wait'
                    : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white'
                }`}
              >
                {isDownloading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Downloading...
                  </>
                ) : isDownloaded ? (
                  <>
                    <Check size={14} />
                    Downloaded
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Download
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-text-muted mt-2">
        Note: Downloaded files will be saved to your device's default download location.
        URLs remain available offline for reference.
      </p>
    </div>
  );
}

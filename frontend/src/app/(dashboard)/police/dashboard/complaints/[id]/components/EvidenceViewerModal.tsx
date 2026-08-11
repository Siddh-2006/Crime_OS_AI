'use client';

import React from 'react';
import { X, FileText, FileAudio, FileVideo, FileImage, ExternalLink } from 'lucide-react';
import apiClient from '@/lib/axios';

interface EvidenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: any;
}

/** Safe date formatting — returns 'N/A' for missing/invalid dates */
function fmtDate(value: string | undefined | null): string {
  if (!value) return 'N/A';
  const d = new Date(value);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString('en-IN');
}

/** Determine a display-friendly title for the evidence item */
function evidenceTitle(ev: any): string {
  return ev.title || ev.originalFilename || ev.evidence_id || 'Evidence';
}

export default function EvidenceViewerModal({ isOpen, onClose, evidence }: EvidenceViewerModalProps) {
  if (!isOpen || !evidence) return null;

  // Resolve the actual URL — prefer Cloudinary secureUrl, then storage_ref
  const url: string =
    evidence.secureUrl ||
    evidence.storage_ref ||
    '';

  const isMockUrl =
    !url ||
    url.startsWith('mock') ||
    url.startsWith('seed/') ||
    url.startsWith('email-body');

  const renderContent = () => {
    if (!isMockUrl) {
      switch (evidence.type) {
        case 'image':
        case 'screenshot':
        case 'chat_screenshot':
          return (
            <div className="flex justify-center items-center h-full bg-black/5 rounded-lg overflow-hidden p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={evidenceTitle(evidence)}
                className="max-w-full max-h-[380px] object-contain rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden text-center p-6">
                <FileImage className="w-12 h-12 text-neutral-400 mx-auto mb-2" />
                <p className="text-sm text-neutral-500">Image could not be loaded.</p>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline mt-1 inline-flex items-center gap-1">
                  Open in new tab <ExternalLink size={11} />
                </a>
              </div>
            </div>
          );

        case 'video':
        case 'screen_recording':
          return (
            <div className="flex justify-center items-center h-full bg-black rounded-lg overflow-hidden">
              <video controls className="max-w-full max-h-[380px]">
                <source src={url} />
              </video>
            </div>
          );

        case 'audio':
          return (
            <div className="flex justify-center items-center h-full bg-neutral-50 rounded-lg p-8">
              <div className="text-center w-full max-w-sm">
                <FileAudio className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                <audio controls className="w-full">
                  <source src={url} />
                </audio>
              </div>
            </div>
          );

        case 'document':
        case 'bank_statement':
        case 'pdf':
          return (
            <div className="flex flex-col justify-center items-center h-full bg-neutral-50 rounded-lg p-6 gap-4">
              <FileText className="w-14 h-14 text-neutral-300" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-4 py-2 bg-neutral-900/50 hover:bg-blue-50 transition-colors"
              >
                <ExternalLink size={14} /> Open Document
              </a>
            </div>
          );
      }
    }

    // Fallback for mock/unknown
    const IconMap: Record<string, React.ReactNode> = {
      image: <FileImage className="w-12 h-12 text-neutral-300" />,
      video: <FileVideo className="w-12 h-12 text-neutral-300" />,
      audio: <FileAudio className="w-12 h-12 text-neutral-300" />,
    };
    return (
      <div className="flex flex-col justify-center items-center h-full bg-neutral-50 rounded-lg gap-3 p-6">
        {IconMap[evidence.type] ?? <FileText className="w-12 h-12 text-neutral-300" />}
        <p className="text-sm text-neutral-500">
          {isMockUrl ? 'Preview not available (mock/local storage).' : `Preview not available for type: ${evidence.type}`}
        </p>
        {!isMockUrl && url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline inline-flex items-center gap-1">
            Open in new tab <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  };

  const uploadedDate = fmtDate(evidence.collected_at || evidence.createdAt || evidence.uploadedAt);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-start justify-center z-[100] pt-20 pb-8 px-4 sm:px-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden my-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0 bg-surface">
          <div className="min-w-0 flex-1 mr-4">
            <h2 className="text-base font-bold text-text-primary truncate" title={evidenceTitle(evidence)}>
              {evidenceTitle(evidence)}
            </h2>
            <div className="flex flex-wrap gap-2 items-center mt-1">
              <span className="text-xs font-mono font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-0.5 rounded-lg capitalize">
                {(evidence.type || 'unknown').replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-text-secondary">Source: {evidence.source || 'Unknown'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-elevated rounded-full transition-colors text-text-secondary shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-y-auto bg-surface-elevated/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Main Preview */}
            <div className="md:col-span-2 bg-surface rounded-2xl border border-border p-3 min-h-[300px] flex items-center justify-center shadow-xs">
              {renderContent()}
            </div>

            {/* Metadata Sidebar */}
            {(() => {
              const summaryText =
                evidence.aiMetadata?.aiSummary ||
                evidence.aiMetadata?.caption ||
                evidence.aiMetadata?.florence_description ||
                evidence.ai_description ||
                evidence.originalFilename ||
                'No description available.';

              const tagsList: string[] = Array.from(new Set([
                ...(evidence.aiMetadata?.imageTags || []),
                ...(evidence.ai_tags || []),
                ...(evidence.aiMetadata?.tags || []),
              ]));

              const ocrText =
                evidence.aiMetadata?.ocrText ||
                evidence.ocrText ||
                evidence.ocr_text ||
                '';

              const speechTranscript =
                evidence.aiMetadata?.speechTranscript ||
                evidence.speechTranscript ||
                evidence.transcript ||
                '';

              const classification =
                evidence.aiMetadata?.classification ||
                evidence.classification ||
                (evidence.type === 'image' || evidence.type === 'screenshot' ? 'IMAGE' : null);

              const confidence =
                evidence.aiMetadata?.classificationConfidence ??
                evidence.classificationConfidence ??
                0.95;

              return (
                <div className="space-y-4">
                  {/* AI Analysis */}
                  <div className="bg-surface rounded-2xl border border-border p-4 shadow-xs">
                    <h3 className="text-xs font-bold text-brand-primary uppercase tracking-wider mb-2">AI Analysis</h3>
                    <p className="text-sm text-text-primary leading-relaxed">
                      {summaryText}
                    </p>
                    
                    {classification && classification !== 'Unknown' && (
                      <div className="mt-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                          📊 {classification} ({Math.round(confidence * 100)}%)
                        </span>
                      </div>
                    )}

                    {tagsList.length > 0 && (
                      <div className="mt-3">
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Tags</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {tagsList.map((tag: string) => (
                            <span key={tag} className="text-[10px] font-mono font-bold bg-surface-elevated text-text-secondary px-2 py-0.5 rounded-md border border-border">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ocrText && (
                      <div className="mt-3">
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">OCR Text</h3>
                        <div className="text-[10px] bg-surface-elevated/70 p-2.5 rounded-xl border border-border max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-text-secondary leading-relaxed">
                          {ocrText}
                        </div>
                      </div>
                    )}

                    {speechTranscript && (
                      <div className="mt-3">
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Audio Transcript</h3>
                        <div className="text-[10px] bg-surface-elevated/70 p-2.5 rounded-xl border border-border max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-text-secondary leading-relaxed">
                          {speechTranscript}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* System Metadata */}
                  <div className="bg-surface rounded-2xl border border-border p-4 shadow-xs">
                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2.5">System Metadata</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary">Status</span>
                        <span className={`font-mono font-bold ${evidence.processingStatus?.toUpperCase() === 'PROCESSED' ? 'text-semantic-success' : evidence.processingStatus?.toUpperCase() === 'FAILED' ? 'text-semantic-critical' : 'text-semantic-warning'}`}>
                          {evidence.processingStatus
                            ? evidence.processingStatus.charAt(0).toUpperCase() + evidence.processingStatus.slice(1).toLowerCase()
                            : 'Pending'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary">Uploaded</span>
                        <span className="text-text-primary font-mono">{uploadedDate}</span>
                      </div>
                      {url && !isMockUrl && (
                        <div className="flex justify-between items-center pt-1 border-t border-border">
                          <span className="text-text-secondary">File</span>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline inline-flex items-center gap-1 text-xs font-bold">
                            Open <ExternalLink size={11} />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chain of Custody (physical only) */}
                  {evidence.is_physical && (
                    <div className="bg-surface rounded-2xl border border-brand-primary/30 p-4 shadow-xs">
                      <h3 className="text-xs font-bold text-brand-primary uppercase tracking-wider mb-3">Chain of Custody</h3>
                      <div className="relative border-l-2 border-brand-primary/30 ml-2 space-y-4">
                        {evidence.custody_chain?.map((transfer: any, idx: number) => (
                          <div key={idx} className="relative pl-4">
                            <div className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${idx === evidence.custody_chain.length - 1 ? 'bg-brand-primary ring-4 ring-brand-primary/20' : 'bg-text-secondary/40'}`} />
                            <div className="text-[10px] text-text-secondary font-mono mb-0.5">{fmtDate(transfer.timestamp)}</div>
                            <div className="text-xs font-bold text-text-primary">{transfer.from_entity} &rarr; {transfer.to_entity}</div>
                            <div className="text-[10px] text-brand-primary font-bold capitalize mt-0.5">{transfer.status?.replace(/_/g, ' ')}</div>
                            {transfer.notes && <div className="text-[10px] text-text-secondary mt-1">{transfer.notes}</div>}
                          </div>
                        ))}
                        {(!evidence.custody_chain || evidence.custody_chain.length === 0) && (
                          <div className="pl-4 text-xs text-text-secondary">No transfer history.</div>
                        )}
                      </div>

                      {evidence.current_location && (
                        <div className="mt-4 pt-3 border-t border-border text-xs flex justify-between items-center">
                          <span className="text-text-secondary">Current Location: </span>
                          <span className="font-mono font-bold text-brand-primary uppercase bg-brand-primary/10 border border-brand-primary/20 px-2 py-0.5 rounded-lg">{evidence.current_location}</span>
                        </div>
                      )}

                      {evidence.custody_chain?.length > 0 &&
                        ['in_transit', 'dispatched'].includes(evidence.custody_chain[evidence.custody_chain.length - 1].status) && (
                          <div className="mt-4">
                            <button
                              onClick={async () => {
                                try {
                                  const lastTransfer = evidence.custody_chain[evidence.custody_chain.length - 1];
                                  const caseId = evidence.case_id;
                                  const evId = evidence.evidence_id || evidence._id;
                                  if (!caseId) { alert('Missing caseId on evidence'); return; }
                                  await apiClient.post(`/cases/${caseId}/evidence/${evId}/transfer`, {
                                    from_entity: lastTransfer.from_entity,
                                    to_entity: lastTransfer.to_entity,
                                    status: 'received',
                                    notes: 'Receipt confirmed by destination',
                                  });
                                  alert('Receipt confirmed! Please refresh.');
                                  onClose();
                                } catch (e: any) {
                                  alert(`Failed: ${e.message}`);
                                }
                              }}
                              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all shadow-xs"
                            >
                              Confirm Receipt
                            </button>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

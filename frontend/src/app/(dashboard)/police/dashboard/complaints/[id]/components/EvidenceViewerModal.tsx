'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !evidence || !mounted) return null;

  // Resolve the actual URL — check all common url field properties
  const rawUrl: string =
    evidence.secureUrl ||
    evidence.file_url ||
    evidence.fileUrl ||
    evidence.url ||
    evidence.storage_ref ||
    '';

  let url = rawUrl;
  if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
    url = `http://localhost:5001/${url.replace(/^\/+/, '')}`;
  }

  const isMockUrl = !rawUrl;

  const renderContent = () => {
    if (!isMockUrl && url) {
      const lowerUrl = url.toLowerCase();
      const isPdf = evidence.type === 'pdf' || evidence.type === 'document' || lowerUrl.endsWith('.pdf') || lowerUrl.includes('/pdf/');

      if (isPdf) {
        return (
          <div className="flex flex-col w-full h-[420px] bg-surface rounded-xl overflow-hidden border border-border">
            <iframe
              src={url}
              title={evidenceTitle(evidence)}
              className="w-full h-full border-0 rounded-xl"
            />
          </div>
        );
      }
      const isImage =
        evidence.type === 'image' ||
        evidence.type === 'screenshot' ||
        evidence.type === 'chat_screenshot' ||
        /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(lowerUrl) ||
        /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(evidence.originalFilename || '');

      if (isImage) {
        return (
          <div className="flex justify-center items-center h-full bg-surface-elevated/40 rounded-xl overflow-hidden p-2 border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={evidenceTitle(evidence)}
              className="max-w-full max-h-[380px] object-contain rounded-lg shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden text-center p-6 space-y-2">
              <FileImage className="w-12 h-12 text-text-muted mx-auto" />
              <p className="text-xs text-text-secondary">Image preview unavailable.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand-primary underline inline-flex items-center gap-1">
                Open image <ExternalLink size={12} />
              </a>
            </div>
          </div>
        );
      }

      switch (evidence.type) {
        case 'video':
        case 'screen_recording':
          return (
            <div className="flex justify-center items-center h-full bg-surface-elevated/40 rounded-xl overflow-hidden border border-border">
              <video controls className="max-w-full max-h-[380px]">
                <source src={url} />
              </video>
            </div>
          );

        case 'audio':
          return (
            <div className="flex justify-center items-center h-full bg-surface-elevated/40 rounded-xl p-8 border border-border">
              <div className="text-center w-full max-w-sm space-y-4">
                <FileAudio className="w-16 h-16 text-brand-primary mx-auto" />
                <audio controls className="w-full">
                  <source src={url} />
                </audio>
              </div>
            </div>
          );

        default:
          return (
            <div className="flex flex-col justify-center items-center h-full bg-surface-elevated/40 rounded-xl p-6 gap-3 border border-border">
              <FileText className="w-14 h-14 text-brand-primary" />
              <p className="text-xs font-bold text-text-primary">{evidenceTitle(evidence)}</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-bold text-brand-primary border border-brand-primary/30 rounded-xl px-4 py-2 bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors"
              >
                <ExternalLink size={13} /> Open File in New Tab
              </a>
            </div>
          );
      }
    }

    // Fallback for mock/local seed files without live URL
    const IconMap: Record<string, React.ReactNode> = {
      image: <FileImage className="w-12 h-12 text-brand-primary" />,
      video: <FileVideo className="w-12 h-12 text-brand-primary" />,
      audio: <FileAudio className="w-12 h-12 text-brand-primary" />,
    };
    return (
      <div className="flex flex-col justify-center items-center h-full bg-surface-elevated/40 rounded-xl gap-3 p-6 text-center border border-border">
        {IconMap[evidence.type] ?? <FileText className="w-12 h-12 text-brand-primary" />}
        <div className="space-y-1 max-w-xs">
          <p className="text-xs font-bold text-text-primary">
            {isMockUrl ? 'Local Demo Asset' : 'Preview Unavailable'}
          </p>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {isMockUrl
              ? 'This is a sample case document stored in local demo seeds. The AI pipeline has extracted all facts, OCR text, and summaries below.'
              : `Preview not supported for file type: ${evidence.type}`}
          </p>
        </div>
      </div>
    );
  };

  const uploadedDate = fmtDate(evidence.collected_at || evidence.createdAt || evidence.uploadedAt);

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-start justify-center z-[9999] pt-20 pb-8 px-4 sm:px-6 overflow-y-auto" onClick={onClose}>
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
                          {classification} ({Math.round(confidence * 100)}%)
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
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

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
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-4 py-2 bg-white hover:bg-blue-50 transition-colors"
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-neutral-100 shrink-0">
          <div className="min-w-0 flex-1 mr-4">
            <h2 className="text-base font-bold text-neutral-900 truncate" title={evidenceTitle(evidence)}>
              {evidenceTitle(evidence)}
            </h2>
            <div className="flex flex-wrap gap-2 items-center mt-1">
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded capitalize">
                {(evidence.type || 'unknown').replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-neutral-500">Source: {evidence.source || 'Unknown'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto bg-neutral-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Main Preview */}
            <div className="md:col-span-2 bg-white rounded-xl border border-neutral-200 p-2 min-h-[300px] flex items-center justify-center">
              {renderContent()}
            </div>

            {/* Metadata Sidebar */}
            <div className="space-y-4">
              {/* AI Analysis */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">AI Analysis</h3>
                <p className="text-sm text-neutral-800 leading-relaxed">
                  {evidence.ai_description || evidence.originalFilename || 'No description available.'}
                </p>
                {evidence.ai_tags && evidence.ai_tags.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Tags</h3>
                    <div className="flex flex-wrap gap-1">
                      {evidence.ai_tags.map((tag: string) => (
                        <span key={tag} className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-1 rounded border border-neutral-200 font-medium">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* System Metadata */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">System Metadata</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Status</span>
                    <span className={`font-semibold ${evidence.status === 'verified' ? 'text-green-600' : evidence.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {evidence.status
                        ? evidence.status.charAt(0).toUpperCase() + evidence.status.slice(1)
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Uploaded</span>
                    <span className="text-neutral-900">{uploadedDate}</span>
                  </div>
                  {url && !isMockUrl && (
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-500">File</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 text-[10px]">
                        Open <ExternalLink size={9} />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Chain of Custody (physical only) */}
              {evidence.is_physical && (
                <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-sm">
                  <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3">Chain of Custody</h3>
                  <div className="relative border-l-2 border-indigo-100 ml-2 space-y-4">
                    {evidence.custody_chain?.map((transfer: any, idx: number) => (
                      <div key={idx} className="relative pl-4">
                        <div className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${idx === evidence.custody_chain.length - 1 ? 'bg-indigo-600 ring-4 ring-indigo-50' : 'bg-neutral-300'}`} />
                        <div className="text-[10px] text-neutral-400 mb-0.5">{fmtDate(transfer.timestamp)}</div>
                        <div className="text-xs font-semibold text-neutral-900">{transfer.from_entity} ➔ {transfer.to_entity}</div>
                        <div className="text-[10px] text-indigo-600 font-medium capitalize mt-0.5">{transfer.status?.replace(/_/g, ' ')}</div>
                        {transfer.notes && <div className="text-[10px] text-neutral-500 mt-1">{transfer.notes}</div>}
                      </div>
                    ))}
                    {(!evidence.custody_chain || evidence.custody_chain.length === 0) && (
                      <div className="pl-4 text-xs text-neutral-500">No transfer history.</div>
                    )}
                  </div>

                  {evidence.current_location && (
                    <div className="mt-4 pt-3 border-t border-indigo-50 text-xs">
                      <span className="text-neutral-500">Current Location: </span>
                      <span className="font-bold text-indigo-700 uppercase">{evidence.current_location}</span>
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
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
                        >
                          Confirm Receipt
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

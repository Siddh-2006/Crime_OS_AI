'use client';

import React from 'react';
import { X, FileText, FileAudio, FileVideo, FileImage } from 'lucide-react';
import apiClient from '@/lib/axios';

interface EvidenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: any;
}

export default function EvidenceViewerModal({ isOpen, onClose, evidence }: EvidenceViewerModalProps) {
  if (!isOpen || !evidence) return null;

  // Derive the URL to render
  // For now, we mock the URLs based on storage_ref or evidence_id
  const url = evidence.storage_ref?.startsWith('mock://') || evidence.storage_ref?.startsWith('seed/') 
    ? `/api/v1/storage/${evidence.storage_ref}` // Or wherever files are served
    : evidence.storage_ref;

  const renderContent = () => {
    switch (evidence.type) {
      case 'image':
      case 'screenshot':
      case 'chat_screenshot':
        return (
          <div className="flex justify-center items-center h-full bg-black/5 rounded-lg overflow-hidden">
            {/* Using a placeholder since we don't have real files */}
            <div className="text-center p-10">
              <FileImage className="w-16 h-16 text-neutral-400 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">Image Preview</p>
              <p className="text-xs text-neutral-400 mt-2">[{evidence.storage_ref}]</p>
            </div>
          </div>
        );
      case 'video':
      case 'screen_recording':
        return (
          <div className="flex justify-center items-center h-full bg-black/5 rounded-lg overflow-hidden">
             <div className="text-center p-10">
              <FileVideo className="w-16 h-16 text-neutral-400 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">Video Preview</p>
              <p className="text-xs text-neutral-400 mt-2">[{evidence.storage_ref}]</p>
            </div>
          </div>
        );
      case 'audio':
        return (
          <div className="flex justify-center items-center h-full bg-black/5 rounded-lg overflow-hidden p-8">
             <div className="text-center w-full max-w-sm">
              <FileAudio className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
              <audio controls className="w-full">
                <source src={url} />
                Your browser does not support the audio element.
              </audio>
              <p className="text-xs text-neutral-400 mt-4">[{evidence.storage_ref}]</p>
            </div>
          </div>
        );
      case 'document':
      case 'bank_statement':
      case 'pdf':
        return (
          <div className="flex justify-center items-center h-full bg-black/5 rounded-lg overflow-hidden">
             <div className="text-center p-10">
              <FileText className="w-16 h-16 text-neutral-400 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">Document Preview</p>
              <p className="text-xs text-neutral-400 mt-2">[{evidence.storage_ref}]</p>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex justify-center items-center h-full bg-black/5 rounded-lg">
            <p className="text-sm text-neutral-500">Preview not available for {evidence.type}</p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-neutral-100">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{evidence.title || evidence.evidence_id}</h2>
            <div className="flex gap-2 items-center mt-1">
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded capitalize">
                {evidence.type?.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-neutral-500">Source: {evidence.source || 'Unknown'}</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto bg-neutral-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            
            {/* Main Preview Area */}
            <div className="md:col-span-2 bg-white rounded-xl border border-neutral-200 p-2 min-h-[400px]">
              {renderContent()}
            </div>

            {/* Metadata Sidebar */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">AI Analysis</h3>
                <p className="text-sm text-neutral-800 leading-relaxed">
                  {evidence.ai_description || "No description available."}
                </p>
                
                {evidence.ai_tags && evidence.ai_tags.length > 0 && (
                  <div className="mt-4">
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

              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">System Metadata</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Status</span>
                    <span className={`font-semibold ${evidence.status === 'verified' ? 'text-green-600' : 'text-yellow-600'}`}>
                      {evidence.status === 'verified' ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Uploaded</span>
                    <span className="text-neutral-900">{new Date(evidence.collected_at || evidence.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Storage Ref</span>
                    <span className="text-neutral-900 font-mono text-[10px] truncate max-w-[120px]">{evidence.storage_ref || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {evidence.is_physical && (
                <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-sm">
                  <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3">Chain of Custody</h3>
                  
                  <div className="relative border-l-2 border-indigo-100 ml-2 space-y-4">
                    {evidence.custody_chain?.map((transfer: any, idx: number) => (
                      <div key={idx} className="relative pl-4">
                        <div className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${idx === evidence.custody_chain.length - 1 ? 'bg-indigo-600 ring-4 ring-indigo-50' : 'bg-neutral-300'}`} />
                        <div className="text-[10px] text-neutral-400 mb-0.5">{new Date(transfer.timestamp).toLocaleString('en-IN')}</div>
                        <div className="text-xs font-semibold text-neutral-900">
                          {transfer.from_entity} ➔ {transfer.to_entity}
                        </div>
                        <div className="text-[10px] text-indigo-600 font-medium capitalize mt-0.5">
                          {transfer.status.replace(/_/g, ' ')}
                        </div>
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

                  {/* Confirm Receipt Button */}
                  {evidence.custody_chain?.length > 0 && 
                    ['in_transit', 'dispatched'].includes(evidence.custody_chain[evidence.custody_chain.length - 1].status) && (
                      <div className="mt-4">
                        <button
                          onClick={async () => {
                            try {
                              const lastTransfer = evidence.custody_chain[evidence.custody_chain.length - 1];
                              const caseId = evidence.case_id;
                              const evId = evidence.evidence_id || evidence._id;
                              
                              if (!caseId) {
                                alert('Missing caseId on evidence');
                                return;
                              }

                              await apiClient.post(`/cases/${caseId}/evidence/${evId}/transfer`, {
                                from_entity: lastTransfer.from_entity,
                                to_entity: lastTransfer.to_entity,
                                status: 'received',
                                notes: 'Receipt confirmed by destination'
                              });
                              alert('Receipt confirmed! Please refresh the page to see changes.');
                              onClose();
                            } catch (e: any) {
                              alert(`Failed to confirm receipt: ${e.message}`);
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

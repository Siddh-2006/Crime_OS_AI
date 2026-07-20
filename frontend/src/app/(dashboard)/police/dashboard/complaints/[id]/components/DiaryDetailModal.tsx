import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Activity, Send, MessageSquare, FileText, User } from 'lucide-react';

interface DiaryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: any; // DiaryEntry
}

export function DiaryDetailModal({ isOpen, onClose, entry }: DiaryDetailModalProps) {
  if (!entry) return null;

  const renderPayload = () => {
    switch (entry.event_type) {
      case 'analysis_run':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-800">Narrative Summary</h3>
            <div className="bg-neutral-50 p-4 rounded border border-neutral-200 text-sm whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
              {entry.payload?.narrative_summary || 'No summary available.'}
            </div>
            
            {entry.payload?.ranked_next_steps && entry.payload.ranked_next_steps.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-neutral-800 mt-4">Dynamic Checklist Steps Generated/Updated</h3>
                <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {entry.payload.ranked_next_steps.map((step: any, idx: number) => (
                    <li key={idx} className="bg-blue-50 p-3 rounded border border-blue-100 text-sm">
                      <strong>[{step.step_id}]</strong> {step.reason || step.title}
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {step.target && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Target: {step.target}</span>}
                        {step.department_entity_id && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Dept: {step.department_entity_id}</span>}
                        {step.confidence && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Confidence: {(step.confidence * 100).toFixed(0)}%</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        );

      case 'request_sent':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-800">
              {entry.payload?.department_entity_id ? `Draft to ${entry.payload.department_entity_id}` : `Draft to ${entry.payload.recipient}`}
            </h3>
            <div className="bg-neutral-50 p-4 rounded border border-neutral-200 text-sm whitespace-pre-wrap font-mono h-[300px] overflow-y-auto">
              {entry.payload?.content || 'No content available.'}
            </div>
          </div>
        );

      case 'response_received':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-800">Response Data</h3>
            <div className="bg-neutral-50 p-4 rounded border border-neutral-200 text-sm whitespace-pre-wrap font-mono h-[300px] overflow-y-auto">
              {entry.payload?.content || 'No content available.'}
            </div>
            {entry.payload?.attachments && entry.payload.attachments.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold">Attachments</h4>
                <ul className="list-disc pl-5 mt-1 text-xs">
                  {entry.payload.attachments.map((url: string, i: number) => (
                    <li key={i}><a href={url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{url}</a></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 'complaint_filed':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-800">Initial Complaint Data</h3>
            <div className="bg-neutral-50 p-4 rounded border border-neutral-200 text-sm font-mono overflow-auto max-h-[400px]">
              <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-800">Raw Payload</h3>
            <div className="bg-neutral-50 p-4 rounded border border-neutral-200 text-sm font-mono overflow-auto max-h-[400px]">
              <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
            </div>
          </div>
        );
    }
  };

  const getEventTitle = () => {
    switch (entry.event_type) {
      case 'analysis_run': return 'AI Analysis Snapshot Details';
      case 'request_sent': return 'Department Request Details';
      case 'response_received': return 'Department Response Details';
      case 'complaint_filed': return 'Complaint Details';
      default: return entry.event_type.replace(/_/g, ' ').toUpperCase() + ' Details';
    }
  };

  const getIcon = () => {
    switch (entry.event_type) {
      case 'analysis_run': return <Activity size={20} className="text-blue-600" />;
      case 'request_sent': return <Send size={20} className="text-indigo-600" />;
      case 'response_received': return <MessageSquare size={20} className="text-teal-600" />;
      case 'complaint_filed': return <FileText size={20} className="text-blue-600" />;
      default: return <User size={20} className="text-neutral-500" />;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={<div className="flex items-center gap-2">{getIcon()}{getEventTitle()}</div>}>
      <div className="p-4 border-b border-neutral-100 flex justify-between text-xs text-neutral-500">
        <span><strong>Actor:</strong> {entry.actor?.type || 'System'} ({entry.actor?.id || '-'})</span>
        <span><strong>Time:</strong> {new Date(entry.timestamp).toLocaleString('en-IN')}</span>
      </div>
      <div className="p-6">
        {renderPayload()}
      </div>
    </Modal>
  );
}

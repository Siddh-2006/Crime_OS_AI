'use client';

import React from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { FileText, ShieldCheck, User, Activity, AlertTriangle, Send, Upload, Edit3, MessageSquare } from 'lucide-react';

interface DiaryEntry {
  _id: string;
  entry_id: string;
  timestamp: string;
  actor: { type: string; id: string };
  event_type: string;
  payload: any;
  ref_ids?: {
    evidence_id?: string;
    request_id?: string;
    step_id?: string;
    snapshot_id?: string;
    thread_id?: string;
  };
}

interface CaseDiaryFeedProps {
  entries: DiaryEntry[];
  onEntryClick?: (entry: DiaryEntry) => void;
}

export function CaseDiaryFeed({ entries, onEntryClick }: CaseDiaryFeedProps) {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'complaint_filed': return <FileText className="text-blue-500" size={16} />;
      case 'evidence_added': return <Upload className="text-purple-500" size={16} />;
      case 'checklist_step_completed': return <ShieldCheck className="text-green-500" size={16} />;
      case 'request_drafted': return <Edit3 className="text-yellow-600" size={16} />;
      case 'request_sent': return <Send className="text-indigo-500" size={16} />;
      case 'response_received': return <MessageSquare className="text-teal-500" size={16} />;
      case 'analysis_run': return <Activity className="text-blue-600" size={16} />;
      case 'diary_draft_generated': return <FileText className="text-indigo-500" size={16} />;
      case 'diary_finalized': return <ShieldCheck className="text-emerald-600" size={16} />;
      case 'witness_added': return <User className="text-orange-500" size={16} />;
      case 'escalation_raised': return <AlertTriangle className="text-red-500" size={16} />;
      case 'override_correction': return <User className="text-orange-500" size={16} />;
      default: return <Activity className="text-neutral-500" size={16} />;
    }
  };

  const getEventTitle = (entry: DiaryEntry) => {
    switch (entry.event_type) {
      case 'complaint_filed': return 'Complaint Registered';
      case 'evidence_added': return 'Evidence Attached';
      case 'checklist_step_completed': return 'Checklist Step Completed';
      case 'request_drafted': return 'Department Request Drafted';
      case 'request_sent': return 'Department Request Sent';
      case 'response_received': return 'Department Response Received';
      case 'analysis_run': return entry.payload?.manual ? 'Manual Analysis Snapshot Created' : 'AI Analysis Snapshot Generated';
      case 'diary_draft_generated': return 'Official Daily Diary Draft Generated';
      case 'diary_finalized': return 'Official Daily Diary Finalized';
      case 'witness_added': return 'Witness Added to Case';
      case 'escalation_raised': return 'Case Escalation Raised';
      case 'override_correction': return 'Officer AI Correction Override';
      default: return entry.event_type.replace(/_/g, ' ').toUpperCase();
    }
  };

  const getEventDescription = (entry: DiaryEntry) => {
    if (entry.event_type === 'override_correction') {
      return `Officer corrected AI: "${entry.payload?.correction_message}"`;
    }
    if (entry.event_type === 'escalation_raised') {
      return `Escalation Reason: ${entry.payload?.reason}`;
    }
    if (entry.event_type === 'checklist_step_completed') {
      return `Step ID: ${entry.payload?.step_id}`;
    }
    if (entry.event_type === 'request_sent') {
      return `Sent to: ${entry.payload?.department_entity_id}`;
    }
    if (entry.event_type === 'evidence_added') {
      return `File: ${entry.payload?.filename}`;
    }
    if (entry.event_type === 'diary_draft_generated' || entry.event_type === 'diary_finalized') {
      return entry.payload?.summary || entry.payload?.title || '';
    }
    return '';
  };

  return (
    <Card className="h-full max-h-[800px] flex flex-col border-neutral-800 bg-surface">
      <CardHeader title="Case Diary" className="border-b border-neutral-800" />
      <div className="flex-1 overflow-y-auto p-4 bg-surface">
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-400 italic text-center py-8">No diary events recorded yet.</p>
        ) : (
          <div className="relative pl-6 border-l-2 border-neutral-700 space-y-6 pb-4">
            {entries.map((entry) => (
              <div key={entry.entry_id} className="relative">
                <span className="absolute -left-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 border border-neutral-700 shadow-sm">
                  {getEventIcon(entry.event_type)}
                </span>
                <div 
                  className={`bg-neutral-900/50 p-3 rounded-lg border border-neutral-700 shadow-sm transition-colors ${onEntryClick ? 'cursor-pointer hover:border-blue-500/50 hover:bg-neutral-800' : ''}`}
                  onClick={() => onEntryClick && onEntryClick(entry)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs font-bold text-text-primary">{getEventTitle(entry)}</p>
                    <p className="text-[10px] text-neutral-400 font-medium whitespace-nowrap ml-2">
                      {new Date(entry.timestamp).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                    <span className="font-semibold capitalize text-text-secondary">{entry.actor.type}</span> 
                    <span className="text-neutral-500">({entry.actor.id})</span>
                  </p>
                  {getEventDescription(entry) && (
                    <div className={`mt-2 p-2 bg-neutral-900 border border-neutral-800 rounded text-xs text-text-secondary italic ${onEntryClick ? 'group-hover:bg-neutral-800' : ''}`}>
                      {getEventDescription(entry)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

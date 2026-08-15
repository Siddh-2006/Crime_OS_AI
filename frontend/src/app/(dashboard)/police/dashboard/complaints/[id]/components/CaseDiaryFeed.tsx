'use client';

import React from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { FileText, ShieldCheck, User, Activity, AlertTriangle, Send, Upload, Edit3, MessageSquare, Shield, Lock, CheckCircle2, XCircle, Clock, MapPin } from 'lucide-react';

interface DiaryEntry {
  _id: string;
  entry_id: string;
  timestamp: string;
  actor: { type: string; id: string; name?: string };
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

export function CaseDiaryFeed({ entries = [], onEntryClick }: CaseDiaryFeedProps) {
  const safeEntries = Array.isArray(entries) ? entries : [];

  const getEventIcon = (eventType?: string) => {
    switch (eventType) {
      case 'complaint_filed': return <FileText className="text-brand-primary" size={14} />;
      case 'evidence_added': return <Upload className="text-purple-500" size={14} />;
      case 'evidence_updated': return <Edit3 className="text-purple-400" size={14} />;
      case 'evidence_deleted': return <XCircle className="text-semantic-critical" size={14} />;
      case 'checklist_step_completed': return <ShieldCheck className="text-semantic-success" size={14} />;
      case 'checklist_step_updated': return <ShieldCheck className="text-amber-500" size={14} />;
      case 'request_drafted': return <Edit3 className="text-amber-500" size={14} />;
      case 'request_sent': return <Send className="text-indigo-500" size={14} />;
      case 'response_received': return <MessageSquare className="text-teal-500" size={14} />;
      case 'analysis_run': return <Activity className="text-brand-primary" size={14} />;
      case 'diary_draft_generated': return <FileText className="text-indigo-500" size={14} />;
      case 'diary_finalized': return <ShieldCheck className="text-semantic-success" size={14} />;
      case 'witness_added': return <User className="text-amber-500" size={14} />;
      case 'place_visited_added': return <MapPin className="text-brand-primary" size={14} />;
      case 'place_visited_updated': return <MapPin className="text-amber-500" size={14} />;
      case 'place_visited_deleted': return <XCircle className="text-semantic-critical" size={14} />;
      case 'participant_statement_added': return <User className="text-indigo-500" size={14} />;
      case 'participant_statement_updated': return <Edit3 className="text-indigo-400" size={14} />;
      case 'participant_statement_deleted': return <XCircle className="text-semantic-critical" size={14} />;
      case 'io_assigned': return <User className="text-emerald-500" size={14} />;
      case 'escalation_raised': return <AlertTriangle className="text-semantic-critical" size={14} />;
      case 'override_correction': return <User className="text-amber-500" size={14} />;
      // Custody & Arrest Warrant
      case 'warrant_drafted': return <Shield className="text-brand-primary" size={14} />;
      case 'warrant_sent_to_magistrate': return <Send className="text-indigo-500" size={14} />;
      case 'warrant_approved': return <CheckCircle2 className="text-semantic-success" size={14} />;
      case 'warrant_rejected': return <XCircle className="text-semantic-critical" size={14} />;
      case 'suspect_taken_into_custody': return <Lock className="text-semantic-warning" size={14} />;
      case 'custody_deadline_reached': return <Clock className="text-semantic-critical" size={14} />;
      case 'accused_produced_before_court': return <ShieldCheck className="text-semantic-success" size={14} />;
      case 'suspect_released': return <CheckCircle2 className="text-text-secondary" size={14} />;
      default: return <Activity className="text-text-muted" size={14} />;
    }
  };

  const getEventTitle = (entry: DiaryEntry) => {
    if (!entry || !entry.event_type) return 'Investigation Event';
    switch (entry.event_type) {
      case 'complaint_filed': return 'Complaint Registered';
      case 'evidence_added': return 'Evidence Attached';
      case 'evidence_updated': return 'Evidence Metadata Updated';
      case 'evidence_deleted': return 'Evidence Deleted';
      case 'checklist_step_completed': return 'Checklist Step Completed';
      case 'checklist_step_updated': return 'Checklist Step Updated';
      case 'request_drafted': return 'Department Request Drafted';
      case 'request_sent': return 'Department Request Sent';
      case 'response_received': return 'Department Response Received';
      case 'analysis_run': return entry.payload?.manual ? 'Manual Analysis Snapshot Created' : 'AI Analysis Snapshot Generated';
      case 'diary_draft_generated': return 'Official Daily Diary Draft Generated';
      case 'diary_finalized': return 'Official Daily Diary Finalized';
      case 'witness_added': return 'Witness Added to Case';
      case 'place_visited_added': return `Place Visited Added: ${entry.payload?.address || ''}`;
      case 'place_visited_updated': return `Place Visited Updated: ${entry.payload?.address || ''}`;
      case 'place_visited_deleted': return 'Place Visited Record Deleted';
      case 'participant_statement_added': return `Statement Recorded — ${entry.payload?.participant_name || ''}`;
      case 'participant_statement_updated': return `Statement Updated — ${entry.payload?.participant_name || ''}`;
      case 'participant_statement_deleted': return `Statement Deleted — ${entry.payload?.participant_name || ''}`;
      case 'io_assigned': return 'IO(s) Assigned to Case';
      case 'escalation_raised': return 'Case Escalation Raised';
      case 'override_correction': return 'Officer AI Correction Override';
      // Custody & Arrest Warrant
      case 'warrant_drafted': return `Arrest Warrant Drafted — ${entry.payload?.participant_name || ''}`;
      case 'warrant_sent_to_magistrate': return `Warrant Sent to Magistrate — ${entry.payload?.participant_name || ''}`;
      case 'warrant_approved': return `Warrant Approved by Magistrate — ${entry.payload?.participant_name || ''}`;
      case 'warrant_rejected': return `Warrant Rejected by Magistrate — ${entry.payload?.participant_name || ''}`;
      case 'suspect_taken_into_custody': return `${entry.payload?.participant_name || 'Accused'} Taken into Custody`;
      case 'custody_deadline_reached': return `⚠ BNSS §57 Custody Deadline Reached — ${entry.payload?.participant_name || ''}`;
      case 'accused_produced_before_court': return `${entry.payload?.participant_name || 'Accused'} Produced Before Court`;
      case 'suspect_released': return `${entry.payload?.participant_name || 'Accused'} Released from Custody`;
      default: return String(entry.event_type || 'Event').replace(/_/g, ' ').toUpperCase();
    }
  };

  const getEventDescription = (entry: DiaryEntry) => {
    if (!entry || !entry.event_type) return '';
    if (entry.event_type === 'io_assigned') {
      const ios = entry.payload?.assignedIOs;
      if (Array.isArray(ios)) {
        return `Assigned Officers: ${ios.map((i: any) => i.name || i.officerName || i).join(', ')}`;
      }
      return 'Investigation Officer assignment modified';
    }
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
    if (entry.event_type === 'warrant_sent_to_magistrate') {
      return entry.payload?.magistrate_email ? `Sent to: ${entry.payload.magistrate_email}` : '';
    }
    if (entry.event_type === 'warrant_rejected') {
      return entry.payload?.rejection_reason ? `Reason: ${entry.payload.rejection_reason}` : '';
    }
    if (entry.event_type === 'suspect_taken_into_custody') {
      const deadline = entry.payload?.custody_deadline
        ? new Date(entry.payload.custody_deadline).toLocaleString('en-IN')
        : null;
      return deadline ? `24h deadline: ${deadline}` : '';
    }
    return '';
  };

  const getActorName = (actor: any) => {
    if (!actor) return 'System';
    if (typeof actor === 'string') return actor;
    if (actor.name) return actor.name;
    if (actor.type === 'officer' && actor.id) return `Officer ${actor.id}`;
    return actor.type || actor.id || 'System';
  };

  const getFormattedTimestamp = (ts?: string) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('en-IN');
    } catch {
      return String(ts);
    }
  };

  return (
    <Card glass className="h-full max-h-[800px] flex flex-col border-border animate-fade-in">
      <CardHeader title="Case Diary" subtitle="Audit trail of investigation events" />
      <div className="flex-1 overflow-y-auto p-4">
        {safeEntries.length === 0 ? (
          <p className="text-sm text-text-muted italic text-center py-8">No diary events recorded yet.</p>
        ) : (
          <div className="relative pl-6 border-l-2 border-border space-y-6 pb-4 ml-2">
            {safeEntries.map((entry, idx) => (
              <div key={entry?.entry_id || entry?._id || idx} className="relative group">
                <span className="absolute -left-[31px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-border shadow-sm group-hover:scale-110 transition-transform">
                  {getEventIcon(entry?.event_type)}
                </span>
                <div 
                  className={`bg-surface-elevated/40 p-3.5 rounded-2xl border border-border/60 shadow-sm transition-all duration-200 ${onEntryClick ? 'cursor-pointer hover:border-brand-primary/40 hover:bg-surface-elevated/80' : ''}`}
                  onClick={() => onEntryClick && entry && onEntryClick(entry)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs font-bold text-text-primary">{getEventTitle(entry)}</p>
                    <p className="text-[10px] text-text-muted font-mono font-medium whitespace-nowrap ml-2">
                      {getFormattedTimestamp(entry?.timestamp)}
                    </p>
                  </div>
                  <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
                    <span className="font-semibold capitalize text-text-secondary">
                      {getActorName(entry?.actor)}
                    </span> 
                  </p>
                  {getEventDescription(entry) && (
                    <div className="mt-2 p-2.5 bg-surface border border-border rounded-xl text-xs text-text-secondary italic">
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

'use client';

import React, { useState } from 'react';
import { Send, Reply, User, Building, Paperclip, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/axios';
import EvidenceViewerModal from './EvidenceViewerModal';

interface ThreadMessage {
  sender: 'io' | 'department' | 'citizen';
  content: string;
  timestamp: string;
  attachments?: any[];
}

interface RequestThread {
  _id: string;
  request_id: string;
  request_type: 'external_department' | 'inter_station_assignment' | 'citizen_request';
  recipient_type: string;
  department_entity_id?: string;
  step_title: string;
  unread_by_io: boolean;
  messages: ThreadMessage[];
  updatedAt: string;
}

interface DepartmentInboxPanelProps {
  threads: RequestThread[];
  onRefresh: () => void;
  caseId: string;
  filter: 'all' | 'department' | 'citizen';
  onFilterChange: (value: 'all' | 'department' | 'citizen') => void;
}

export function DepartmentInboxPanel({ threads, onRefresh, caseId, filter, onFilterChange }: DepartmentInboxPanelProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [viewingEvidence, setViewingEvidence] = useState<any | null>(null);

  const filteredThreads = threads.filter((thread) => {
    if (filter === 'department') return thread.request_type !== 'citizen_request';
    if (filter === 'citizen') return thread.request_type === 'citizen_request';
    return true;
  });

  const selectedThread = filteredThreads.find(t => t._id === selectedThreadId);

  const handleReply = async () => {
    if (!selectedThread || !replyContent.trim()) return;
    setReplyLoading(true);
    try {
      await apiClient.post(`/cases/threads/${selectedThread._id}/reply`, {
        content: replyContent
      });
      setReplyContent('');
      onRefresh(); // Re-fetch threads
    } catch (err) {
      console.error('Failed to reply', err);
      alert('Failed to send reply');
    } finally {
      setReplyLoading(false);
    }
  };

  if (filteredThreads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 bg-surface border border-border rounded-2xl shadow-card glass animate-fade-in">
        <div className="p-4 rounded-2xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
          <Send className="h-8 w-8" />
        </div>
        <p className="text-base font-heading font-bold text-text-primary">No requests found</p>
        <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
          Send a request from the Checklist tab or refresh to load the latest department and citizen threads.
        </p>
      </div>
    );
  }

  return (
    <div className="flex bg-surface border border-border rounded-2xl shadow-card overflow-hidden min-h-[600px] max-h-[600px] glass animate-fade-in">
      
      {/* LEFT PANE: Inbox List */}
      <div className="w-1/3 border-r border-border bg-surface-elevated/40 flex flex-col">
        <div className="p-4 border-b border-border bg-surface/60">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-text-primary">Requests ({filteredThreads.length})</h3>
            <button onClick={onRefresh} className="text-xs font-semibold text-brand-primary hover:underline">Refresh</button>
          </div>
          <div className="flex gap-1.5">
            {(['all', 'department', 'citizen'] as const).map((option) => (
              <button
                key={option}
                onClick={() => onFilterChange(option)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-200 ${
                  filter === option 
                    ? 'bg-brand-primary text-white shadow-sm' 
                    : 'bg-surface text-text-secondary hover:text-text-primary border border-border'
                }`}
              >
                {option === 'all' ? 'All' : option === 'department' ? 'Department' : 'Citizen'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {filteredThreads.map(thread => {
            const lastMsg = thread.messages[thread.messages.length - 1];
            const isSelected = selectedThreadId === thread._id;
            return (
              <div 
                key={thread._id} 
                onClick={() => setSelectedThreadId(thread._id)}
                className={`relative p-4 cursor-pointer transition-all duration-150 ${
                  isSelected 
                    ? 'bg-brand-primary/10 border-l-4 border-l-brand-primary' 
                    : 'hover:bg-surface-elevated/60 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm ${thread.unread_by_io ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}>
                      {thread.request_type === 'citizen_request' ? 'Citizen Request' : thread.department_entity_id || 'Department Request'}
                    </h4>
                    {thread.request_type === 'citizen_request' && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2 py-0.5 rounded-full">
                        Citizen
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted whitespace-nowrap ml-2 font-mono">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className={`text-xs ${thread.unread_by_io ? 'font-semibold text-brand-primary' : 'font-medium text-text-secondary'} mb-1 truncate`}>
                  {thread.step_title}
                </p>
                <p className="text-xs text-text-muted line-clamp-2">
                  {lastMsg?.sender === 'io' ? 'You: ' : ''}{lastMsg?.content}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANE: Conversation Thread */}
      <div className="w-2/3 flex flex-col bg-surface">
        {selectedThread ? (
          <>
            <div className="p-4 border-b border-border bg-surface-elevated/30">
              <h2 className="text-base font-heading font-bold text-text-primary">{selectedThread.step_title}</h2>
              <p className="text-xs text-text-secondary mt-0.5">Conversation with {selectedThread.department_entity_id || 'Recipient'}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/50">
              {selectedThread.messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 max-w-[85%] ${msg.sender === 'io' ? 'ml-auto flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                    msg.sender === 'io' ? 'bg-brand-primary/10 text-brand-primary' : 'bg-surface-elevated text-text-secondary'
                  }`}>
                    {msg.sender === 'io' ? <User size={16} /> : <Building size={16} />}
                  </div>
                  <div className={`space-y-1 ${msg.sender === 'io' ? 'items-end' : ''}`}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-semibold text-text-primary">
                        {msg.sender === 'io' ? 'You (IO)' : selectedThread.department_entity_id}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className={`p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.sender === 'io' 
                        ? 'bg-brand-primary text-white rounded-tr-none shadow-sm' 
                        : 'bg-surface border border-border text-text-primary rounded-tl-none shadow-sm'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`flex gap-2 mt-2 flex-wrap ${msg.sender === 'io' ? 'justify-end' : ''}`}>
                        {msg.attachments.map((att: any) => {
                          const isObj = typeof att === 'object' && att !== null;
                          const filename = isObj ? (att.originalFilename || att.evidence_id) : att;
                          const url = isObj ? (att.storage_ref || att.secureUrl) : null;
                          const isValidUrl = url && url.startsWith('http');
                          return (
                            <div 
                              key={isObj ? att.evidence_id : att} 
                              className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 bg-surface border border-border rounded-full text-text-secondary shadow-sm ${isValidUrl ? 'cursor-pointer hover:border-brand-primary hover:text-brand-primary transition-all duration-150' : ''}`}
                              onClick={() => {
                                if (isValidUrl) {
                                  if (isObj) setViewingEvidence(att);
                                  else window.open(url, '_blank');
                                }
                              }}
                              title={isValidUrl ? 'Click to view attachment' : 'Attachment processing...'}
                            >
                              <Paperclip size={12} />
                              <span className="truncate max-w-[200px]">{filename}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border bg-surface-elevated/30">
              <div className="flex flex-col gap-3">
                <textarea 
                  className="w-full bg-input-bg border border-input-border rounded-xl p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-brand-primary transition-all duration-200 resize-none"
                  placeholder="Type a follow-up message..."
                  rows={3}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button 
                    size="sm" 
                    onClick={handleReply} 
                    disabled={!replyContent.trim() || replyLoading}
                    className="flex items-center gap-2 font-bold"
                  >
                    <Reply size={14} />
                    {replyLoading ? 'Sending...' : 'Send Reply'}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
            <Send className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Select a thread to view the conversation</p>
          </div>
        )}
      </div>

      <EvidenceViewerModal 
        isOpen={!!viewingEvidence} 
        onClose={() => setViewingEvidence(null)} 
        evidence={viewingEvidence} 
      />
    </div>
  );
}

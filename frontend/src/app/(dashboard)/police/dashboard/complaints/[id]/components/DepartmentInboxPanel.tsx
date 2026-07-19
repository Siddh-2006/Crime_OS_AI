'use client';

import React, { useState } from 'react';
import { Send, Reply, User, Building, Paperclip, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/axios';

interface ThreadMessage {
  sender: 'io' | 'department';
  content: string;
  timestamp: string;
  attachments?: string[];
}

interface RequestThread {
  _id: string;
  request_id: string;
  department_entity_id: string;
  step_title: string;
  unread_by_io: boolean;
  messages: ThreadMessage[];
  updatedAt: string;
}

export function DepartmentInboxPanel({ threads, onRefresh, caseId }: { threads: RequestThread[]; onRefresh: () => void; caseId: string }) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  const selectedThread = threads.find(t => t._id === selectedThreadId);

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

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 bg-white border border-neutral-200 rounded-xl shadow-sm">
        <Send className="h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-neutral-600">No department requests yet</p>
        <p className="text-xs text-neutral-400 max-w-xs">
          Run AI analysis to get suggested steps, then send department requests from the Checklist tab.
        </p>
      </div>
    );
  }

  return (
    <div className="flex bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden min-h-[600px] max-h-[600px]">
      
      {/* LEFT PANE: Inbox List */}
      <div className="w-1/3 border-r border-neutral-200 bg-neutral-50/30 flex flex-col">
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center bg-white">
          <h3 className="text-sm font-bold text-neutral-800">Inbox ({threads.length})</h3>
          <button onClick={onRefresh} className="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map(thread => {
            const lastMsg = thread.messages[thread.messages.length - 1];
            const isSelected = selectedThreadId === thread._id;
            return (
              <div 
                key={thread._id} 
                onClick={() => setSelectedThreadId(thread._id)}
                className={`p-4 border-b border-neutral-100 cursor-pointer transition-colors hover:bg-blue-50 ${
                  isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className={`text-sm ${thread.unread_by_io ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>
                    {thread.department_entity_id}
                  </h4>
                  <span className="text-[10px] text-neutral-400 whitespace-nowrap ml-2">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className={`text-xs ${thread.unread_by_io ? 'font-semibold text-blue-700' : 'font-medium text-neutral-600'} mb-1 truncate`}>
                  {thread.step_title}
                </p>
                <p className="text-xs text-neutral-500 line-clamp-2">
                  {lastMsg?.sender === 'io' ? 'You: ' : ''}{lastMsg?.content}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANE: Conversation Thread */}
      <div className="w-2/3 flex flex-col bg-white">
        {selectedThread ? (
          <>
            <div className="p-4 border-b border-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900">{selectedThread.step_title}</h2>
              <p className="text-sm text-neutral-500">Conversation with {selectedThread.department_entity_id}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-neutral-50">
              {selectedThread.messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 max-w-[85%] ${msg.sender === 'io' ? 'ml-auto flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.sender === 'io' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-700'
                  }`}>
                    {msg.sender === 'io' ? <User size={16} /> : <Building size={16} />}
                  </div>
                  <div className={`space-y-1 ${msg.sender === 'io' ? 'items-end' : ''}`}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-bold text-neutral-700">
                        {msg.sender === 'io' ? 'You (IO)' : selectedThread.department_entity_id}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className={`p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.sender === 'io' 
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-sm' 
                        : 'bg-white border border-neutral-200 text-neutral-800 rounded-tl-none shadow-sm'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`flex gap-2 mt-2 flex-wrap ${msg.sender === 'io' ? 'justify-end' : ''}`}>
                        {msg.attachments.map(att => (
                          <div key={att} className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 bg-white border border-neutral-200 rounded-full text-neutral-600 shadow-sm">
                            <Paperclip size={10} />
                            {att}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-neutral-200 bg-white">
              <div className="flex flex-col gap-2">
                <textarea 
                  className="w-full border border-neutral-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                    className="flex items-center gap-2"
                  >
                    <Reply size={14} />
                    {replyLoading ? 'Sending...' : 'Send Reply'}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400">
            <Send className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Select a thread to view the conversation</p>
          </div>
        )}
      </div>

    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { X, Send, Download } from 'lucide-react';
import apiClient from '@/lib/axios';
import { Loader } from '@/components/ui/Loader';

interface ThreadViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  threadId: string;
}

export default function ThreadViewerModal({ isOpen, onClose, caseId, threadId }: ThreadViewerModalProps) {
  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isOpen && threadId) {
      setLoading(true);
      apiClient.get(`/cases/${caseId}/threads`)
        .then((res) => {
          const t = res.data.data.find((x: any) => x.request_id === threadId || x._id === threadId);
          setThread(t);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setThread(null);
      setReplyText('');
    }
  }, [isOpen, caseId, threadId]);

  if (!isOpen) return null;

  const handleReply = async () => {
    if (!replyText.trim() || !thread) return;
    setReplying(true);
    try {
      await apiClient.post(`/cases/threads/${thread._id}/reply`, {
        content: replyText,
        sender: 'io',
      });
      setReplyText('');
      // Refresh thread after reply
      const res = await apiClient.get(`/cases/${caseId}/threads`);
      const t = res.data.data.find((x: any) => x.request_id === threadId || x._id === threadId);
      setThread(t);
    } catch (err) {
      console.error(err);
    } finally {
      setReplying(false);
    }
  };

  const handleExportPdf = async () => {
    if (!thread) return;
    setExporting(true);
    try {
      await apiClient.post(`/cases/${caseId}/threads/${thread.request_id}/export-pdf`);
      alert('Thread exported as Evidence PDF successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to export thread as PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col h-[80vh] max-h-[800px] overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Thread Detail</h2>
            <p className="text-sm text-neutral-500">Request ID: {threadId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={exporting || !thread}
              className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <Download size={14} /> {exporting ? 'Exporting...' : 'Save as Evidence'}
            </button>
            <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-lg">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/30">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader /></div>
          ) : !thread ? (
            <div className="h-full flex items-center justify-center text-neutral-400 italic">Thread not found</div>
          ) : (
            <div className="space-y-6">
              {thread.messages.map((msg: any, idx: number) => {
                const isIO = msg.sender === 'io';
                return (
                  <div key={idx} className={`flex flex-col ${isIO ? 'items-end' : 'items-start'}`}>
                    <div className="text-xs text-neutral-400 mb-1 px-1">
                      {isIO ? 'You (IO)' : thread.department_entity_id} · {new Date(msg.timestamp).toLocaleString('en-IN')}
                    </div>
                    <div className={`p-4 rounded-xl max-w-[85%] text-sm leading-relaxed border shadow-sm ${isIO ? 'bg-blue-600 text-white border-blue-700 rounded-br-sm' : 'bg-white text-neutral-800 border-neutral-200 rounded-bl-sm'
                      }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {thread && (
          <div className="p-4 bg-white border-t border-neutral-100">
            <div className="flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type a follow-up reply..."
                className="flex-1 resize-none bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || replying}
                className="bg-blue-600 text-white px-5 rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {replying ? <Loader size={16} color="white" /> : <Send size={16} />}
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

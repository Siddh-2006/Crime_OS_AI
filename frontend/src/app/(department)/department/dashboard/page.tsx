'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileText, Inbox, Loader2, LogOut, Send } from 'lucide-react';
import apiClient from '@/lib/axios';
import { Button } from '@/components/ui/Button';
import { FileUpload, UploadedFile } from '@/components/ui/FileUpload';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

export default function DepartmentDashboard() {
  const router = useRouter();
  const [entityId, setEntityId] = useState<string>('');
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem('dept_token');
    const id = localStorage.getItem('dept_entity_id');
    
    if (!token || !id) {
      router.push('/department/login');
      return;
    }
    
    setEntityId(id);
    fetchInbox(id);
  }, [router]);

  const fetchInbox = async (id: string) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/department-portal/inbox?department_entity_id=${id}`);
      setThreads(res.data.data);
      return res.data.data;
    } catch (err) {
      console.error('Failed to fetch inbox', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dept_token');
    localStorage.removeItem('dept_entity_id');
    router.push('/department/login');
  };

  const handleReply = async () => {
    if (!selectedThread || (!replyContent.trim() && uploadedFiles.length === 0)) return;
    setReplying(true);
    try {
      // Actually hitting the respond endpoint
      await apiClient.post(`/department-portal/requests/${selectedThread.request_id}/respond`, {
        response_content: replyContent || 'Attached documents provided.',
        attachments: uploadedFiles
      });
      setReplyContent('');
      setUploadedFiles([]);
      const newThreads = await fetchInbox(entityId);
      
      showToast('Response sent successfully!', 'success');
      
      // Update selected thread local state to show new message
      if (newThreads) {
        const updated = newThreads.find((t: any) => t._id === selectedThread._id);
        if (updated) setSelectedThread(updated);
      }
    } catch (error) {
      console.error('Failed to reply', error);
      showToast('Failed to send response.', 'error');
    } finally {
      setReplying(false);
    }
  };

  if (!entityId) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-blue-400" />
          <h1 className="text-xl font-semibold">Partner Portal - {entityId}</h1>
        </div>
        <Button variant="ghost" onClick={handleLogout} className="text-slate-300 hover:text-white" leftIcon={<LogOut size={16} />}>
          Sign Out
        </Button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Pane: Inbox List */}
        <div className="w-1/3 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2 text-slate-700 font-medium">
            <Inbox size={18} /> Inbox ({threads.length})
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-slate-400 flex justify-center"><Loader2 className="animate-spin" /></div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No official requests received.</div>
            ) : (
              threads.map((thread) => (
                <div
                  key={thread._id}
                  onClick={() => setSelectedThread(thread)}
                  className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${selectedThread?._id === thread._id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-slate-800 text-sm truncate pr-2">Gujarat Police (Cyber Cell)</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(thread.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm text-slate-900 font-medium truncate mb-1">
                    Req: {thread.step_title}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {thread.messages[thread.messages.length - 1]?.content.substring(0, 80)}...
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Pane: Thread View */}
        <div className="flex-1 bg-slate-50 flex flex-col">
          {selectedThread ? (
            <>
              <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                <div>
                  <h2 className="font-semibold text-lg text-slate-800">{selectedThread.step_title}</h2>
                  <p className="text-xs text-slate-500">Ref: {selectedThread.request_id}</p>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {selectedThread.messages.map((msg: any, idx: number) => {
                  const isDept = msg.sender === 'department';
                  return (
                    <div key={idx} className={`flex flex-col ${isDept ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-slate-400 mb-1 px-1">
                        {isDept ? entityId : 'Gujarat Police'} • {new Date(msg.timestamp).toLocaleString()}
                      </span>
                      <div className={`max-w-[80%] rounded-xl p-4 text-sm shadow-sm ${
                        isDept ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                      }`}>
                        <div className="whitespace-pre-wrap font-mono">{msg.content}</div>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <div className="text-xs font-semibold opacity-70 uppercase tracking-wider">Attachments:</div>
                            <div className="flex flex-wrap gap-2">
                              {msg.attachments.map((att: any, aIdx: number) => {
                                const url = att.cloudinary_url || 
                                  (att.storage_ref && !att.storage_ref.startsWith('none') && !att.storage_ref.startsWith('mock')
                                    ? (att.storage_ref.startsWith('http') 
                                        ? att.storage_ref 
                                        : `https://res.cloudinary.com/q9ixw3zp/image/upload/${att.storage_ref}`)
                                    : null);
                                const name = att.original_filename || att.evidence_id || `Attachment ${aIdx + 1}`;
                                return url ? (
                                  <a 
                                    key={aIdx} 
                                    href={url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${isDept ? 'bg-blue-700 border-blue-500 hover:bg-blue-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                    <FileText size={14} aria-hidden="true" /> {name}
                                  </a>
                                ) : (
                                  <span key={aIdx} className="text-xs px-2 py-1 rounded border opacity-70">
                                    <FileText size={14} aria-hidden="true" /> {name} (Processing)
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-white border-t border-slate-200">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Type your official response..."
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
                  rows={4}
                />
                <div className="mt-3">
                  <FileUpload 
                    value={uploadedFiles} 
                    onChange={setUploadedFiles} 
                    maxFiles={5} 
                    uploadSignatureUrl="/department-portal/upload-signature"
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <Button 
                    onClick={handleReply} 
                    isLoading={replying} 
                    disabled={!replyContent.trim() && uploadedFiles.length === 0}
                    leftIcon={<Send size={16} />}
                  >
                    Send Response
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 h-full">
              <Inbox size={48} className="mb-4 opacity-20" />
              <p>Select a request from the inbox to view details</p>
            </div>
          )}
        </div>
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

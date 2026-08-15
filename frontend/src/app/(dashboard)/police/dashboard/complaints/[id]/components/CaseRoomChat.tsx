'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import { Lock, Send, User, MessageSquare, ShieldCheck, Loader2, BookOpen, X, RefreshCw, GripVertical } from 'lucide-react';
import apiClient from '@/lib/axios';
import { CaseDiaryFeed } from './CaseDiaryFeed';

interface IMessage {
  message_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  isEncrypted?: boolean;
  sent_at: string;
}

interface CaseRoomChatProps {
  caseId: string;
  currentUserId?: string;
  currentUserName?: string;
}

export const CaseRoomChat: React.FC<CaseRoomChatProps> = ({
  caseId,
  currentUserId,
  currentUserName,
}) => {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // Case Diary Timeline Sidebar state
  const [diaryEntries, setDiaryEntries] = useState<any[]>([]);
  const [diaryLoading, setDiaryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Resizable middle divider state
  const [sidebarWidth, setSidebarWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        // Width of sidebar is distance from right edge of container to mouse position
        const newWidth = containerRect.right - mouseMoveEvent.clientX;
        // Clamp width between min (260px) and max (650px or 60% of container)
        const maxW = Math.min(650, Math.floor(containerRect.width * 0.6));
        if (newWidth >= 260 && newWidth <= maxW) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchDiary = async () => {
    try {
      setDiaryLoading(true);
      const res = await apiClient.get(`/cases/${caseId}/diary`);
      if (res.data?.success && res.data?.data) {
        const raw = res.data.data;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw.entries)
            ? raw.entries
            : Array.isArray(raw.diary)
              ? raw.diary
              : [];
        setDiaryEntries(list);
      } else {
        setDiaryEntries([]);
      }
    } catch (err) {
      console.error('Failed to load case diary for room:', err);
      setDiaryEntries([]);
    } finally {
      setDiaryLoading(false);
    }
  };

  useEffect(() => {
    fetchDiary();
  }, [caseId]);

  useEffect(() => {
    let isMounted = true;

    // Fetch message history via REST
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get(`/cases/${caseId}/room/messages`);
        if (isMounted && res.data?.success) {
          setMessages(res.data.data?.messages || []);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();

    // Retrieve auth token from localStorage (preferred) or Cookies
    let token = '';
    if (typeof window !== 'undefined') {
      token =
        localStorage.getItem('accessToken') ||
        localStorage.getItem('token') ||
        Cookies.get('auth_token') ||
        Cookies.get('token') ||
        Cookies.get('accessToken') ||
        '';
    }

    let socketBaseUrl = 'http://localhost:5000';
    if (process.env.NEXT_PUBLIC_API_URL) {
      try {
        socketBaseUrl = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
      } catch (e) {
        socketBaseUrl = process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '');
      }
    }

    console.log('[Private Room] Connecting to socket namespace:', `${socketBaseUrl}/chat`);
    console.log('[Private Room] Token present:', !!token);

    const socket = io(`${socketBaseUrl}/chat`, {
      auth: { token },
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Private Room] Socket connected! Socket ID:', socket.id);
      if (isMounted) setSocketConnected(true);
      console.log('[Private Room] Emitting join_room for caseId:', caseId);
      socket.emit('join_room', { caseId });
    });

    socket.on('joined_room', (data) => {
      console.log('[Private Room] Successfully joined room:', data);
    });

    socket.on('connect_error', (err) => {
      console.error('[Private Room] Socket connect_error:', err.message);
      if (isMounted) setSocketConnected(false);
    });

    socket.on('error', (err: any) => {
      console.error('[Private Room] Socket error event:', err);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Private Room] Socket disconnected. Reason:', reason);
      if (isMounted) setSocketConnected(false);
    });

    socket.on('new_message', (msg: IMessage) => {
      console.log('[Private Room] Received new real-time message:', msg);
      if (isMounted) {
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === msg.message_id)) return prev;
          return [...prev, msg];
        });
      }
    });

    socket.on('user_typing', ({ officerName }: { officerId: string; officerName: string }) => {
      if (isMounted && officerName && officerName !== currentUserName) {
        setTypingUsers((prev) => Array.from(new Set([...prev, officerName])));
      }
    });

    socket.on('user_stop_typing', ({ officerName }: { officerId: string; officerName: string }) => {
      if (isMounted && officerName) {
        setTypingUsers((prev) => prev.filter((name) => name !== officerName));
      }
    });

    return () => {
      isMounted = false;
      console.log('[Private Room] Cleaning up socket connection');
      socket.disconnect();
    };
  }, [caseId, currentUserName]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!socketRef.current) return;

    socketRef.current.emit('typing', { caseId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { caseId });
    }, 2000);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    if (socketRef.current && socketConnected) {
      socketRef.current.emit('send_message', { caseId, content: textToSend });
      socketRef.current.emit('stop_typing', { caseId });
    } else {
      // Fallback to REST API if socket is disconnected
      try {
        const res = await apiClient.post(`/cases/${caseId}/room/messages`, { content: textToSend });
        if (res.data?.success) {
          setMessages((prev) => [...prev, res.data.data]);
        }
      } catch (err) {
        console.error('Failed to send message via REST fallback:', err);
      }
    }
  };

  return (
    <div className="flex flex-col h-[68vh] min-h-[420px] max-h-[680px] sm:h-[680px] bg-surface border border-border rounded-2xl shadow-sm overflow-hidden relative">
      {/* Top Header */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5 bg-surface-elevated border-b border-border shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
            <MessageSquare size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary">Case Private Room</h3>
              <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Lock size={10} /> AES-256 Encrypted
              </span>
            </div>
            <p className="text-[11px] text-text-secondary">
              Secure internal chat for Investigation Officers assigned to this case
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-xs text-text-secondary font-medium">
              {socketConnected ? 'Realtime' : 'Connecting'}
            </span>
          </div>

          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              sidebarOpen
                ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30'
                : 'bg-surface-elevated text-text-secondary border-border hover:bg-surface-elevated/80'
            }`}
            title="Toggle Case Diary Timeline Sidebar"
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">Case Diary</span>
            {diaryEntries.length > 0 && (
              <span className="px-1.5 py-0.2 bg-brand-primary text-white rounded-full text-[10px] font-bold">
                {diaryEntries.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Body Split View */}
      <div
        ref={containerRef}
        className={`flex flex-1 min-h-0 relative overflow-hidden bg-background/50 ${
          isResizing ? 'select-none cursor-col-resize' : ''
        }`}
      >
        {/* Left Column: Chat Container */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
            {loading ? (
              <div className="flex items-center justify-center h-full text-text-secondary gap-2 text-xs">
                <Loader2 className="animate-spin h-4 w-4 text-brand-primary" /> Loading encrypted chat history...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-2 text-text-secondary">
                <ShieldCheck size={36} className="text-brand-primary/40" />
                <p className="text-xs font-semibold text-text-primary">No messages in this private room yet</p>
                <p className="text-[11px] max-w-xs">
                  Start collaborating with other assigned Investigation Officers. All messages are end-to-end encrypted in storage.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.message_id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[88%] sm:max-w-[80%] ${
                      isMe ? 'ml-auto' : 'mr-auto'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <User size={12} className="text-text-muted" />
                      <span className="text-[11px] font-bold text-text-secondary">
                        {isMe ? 'You' : msg.sender_name}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                        isMe
                          ? 'bg-brand-primary text-white rounded-tr-none'
                          : 'bg-surface border border-border text-text-primary rounded-tl-none'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="px-5 py-1 bg-surface/50 text-[11px] text-text-secondary italic shrink-0 border-t border-border/30">
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}

          {/* Input Box */}
          <form onSubmit={handleSendMessage} className="p-3 bg-surface border-t border-border flex flex-col gap-2 sm:flex-row sm:items-center shrink-0">
            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              placeholder="Type an encrypted message..."
              className="w-full flex-1 px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-full sm:w-auto px-4 py-2.5 bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shrink-0"
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Draggable Vertical Divider Handle (Visible on desktop when sidebar is open) */}
        {sidebarOpen && (
          <div
            onMouseDown={startResizing}
            className={`hidden lg:flex items-center justify-center w-2.5 hover:w-2.5 bg-border/40 hover:bg-brand-primary/50 cursor-col-resize z-20 group transition-all shrink-0 border-x border-border/40 ${
              isResizing ? 'bg-brand-primary/80 border-brand-primary' : ''
            }`}
            title="Click & drag left or right to resize sidebar"
          >
            <div className={`w-1 h-8 rounded-full bg-text-muted/40 group-hover:bg-brand-primary transition-colors ${isResizing ? 'bg-white' : ''}`} />
          </div>
        )}

        {/* Right Column: Case Diary Foldable Sidebar */}
        <div
          style={
            sidebarOpen
              ? { width: sidebarWidth ? `${sidebarWidth}px` : undefined }
              : undefined
          }
          className={`flex flex-col bg-surface border-l border-border shrink-0 transition-all ${
            isResizing ? 'transition-none' : 'duration-300'
          } ${
            sidebarOpen
              ? 'opacity-100'
              : 'w-0 opacity-0 overflow-hidden border-none'
          } ${
            // Responsive mobile overlay drawer
            'max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-full max-lg:sm:w-80 max-lg:shadow-2xl max-lg:!w-80'
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-border bg-surface-elevated shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-brand-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary font-heading">
                Case Diary Timeline
              </h4>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchDiary}
                className="p-1.5 hover:bg-surface-elevated rounded-lg text-text-muted hover:text-text-primary transition-colors"
                title="Refresh Timeline"
              >
                <RefreshCw size={13} className={diaryLoading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 hover:bg-surface-elevated rounded-lg text-text-muted hover:text-text-primary transition-colors"
                title="Close Sidebar"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-2">
            {diaryLoading && diaryEntries.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted flex justify-center items-center gap-2">
                <Loader2 className="animate-spin h-4 w-4 text-brand-primary" /> Loading diary entries...
              </div>
            ) : (
              <CaseDiaryFeed entries={diaryEntries} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


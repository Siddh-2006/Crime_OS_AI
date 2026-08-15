'use client';

import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import { Lock, Send, User, MessageSquare, ShieldCheck, Loader2 } from 'lucide-react';
import apiClient from '@/lib/axios';

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
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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

    // Initialize Socket.io connection
    const token = Cookies.get('auth_token') || Cookies.get('token') || '';
    const socketUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    
    const socket = io(`${socketUrl}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (isMounted) setSocketConnected(true);
      socket.emit('join_room', { caseId });
    });

    socket.on('disconnect', () => {
      if (isMounted) setSocketConnected(false);
    });

    socket.on('new_message', (msg: IMessage) => {
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
    <div className="flex flex-col h-[650px] bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-surface-elevated border-b border-border">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span className="text-xs text-text-secondary font-medium">
            {socketConnected ? 'Realtime Connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-background/50">
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
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%] ${
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
        <div className="px-5 py-1 bg-surface/50 text-[11px] text-text-secondary italic">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Input Box */}
      <form onSubmit={handleSendMessage} className="p-3 bg-surface border-t border-border flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Type an encrypted message..."
          className="flex-1 px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary transition-all"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-4 py-2.5 bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shrink-0"
        >
          <Send size={14} />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};

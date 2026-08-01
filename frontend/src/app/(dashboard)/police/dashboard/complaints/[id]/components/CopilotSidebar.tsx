'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, CheckCircle2, AlertCircle, Sparkles, X } from 'lucide-react';
import apiClient from '@/lib/axios';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from '@/context/TranslationContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  proposal?: CopilotProposal | null;
  applied?: boolean;
  isError?: boolean;
}

interface CopilotProposal {
  type: 'add_step' | 'draft_request' | string;
  payload: Record<string, any>;
}

interface CopilotSidebarProps {
  caseId: string;
  onStateChangeApplied: () => void;
  onClose?: () => void;
}

function ProposalCard({
  proposal,
  applied,
  applying,
  onApply,
}: {
  proposal: CopilotProposal;
  applied?: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  const typeLabels: Record<string, string> = {
    add_step: 'Add Checklist Step',
    draft_request: 'Draft Department Request',
  };

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm w-full max-w-[92%]">
      <div className="flex items-center gap-2 bg-amber-100 px-3 py-2 border-b border-amber-200">
        <AlertCircle size={13} className="text-amber-600 flex-shrink-0" />
        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
          Proposed: {typeLabels[proposal.type] ?? proposal.type}
        </span>
      </div>

      <pre className="p-3 text-[11px] font-mono text-slate-700 bg-amber-50 overflow-x-auto whitespace-pre-wrap break-words">
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>

      <div className="p-2 border-t border-amber-200 bg-white">
        <button
          className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-all ${
            applied
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-amber-500 hover:bg-amber-600 text-white'
          }`}
          onClick={onApply}
          disabled={applied || applying}
        >
          {applying ? (
            <><Loader2 size={13} className="animate-spin" /> Applying…</>
          ) : applied ? (
            <><CheckCircle2 size={13} /> Applied Successfully</>
          ) : (
            'Apply this change'
          )}
        </button>
      </div>
    </div>
  );
}

function parseAssistantMessage(raw: string): { content: string; proposal: CopilotProposal | null } {
  const proposalRegex = /```proposal\s*\n([\s\S]*?)\n```/;
  const match = raw.match(proposalRegex);
  if (match) {
    try {
      const proposal = JSON.parse(match[1]) as CopilotProposal;
      const content = raw.replace(proposalRegex, '').trim();
      return { content, proposal };
    } catch {
      // malformed JSON – show as plain text
    }
  }
  return { content: raw, proposal: null };
}

export function CopilotSidebar({ caseId, onStateChangeApplied, onClose }: CopilotSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your **Investigation Copilot**. Ask me anything about this case — facts, next steps, what evidence to collect, or I can draft a department request for you.\n\nFor any changes to the case, I'll propose them first and wait for your approval.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { language } = useTranslation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);

    try {
      const res = await apiClient.post(`/cases/${caseId}/copilot/ask`, { 
        message: trimmed,
        language
      });
      const rawText: string = res.data?.data?.response ?? 'No response.';
      const { content, proposal } = parseAssistantMessage(rawText);
      setMessages(prev => [...prev, { role: 'assistant', content, proposal }]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. The AI service may be unavailable.',
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (idx: number, proposal: CopilotProposal) => {
    setApplyingIdx(idx);
    try {
      if (proposal.type === 'add_step') {
        // ← Exact same endpoint as the manual "Add Step" flow — single code path
        await apiClient.post(`/cases/${caseId}/checklist/steps`, {
          title: proposal.payload.title,
          description: proposal.payload.description,
          criticality: proposal.payload.criticality,
        });
      } else if (proposal.type === 'draft_request') {
        // ← Exact same endpoint as RequestComposerModal — single code path
        await apiClient.post(`/cases/${caseId}/requests/draft`, {
          step_id: proposal.payload.step_id ?? 'copilot',
          department_entity_id: proposal.payload.department_entity_id,
          request_type: 'general',
        });
      } else {
        // Generic passthrough for any future proposal types
        await apiClient.post(`/cases/${caseId}/analysis/manual`, proposal);
      }

      setMessages(prev =>
        prev.map((m, i) => (i === idx ? { ...m, applied: true } : m))
      );
      onStateChangeApplied();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Unknown error';
      alert(`Failed to apply the proposed change: ${msg}`);
    } finally {
      setApplyingIdx(null);
    }
  };

  const suggestionPrompts = [
    'What should I investigate next?',
    'Propose a step to freeze the suspect account',
    'Summarize what we know so far',
    'Draft a request to HDFC Bank for CDR',
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 shadow-lg" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <Bot size={15} />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">Investigation Copilot</p>
            <p className="text-[10px] text-blue-100 mt-0.5">RAG · Case-aware · Proposal-safe</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm" style={{ minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[90%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-sm">
                {msg.content}
              </div>
            ) : (
              <div
                className={`max-w-[92%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm border ${
                  msg.isError
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:text-sm">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            )}

            {msg.proposal && (
              <ProposalCard
                proposal={msg.proposal}
                applied={msg.applied}
                applying={applyingIdx === i}
                onApply={() => handleApply(i, msg.proposal!)}
              />
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-start">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 size={14} className="animate-spin text-blue-500" />
              <span>Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions (only show when no user messages yet) */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 space-y-1.5 flex-shrink-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
            <Sparkles size={10} /> Suggested questions
          </p>
          <div className="flex flex-col gap-1.5">
            {suggestionPrompts.map(p => (
              <button
                key={p}
                onClick={() => setInput(p)}
                className="text-left text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-3 py-1.5 border border-blue-100 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50"
            placeholder="Ask anything about this case…"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-colors flex-shrink-0"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

interface CustodyCountdownProps {
  custodyDeadline: string;
  accusedName: string;
  onProduceBefore: () => void;
  producingLoading?: boolean;
}

function getRemaining(deadline: string): number {
  return new Date(deadline).getTime() - Date.now();
}

function formatRemaining(ms: number): { text: string; urgent: boolean; passed: boolean } {
  if (ms <= 0) return { text: 'DEADLINE PASSED', urgent: true, passed: true };
  const totalMinutes = Math.floor(ms / 60_000);
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const urgent  = ms < 2 * 60 * 60 * 1_000;
  return {
    text:   hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`,
    urgent,
    passed: false,
  };
}

export function CustodyCountdown({
  custodyDeadline,
  accusedName,
  onProduceBefore,
  producingLoading,
}: CustodyCountdownProps) {
  const [remaining, setRemaining] = useState(() => getRemaining(custodyDeadline));

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining(custodyDeadline)), 60_000);
    return () => clearInterval(id);
  }, [custodyDeadline]);

  const { text, urgent, passed } = formatRemaining(remaining);

  const deadlineLocal = new Date(custodyDeadline).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  // Map urgency to semantic tokens
  const containerCls = passed
    ? 'border-semantic-critical/40 bg-semantic-critical/5'
    : urgent
      ? 'border-semantic-warning/50 bg-semantic-warning/5'
      : 'border-semantic-warning/30 bg-semantic-warning/5';

  const iconCls    = passed || urgent ? 'text-semantic-critical' : 'text-semantic-warning';
  const titleCls   = passed || urgent ? 'text-semantic-critical' : 'text-semantic-warning';
  const badgeCls   = passed
    ? 'bg-semantic-critical/10 text-semantic-critical border border-semantic-critical/30'
    : urgent
      ? 'bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/30'
      : 'bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/30';

  return (
    <div className={`rounded-xl border p-4 ${containerCls}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className={`flex-shrink-0 mt-0.5 ${iconCls}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${titleCls}`}>
            BNSS §57 — 24-Hour Custody Deadline
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            <span className="font-semibold text-text-primary">{accusedName}</span> must be produced
            before the magistrate by{' '}
            <span className="font-semibold text-text-primary">{deadlineLocal}</span>.
          </p>
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black ${badgeCls}`}>
            <Clock size={11} />
            {text}
          </div>
        </div>
        <button
          onClick={onProduceBefore}
          disabled={producingLoading}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-semantic-success hover:bg-semantic-success/90 text-white transition-colors disabled:opacity-50 cursor-pointer"
        >
          {producingLoading ? 'Saving…' : 'Mark Produced'}
        </button>
      </div>
    </div>
  );
}

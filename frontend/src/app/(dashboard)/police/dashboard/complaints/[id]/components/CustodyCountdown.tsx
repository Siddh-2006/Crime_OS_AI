'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

interface CustodyCountdownProps {
  custodyDeadline: string; // ISO UTC string
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
  const urgent  = ms < 2 * 60 * 60 * 1_000; // < 2 hours
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

  return (
    <div className={`rounded-xl border p-4 ${
      passed
        ? 'border-red-400 bg-red-50'
        : urgent
          ? 'border-orange-400 bg-orange-50'
          : 'border-yellow-300 bg-yellow-50'
    }`}>
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={18}
          className={`flex-shrink-0 mt-0.5 ${passed ? 'text-red-500' : 'text-orange-500'}`}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${passed ? 'text-red-700' : 'text-orange-700'}`}>
            BNSS §57 — 24-Hour Custody Deadline
          </p>
          <p className="text-xs text-neutral-600 mt-0.5">
            <span className="font-semibold">{accusedName}</span> must be produced before the magistrate by{' '}
            <span className="font-semibold">{deadlineLocal}</span>.
          </p>

          {/* Countdown */}
          <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black ${
            passed
              ? 'bg-red-200 text-red-800'
              : urgent
                ? 'bg-orange-200 text-orange-800'
                : 'bg-yellow-200 text-yellow-800'
          }`}>
            <Clock size={12} />
            {text}
          </div>
        </div>

        {/* Action */}
        <button
          onClick={onProduceBefore}
          disabled={producingLoading}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
        >
          {producingLoading ? 'Saving…' : 'Mark Produced'}
        </button>
      </div>
    </div>
  );
}

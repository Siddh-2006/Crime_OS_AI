/**
 * Offline Banner
 * 
 * Shows a persistent banner when the app is offline.
 * Provides quick access to sync status and retry.
 */

'use client';

import React from 'react';
import { useSync } from '@/hooks/useSync';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, status, pendingCount, triggerSync } = useSync();

  // Only show when offline or has pending operations
  if (isOnline && status !== 'pending') {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${
        isOnline
          ? 'bg-semantic-pending border-b border-semantic-pending/20'
          : 'bg-semantic-critical border-b border-semantic-critical/20'
      } backdrop-blur-md py-2 px-4 flex items-center justify-center gap-3 text-sm font-medium shadow-lg text-slate-900 dark:text-white`}
    >
      {isOnline ? (
        <>
          <RefreshCw size={16} />
          <span>
            {pendingCount} operation{pendingCount !== 1 ? 's' : ''} pending sync
          </span>
          <button
            onClick={triggerSync}
            className="ml-2 rounded-lg bg-slate-900/20 dark:bg-white/20 hover:bg-slate-900/30 dark:hover:bg-white/30 px-3 py-1 text-xs font-bold transition-all"
          >
            Sync Now
          </button>
        </>
      ) : (
        <>
          <CloudOff size={16} />
          <span>You are offline. Changes will sync when connection is restored.</span>
        </>
      )}
    </div>
  );
}

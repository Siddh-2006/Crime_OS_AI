/**
 * useSync Hook
 * 
 * React hook for accessing sync state and triggering sync operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { SyncManager, SyncState } from '@/lib/offline';

export function useSync() {
  const [syncState, setSyncState] = useState<SyncState>(SyncManager.getState());

  useEffect(() => {
    // Subscribe to sync state changes
    const unsubscribe = SyncManager.subscribe(setSyncState);

    // Initial check
    SyncManager.checkAndSync();

    return unsubscribe;
  }, []);

  const triggerSync = useCallback(async () => {
    return await SyncManager.syncAll();
  }, []);

  const refreshOnlineStatus = useCallback(() => {
    SyncManager.refreshOnlineStatus();
  }, []);

  return {
    ...syncState,
    triggerSync,
    refreshOnlineStatus,
  };
}

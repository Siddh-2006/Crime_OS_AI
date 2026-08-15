/**
 * Sync Initializer
 * 
 * Client component that initializes the sync manager on mount.
 * Must be used in client-side code only.
 */

'use client';

import { useEffect } from 'react';
import { SyncManager } from '@/lib/offline';

export function SyncInitializer() {
  useEffect(() => {
    // Initialize sync manager
    SyncManager.initialize();
  }, []);

  return null; // This component doesn't render anything
}

/**
 * Offline Workspace Wrapper
 * 
 * Shows offline status indicators. The actual caching happens automatically
 * via axios interceptor - we don't need to pre-fetch anything here.
 */

'use client';

import React, { useEffect } from 'react';
import { InvestigationWorkspace, WorkspaceTab } from './InvestigationWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useToast } from '@/hooks/useToast';
import { CaseCacheManager, OfflineToastNotifier } from '@/lib/offline';
import { CloudOff, RefreshCw, Info } from 'lucide-react';
import apiClient from '@/lib/axios';

interface OfflineWorkspaceWrapperProps {
  caseId: string;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
}

export function OfflineWorkspaceWrapper({
  caseId,
  activeTab,
  setActiveTab,
}: OfflineWorkspaceWrapperProps) {
  const { user } = useAuth();
  const { isOnline, status: syncStatus, pendingCount } = useSync();
  const { showToast } = useToast();
  const [isCached, setIsCached] = React.useState(false);
  
  const officerId = user?._id || '';

  // Register toast callback for offline notifications
  useEffect(() => {
    OfflineToastNotifier.setToastCallback(showToast);
  }, [showToast]);

  // Refresh online status when tab changes
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const actualOnline = navigator.onLine;
      // Force refresh to check actual network state
      if (actualOnline !== isOnline) {
        window.dispatchEvent(new Event(actualOnline ? 'online' : 'offline'));
      }
    }
  }, [activeTab, isOnline]);

  // Sequential prefetch of all tabs (one by one to avoid race conditions)
  useEffect(() => {
    const prefetchAllTabs = async () => {
      if (!isOnline || !officerId || !caseId) return;
      
      // Wait a bit for initial render to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`[OfflineWorkspace] Starting sequential prefetch for case ${caseId}...`);
      
      // Only API endpoints, not page URLs
      const endpoints = [
        { url: `/cases/${caseId}/analysis/latest`, name: 'AI Analysis' },
        { url: `/cases/${caseId}/checklist`, name: 'Checklist' },
        { url: `/cases/${caseId}/participants`, name: 'Participants' },
        { url: `/cases/${caseId}/evidence`, name: 'Evidence' },
        { url: `/cases/${caseId}/diary`, name: 'Diary' },
        { url: `/cases/${caseId}/diary/history`, name: 'Diary History' },
        { url: `/cases/${caseId}/diary/places`, name: 'Places Visited' },
        { url: `/cases/${caseId}/requests`, name: 'Requests' },
        { url: `/cases/${caseId}/threads`, name: 'Threads' },
        { url: `/cases/${caseId}/warrants`, name: 'Warrants/Custody' },
        { url: `/complaints/${caseId}`, name: 'Original Complaint' },
        { url: `/case-understanding/${caseId}`, name: 'Case Understanding' },
        { url: `/case-understanding/${caseId}/timeline`, name: 'Timeline' },
        // SHO-specific endpoints (will fail gracefully for IO officers)
        { url: `/cases/${caseId}/ai-case-understanding`, name: 'AI Case Understanding (SHO)' },
        { url: `/cases/${caseId}/audit-timeline`, name: 'Audit Timeline (SHO)' },
      ];
      
      let cachedCount = 0;
      let skippedCount = 0;
      
      // Fetch one by one with small delays
      for (const endpoint of endpoints) {
        try {
          await apiClient.get(endpoint.url);
          cachedCount++;
          console.log(`[OfflineWorkspace] Prefetched (${cachedCount}/${endpoints.length}): ${endpoint.name}`);
          // Small delay between requests to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error: any) {
          // Ignore 404 errors (endpoint might not exist for this case)
          // Also ignore 403 errors (endpoint might be role-restricted)
          if (error.response?.status === 404 || error.response?.status === 403) {
            skippedCount++;
            const reason = error.response?.status === 403 ? 'access denied' : 'not available for this case';
            console.log(`[OfflineWorkspace] ⊘ Skipped (${skippedCount}): ${endpoint.name} (${reason})`);
          } else {
            console.error(`[OfflineWorkspace] Error prefetching ${endpoint.name}:`, error.message);
          }
        }
      }
      
      console.log(`[OfflineWorkspace] Prefetch complete: ${cachedCount}/${endpoints.length} cached, ${skippedCount} skipped`);
      setIsCached(cachedCount > 0);
    };
    
    // Only run once per case
    if (isOnline && officerId && caseId) {
      prefetchAllTabs();
    }
  }, [caseId, officerId, isOnline]);

  // Show offline/cache status indicator
  const renderStatusIndicator = () => {
    if (!isOnline) {
      return (
        <div className="mb-4 rounded-xl border border-semantic-warning/30 bg-semantic-warning/10 p-4 flex items-start gap-3">
          <CloudOff size={20} className="text-semantic-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-text-primary mb-1">
              Offline Mode
            </h4>
            <p className="text-xs text-text-secondary">
              {isCached
                ? 'Viewing cached case data. Changes you make will automatically sync when you reconnect.'
                : 'Trying to load from cache. If case was not previously opened online, some data may be unavailable.'}
            </p>
            {pendingCount > 0 && (
              <p className="text-xs text-semantic-warning mt-2 flex items-center gap-2">
                <RefreshCw size={12} />
                {pendingCount} pending change{pendingCount !== 1 ? 's' : ''} will sync when online.
              </p>
            )}
          </div>
        </div>
      );
    }

    if (isCached) {
      return (
        <div className="mb-4 rounded-xl border border-semantic-info/30 bg-semantic-info/10 p-3 flex items-center gap-3">
          <Info size={18} className="text-semantic-info flex-shrink-0" />
          <p className="text-xs text-text-secondary">
            Case data is being cached automatically. All viewed tabs will be available offline.
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <div>
      {renderStatusIndicator()}
      
      {/* InvestigationWorkspace fetches data normally */}
      {/* Axios interceptor automatically caches successful responses */}
      {/* And returns cached data when offline */}
      <InvestigationWorkspace
        caseId={caseId}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}

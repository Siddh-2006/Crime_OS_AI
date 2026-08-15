/**
 * useCaseData Hook
 * 
 * Offline-aware hook for fetching and caching case workspace data.
 * Automatically caches fetched data and retrieves from cache when offline.
 */

import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/lib/axios';
import { CaseCacheManager, CaseData, SyncManager } from '@/lib/offline';
import { API_ROUTES } from '@/lib/constants';

export interface UseCaseDataResult extends CaseData {
  loading: boolean;
  error: string | null;
  isCached: boolean;
  isOffline: boolean;
  refetch: () => Promise<void>;
}

export function useCaseData(caseId: string, officerId: string): UseCaseDataResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  const [caseData, setCaseData] = useState<CaseData>({
    snapshot: null,
    checklist: null,
    diaryEntries: [],
    diaryHistory: [],
    placesVisited: [],
    requests: [],
    evidence: [],
    participants: [],
    warrants: [],
    threads: [],
    complaintData: null,
    caseUnderstanding: null,
  });

  const fetchAndCacheData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const online = SyncManager.isOnline();
    setIsOffline(!online);

    try {
      if (online) {
        // Fetch from API
        const [
          snapRes,
          checkRes,
          diaryRes,
          diaryHistoryRes,
          placesRes,
          reqRes,
          evRes,
          participantRes,
          warrantRes,
          threadRes,
          complaintRes,
          cuRes,
        ] = await Promise.allSettled([
          apiClient.get(`/cases/${caseId}/analysis/latest`),
          apiClient.get(`/cases/${caseId}/checklist`),
          apiClient.get(`/cases/${caseId}/diary`),
          apiClient.get(`/cases/${caseId}/diary/history`),
          apiClient.get(`/cases/${caseId}/diary/places`),
          apiClient.get(`/cases/${caseId}/requests`),
          apiClient.get(`/cases/${caseId}/evidence`),
          apiClient.get(`/cases/${caseId}/participants`),
          apiClient.get(`/cases/${caseId}/warrants`),
          apiClient.get(`/cases/${caseId}/threads`),
          apiClient.get(API_ROUTES.COMPLAINTS.DETAIL(caseId)),
          apiClient.get(API_ROUTES.CASE_UNDERSTANDING.DETAIL(caseId)),
        ]);

        const newData: CaseData = {
          snapshot: snapRes.status === 'fulfilled' ? snapRes.value.data.data : null,
          checklist: checkRes.status === 'fulfilled' ? checkRes.value.data.data : null,
          diaryEntries: diaryRes.status === 'fulfilled' ? (Array.isArray(diaryRes.value.data.data) ? diaryRes.value.data.data : []) : [],
          diaryHistory: diaryHistoryRes.status === 'fulfilled' ? (Array.isArray(diaryHistoryRes.value.data.data) ? diaryHistoryRes.value.data.data : []) : [],
          placesVisited: placesRes.status === 'fulfilled' ? (Array.isArray(placesRes.value.data.data) ? placesRes.value.data.data : []) : [],
          requests: reqRes.status === 'fulfilled' ? (reqRes.value.data.data || []) : [],
          evidence: evRes.status === 'fulfilled' ? (evRes.value.data.data || []) : [],
          participants: participantRes.status === 'fulfilled' ? (Array.isArray(participantRes.value.data.data) ? participantRes.value.data.data : []) : [],
          warrants: warrantRes.status === 'fulfilled' ? (Array.isArray(warrantRes.value.data.data) ? warrantRes.value.data.data : []) : [],
          threads: threadRes.status === 'fulfilled' ? (threadRes.value.data.data || []) : [],
          complaintData: complaintRes.status === 'fulfilled' ? complaintRes.value.data.data : null,
          caseUnderstanding: cuRes.status === 'fulfilled' ? cuRes.value.data.data : null,
        };

        setCaseData(newData);
        
        // Cache the data
        await CaseCacheManager.saveCase(caseId, officerId, newData);
        setIsCached(true);
        
        console.log(`[useCaseData] Fetched and cached case ${caseId}`);
      } else {
        // Try to load from cache
        const cached = await CaseCacheManager.getCase(caseId, officerId);
        
        if (cached) {
          setCaseData({
            snapshot: cached.snapshot,
            checklist: cached.checklist,
            diaryEntries: cached.diaryEntries,
            diaryHistory: cached.diaryHistory,
            placesVisited: cached.placesVisited,
            requests: cached.requests,
            evidence: cached.evidence,
            participants: cached.participants,
            warrants: cached.warrants,
            threads: cached.threads,
            complaintData: cached.complaintData,
            caseUnderstanding: cached.caseUnderstanding,
          });
          setIsCached(true);
          console.log(`[useCaseData] Loaded case ${caseId} from cache`);
        } else {
          setError('Case not available offline. Please connect to the internet.');
        }
      }
    } catch (err: any) {
      console.error('[useCaseData] Error fetching case data:', err);
      
      // Try cache as fallback
      const cached = await CaseCacheManager.getCase(caseId, officerId);
      if (cached) {
        setCaseData({
          snapshot: cached.snapshot,
          checklist: cached.checklist,
          diaryEntries: cached.diaryEntries,
          diaryHistory: cached.diaryHistory,
          placesVisited: cached.placesVisited,
          requests: cached.requests,
          evidence: cached.evidence,
          participants: cached.participants,
          warrants: cached.warrants,
          threads: cached.threads,
          complaintData: cached.complaintData,
          caseUnderstanding: cached.caseUnderstanding,
        });
        setIsCached(true);
        setError('Using cached data (offline)');
      } else {
        setError(err.message || 'Failed to load case data');
      }
    } finally {
      setLoading(false);
    }
  }, [caseId, officerId]);

  useEffect(() => {
    if (caseId && officerId) {
      fetchAndCacheData();
    }
  }, [caseId, officerId, fetchAndCacheData]);

  return {
    ...caseData,
    loading,
    error,
    isCached,
    isOffline,
    refetch: fetchAndCacheData,
  };
}

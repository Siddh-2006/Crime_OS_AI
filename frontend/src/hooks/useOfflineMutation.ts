/**
 * useOfflineMutation Hook
 * 
 * Hook for making offline-aware API mutations.
 * Automatically queues operations when offline.
 */

import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { useSync } from './useSync';
import { OutboxManager } from '@/lib/offline';
import apiClient from '@/lib/axios';

export function useOfflineMutation() {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useSync();

  const mutate = useCallback(
    async (
      method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      endpoint: string,
      data?: any,
      options?: {
        affectedFields?: string[];
        dependsOn?: string;
      }
    ): Promise<{ data: any; queued: boolean }> => {
      const officerId = user?._id || '';
      
      // Extract case_id from endpoint
      const caseIdMatch = endpoint.match(/\/cases\/([^\/]+)/);
      const caseId = caseIdMatch ? caseIdMatch[1] : '';

      // Try online first
      if (isOnline) {
        try {
          let response;
          switch (method) {
            case 'POST':
              response = await apiClient.post(endpoint, data);
              break;
            case 'PUT':
              response = await apiClient.put(endpoint, data);
              break;
            case 'PATCH':
              response = await apiClient.patch(endpoint, data);
              break;
            case 'DELETE':
              response = await apiClient.delete(endpoint);
              break;
          }

          return {
            data: response.data?.data || response.data,
            queued: false,
          };
        } catch (error: any) {
          // If network error, fall through to queueing
          if (error.code !== 'ERR_NETWORK' && navigator.onLine) {
            throw error;
          }
        }
      }

      // Queue for offline sync
      const operationId = await OutboxManager.queueMutation(officerId, caseId, {
        method,
        endpoint,
        payload: data,
        affected_fields: options?.affectedFields,
        depends_on: options?.dependsOn,
      });

      // Trigger sync check
      setTimeout(() => triggerSync(), 100);

      return {
        data: { operationId, queued: true },
        queued: true,
      };
    },
    [user, isOnline, triggerSync]
  );

  return {
    mutate,
    isOnline,
  };
}

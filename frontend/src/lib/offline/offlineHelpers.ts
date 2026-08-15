/**
 * Offline Helpers
 * 
 * Utility functions for offline-aware API interactions.
 */

import { OfflineApiClient, OfflineRequestConfig } from './offlineApiClient';
import { SyncManager } from './sync';

/**
 * Check if a response is from the outbox (queued for later sync).
 */
export function isQueuedResponse(response: any): boolean {
  return response?.data?.data?.queued === true;
}

/**
 * Wrapper for making offline-aware POST requests.
 * Automatically queues if offline.
 */
export async function offlinePost<T = any>(
  url: string,
  data: any,
  options?: {
    affectedFields?: string[];
    dependsOn?: string;
    disableOfflineQueue?: boolean;
  }
): Promise<{ data: T; queued: boolean }> {
  const config: OfflineRequestConfig = {
    affectedFields: options?.affectedFields,
    dependsOn: options?.dependsOn,
    disableOfflineQueue: options?.disableOfflineQueue,
  };

  const response = await OfflineApiClient.post<any>(url, data, config);
  const queued = isQueuedResponse(response);

  return {
    data: response.data?.data,
    queued,
  };
}

/**
 * Wrapper for making offline-aware PUT requests.
 */
export async function offlinePut<T = any>(
  url: string,
  data: any,
  options?: {
    affectedFields?: string[];
    dependsOn?: string;
    disableOfflineQueue?: boolean;
  }
): Promise<{ data: T; queued: boolean }> {
  const config: OfflineRequestConfig = {
    affectedFields: options?.affectedFields,
    dependsOn: options?.dependsOn,
    disableOfflineQueue: options?.disableOfflineQueue,
  };

  const response = await OfflineApiClient.put<any>(url, data, config);
  const queued = isQueuedResponse(response);

  return {
    data: response.data?.data,
    queued,
  };
}

/**
 * Wrapper for making offline-aware PATCH requests.
 */
export async function offlinePatch<T = any>(
  url: string,
  data: any,
  options?: {
    affectedFields?: string[];
    dependsOn?: string;
    disableOfflineQueue?: boolean;
  }
): Promise<{ data: T; queued: boolean }> {
  const config: OfflineRequestConfig = {
    affectedFields: options?.affectedFields,
    dependsOn: options?.dependsOn,
    disableOfflineQueue: options?.disableOfflineQueue,
  };

  const response = await OfflineApiClient.patch<any>(url, data, config);
  const queued = isQueuedResponse(response);

  return {
    data: response.data?.data,
    queued,
  };
}

/**
 * Wrapper for making offline-aware DELETE requests.
 */
export async function offlineDelete<T = any>(
  url: string,
  options?: {
    affectedFields?: string[];
    dependsOn?: string;
    disableOfflineQueue?: boolean;
  }
): Promise<{ data: T; queued: boolean }> {
  const config: OfflineRequestConfig = {
    affectedFields: options?.affectedFields,
    dependsOn: options?.dependsOn,
    disableOfflineQueue: options?.disableOfflineQueue,
  };

  const response = await OfflineApiClient.delete<any>(url, config);
  const queued = isQueuedResponse(response);

  return {
    data: response.data?.data,
    queued,
  };
}

/**
 * Show a user-friendly message for queued operations.
 */
export function getQueuedMessage(queued: boolean): string {
  if (queued) {
    return 'Operation saved and will sync when online.';
  }
  return '';
}

/**
 * Check if currently online.
 */
export function isOnline(): boolean {
  return SyncManager.isOnline();
}

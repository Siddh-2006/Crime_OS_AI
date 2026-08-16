/**
 * Offline-aware API Client
 * 
 * Wraps the existing apiClient with offline-first capabilities.
 * Automatically queues mutations when offline and retrieves from cache.
 */

import apiClient from '@/lib/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { OutboxManager } from './outbox';
import { CaseCacheManager } from './caseCache';
import { SyncManager } from './sync';
import { OfflineToastNotifier } from './toastNotifier';

export interface OfflineRequestConfig extends AxiosRequestConfig {
  // Optional: specify fields affected by this mutation for LWW
  affectedFields?: string[];
  
  // Optional: specify operation this depends on
  dependsOn?: string;
  
  // Optional: disable offline queueing for this request
  disableOfflineQueue?: boolean;
}

export class OfflineApiClient {
  /**
   * Make an API request with offline support.
   * 
   * For GET requests:
   * - Tries online API first
   * - Falls back to cache if offline and data is cached
   * 
   * For mutations (POST/PUT/PATCH/DELETE):
   * - Tries online API first
   * - Queues in outbox if offline
   * - Returns optimistic response
   */
  static async request<T = any>(
    config: OfflineRequestConfig
  ): Promise<AxiosResponse<T>> {
    const isOnline = SyncManager.isOnline();
    const method = (config.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // For GET requests or when online, try the API first
    if (!isMutation || isOnline) {
      try {
        const response = await apiClient.request<T>(config);
        return response;
      } catch (error: any) {
        // If GET request failed and offline, try cache
        if (!isMutation && !isOnline) {
          console.log('[OfflineApiClient] Online request failed, trying cache...');
          return this.tryGetFromCache<T>(config);
        }
        
        // For mutations, if offline or network error, queue it
        if (isMutation && (!isOnline || error.code === 'ERR_NETWORK')) {
          console.log('[OfflineApiClient] Request failed, queueing for later...');
          return this.queueMutation<T>(config);
        }
        
        throw error;
      }
    }

    // Offline mutations - queue them
    if (isMutation && !config.disableOfflineQueue) {
      return this.queueMutation<T>(config);
    }

    // Offline GET request - try cache
    return this.tryGetFromCache<T>(config);
  }

  /**
   * Queue a mutation for later execution.
   */
  private static async queueMutation<T>(config: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      throw new Error('User not authenticated');
    }

    const user = JSON.parse(userStr);
    const officer_id = user._id;

    // Extract case_id from URL (e.g., /cases/{case_id}/...)
    const caseIdMatch = config.url?.match(/\/cases\/([^\/]+)/);
    const case_id = caseIdMatch ? caseIdMatch[1] : '';

    const operationId = await OutboxManager.queueMutation(officer_id, case_id, {
      method: config.method as any,
      endpoint: config.url || '',
      payload: config.data,
      affected_fields: config.affectedFields,
      depends_on: config.dependsOn,
    });

    // Trigger sync check
    SyncManager.checkAndSync(officer_id);

    // Show toast notification
    const operationType = this.getOperationTypeLabel(config.method as string, config.url || '');
    OfflineToastNotifier.showQueued(operationType);

    console.log(`[OfflineApiClient] Mutation queued: ${config.method} ${config.url}`);

    // Return optimistic success response that mimics server response
    return {
      data: {
        success: true,
        message: 'Operation queued for synchronization',
        data: { operationId, queued: true },
      } as any,
      status: 202, // Accepted
      statusText: 'Queued',
      headers: {},
      config: config as any,
    };
  }

  /**
   * Get user-friendly label for operation type.
   */
  private static getOperationTypeLabel(method: string, url: string): string {
    if (url.includes('/participants')) return 'Participant update';
    if (url.includes('/diary')) return 'Diary entry';
    if (url.includes('/evidence')) return 'Evidence update';
    if (url.includes('/checklist')) return 'Checklist update';
    if (url.includes('/warrants')) return 'Warrant update';
    if (url.includes('/requests')) return 'Request';
    
    switch (method.toUpperCase()) {
      case 'POST': return 'New entry';
      case 'PUT':
      case 'PATCH': return 'Update';
      case 'DELETE': return 'Deletion';
      default: return 'Change';
    }
  }

  /**
   * Try to retrieve data from cache.
   */
  private static async tryGetFromCache<T>(config: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      throw new Error('User not authenticated');
    }

    const user = JSON.parse(userStr);
    const officer_id = user._id;
    const role: string | undefined = user.role;

    if (!role) {
      throw new Error('User role not available for cache retrieval');
    }

    // Extract case_id from URL
    const caseIdMatch = config.url?.match(/\/cases\/([^\/]+)/);
    const complaintIdMatch = config.url?.match(/\/complaints\/([^\/]+)/);
    const caseUnderstandingMatch = config.url?.match(/\/case-understanding\/([^\/]+)/);
    
    const case_id = caseIdMatch?.[1] || complaintIdMatch?.[1] || caseUnderstandingMatch?.[1];
    
    if (!case_id) {
      throw new Error('No cached data available offline');
    }

    // Always pass role explicitly — never re-read from localStorage later
    const cachedCase = await CaseCacheManager.getCase(case_id, officer_id, role);

    if (!cachedCase) {
      throw new Error(`Case not cached for offline access (${role})`);
    }

    // Map API endpoints to cached data
    let data: any = null;
    const url = config.url || '';

    if (url.includes('/analysis/latest') || url.includes('/analysis')) {
      data = cachedCase.snapshot;
    } else if (url.includes('/checklist')) {
      data = cachedCase.checklist;
    } else if (url.includes('/diary/history')) {
      data = cachedCase.diaryHistory;
    } else if (url.includes('/diary/places') || url.includes('/places')) {
      data = cachedCase.placesVisited;
    } else if (url.includes('/diary')) {
      data = cachedCase.diaryEntries;
    } else if (url.includes('/requests')) {
      data = cachedCase.requests;
    } else if (url.includes('/evidence')) {
      data = cachedCase.evidence;
    } else if (url.includes('/participants')) {
      data = cachedCase.participants;
    } else if (url.includes('/warrants')) {
      data = cachedCase.warrants;
    } else if (url.includes('/threads')) {
      data = cachedCase.threads;
    } else if (url.includes('/room')) {
      data = cachedCase.roomMessages;
    } else if (url.includes('/graph')) {
      data = cachedCase.graph;
    } else if (url.includes('/departments')) {
      data = cachedCase.departments;
    } else if (url.includes('/complaints/') || complaintIdMatch) {
      data = cachedCase.complaintData;
    } else if (url.includes('/case-understanding/') || caseUnderstandingMatch) {
      data = cachedCase.caseUnderstanding;
    } else if (url.includes('/ai-case-understanding') || url.includes('/case-understanding/ai')) {
      data = cachedCase.aiCaseUnderstanding;
    } else if (url.includes('/audit-timeline') || url.includes('/timeline') || url.includes('/audit')) {
      data = cachedCase.auditTimeline;
    } else {
      // Try to match any part of the URL to cached data
      console.warn(`[OfflineApiClient] No exact cache mapping for URL: ${url}`);
      throw new Error('Requested endpoint not available in cache');
    }

    if (data === null || data === undefined) {
      console.warn(`[OfflineApiClient] Data is null/undefined for URL: ${url}`);
      throw new Error('Requested data not available in cache');
    }

    console.log(`[OfflineApiClient] Retrieved from cache: ${url}`);

    return {
      data: {
        success: true,
        message: 'Data retrieved from cache',
        data,
      } as any,
      status: 200,
      statusText: 'OK (Cached)',
      headers: {},
      config: config as any,
    };
  }

  /**
   * Convenience methods matching axios API
   */
  static async get<T = any>(url: string, config?: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  static async post<T = any>(url: string, data?: any, config?: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  static async put<T = any>(url: string, data?: any, config?: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  static async patch<T = any>(url: string, data?: any, config?: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  static async delete<T = any>(url: string, config?: OfflineRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }
}

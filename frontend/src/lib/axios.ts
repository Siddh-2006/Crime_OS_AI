import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_ROUTES } from './constants';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: AxiosError) => void;
}> = [];

function processQueue(error: AxiosError | null, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

/**
 * Check if we should attempt offline fallback for this request.
 */
function shouldUseOfflineFallback(url?: string): boolean {
  if (!url) return false;
  
  // Only use offline fallback for GET requests to case-related endpoints
  return (
    url.includes('/cases/') &&
    (url.includes('/analysis') ||
      url.includes('/checklist') ||
      url.includes('/diary') ||
      url.includes('/requests') ||
      url.includes('/evidence') ||
      url.includes('/participants') ||
      url.includes('/warrants') ||
      url.includes('/threads') ||
      url.includes('/room') ||
      url.includes('/graph') ||
      url.includes('/departments'))
  ) || url.includes('/complaints/') || url.includes('/case-understanding/');
}

/**
 * Configured Axios instance with:
 * - Automatic access token attachment from localStorage
 * - Transparent refresh token rotation on 401
 * - Credentials (cookies) enabled for refresh token
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes timeout for multimodal AI processing
});

// ─── Request interceptor — attach access token ────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response interceptor — silent refresh on 401 + auto-cache on success ─────
apiClient.interceptors.response.use(
  async (response) => {
    // Auto-cache successful GET responses for case-related endpoints
    if (
      response.config.method?.toUpperCase() === 'GET' &&
      shouldUseOfflineFallback(response.config.url) &&
      response.status === 200 &&
      typeof window !== 'undefined'
    ) {
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          const officer_id = user._id;
          const role: string | undefined = user.role;

          // Both officer_id and role must be present — no fallback
          if (!officer_id || !role) {
            console.warn('[apiClient] Missing officer_id or role, skipping cache');
            return response;
          }
          
          const { CaseCacheManager } = await import('./offline/caseCache');
          
          // Extract case_id
          const caseIdMatch = response.config.url?.match(/\/cases\/([^\/]+)/);
          const complaintIdMatch = response.config.url?.match(/\/complaints\/([^\/]+)/);
          const caseUnderstandingMatch = response.config.url?.match(/\/case-understanding\/([^\/]+)/);
          const case_id = caseIdMatch?.[1] || complaintIdMatch?.[1] || caseUnderstandingMatch?.[1];
          
          if (case_id) {
            // Get existing cache or create new — always pass role explicitly
            const existingCache = await CaseCacheManager.getCase(case_id, officer_id, role);
            
            const url = response.config.url || '';
            const data = response.data?.data || response.data;
            
            // Update the appropriate field in cache
            const updates: any = {};
            
            if (url.includes('/analysis')) updates.snapshot = data;
            else if (url.includes('/checklist')) updates.checklist = data;
            else if (url.includes('/diary/history')) updates.diaryHistory = Array.isArray(data) ? data : [];
            else if (url.includes('/diary/places')) updates.placesVisited = Array.isArray(data) ? data : [];
            else if (url.includes('/diary')) updates.diaryEntries = Array.isArray(data) ? data : [];
            else if (url.includes('/requests')) updates.requests = data || [];
            else if (url.includes('/evidence')) updates.evidence = data || [];
            else if (url.includes('/participants')) updates.participants = Array.isArray(data) ? data : [];
            else if (url.includes('/warrants')) updates.warrants = Array.isArray(data) ? data : [];
            else if (url.includes('/threads')) updates.threads = data || [];
            else if (url.includes('/room')) updates.roomMessages = data || [];
            else if (url.includes('/graph')) updates.graph = data || null;
            else if (url.includes('/departments')) updates.departments = data || [];
            else if (complaintIdMatch) updates.complaintData = data;
            else if (caseUnderstandingMatch) updates.caseUnderstanding = data;
            // SHO-specific tabs
            else if (url.includes('/ai-case-understanding') || url.includes('/case-understanding/ai')) updates.aiCaseUnderstanding = data;
            else if (url.includes('/audit-timeline') || url.includes('/timeline') || url.includes('/audit')) updates.auditTimeline = data;
            
            if (Object.keys(updates).length > 0) {
              if (existingCache) {
                await CaseCacheManager.updateCaseFields(case_id, officer_id, role, updates);
                console.log(`[apiClient] ✓ Auto-cached (${role}): ${url.split('/').pop()}`);
              } else {
                const newCache = {
                  snapshot: null, checklist: null,
                  diaryEntries: [], diaryHistory: [], placesVisited: [],
                  requests: [], evidence: [], participants: [],
                  warrants: [], threads: [],
                  complaintData: null, caseUnderstanding: null,
                  aiCaseUnderstanding: null, auditTimeline: null,
                  ...updates,
                };
                await CaseCacheManager.saveCase(case_id, officer_id, role, newCache);
                console.log(`[apiClient] ✓ Created cache (${role}): ${url.split('/').pop()}`);
              }
            }
          }
        }
      } catch (error) {
        // Cache error shouldn't break the response
        console.error('[apiClient] Cache save failed:', error);
      }
    }
    
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _offlineRetry?: boolean };

    const isPublicAuthRoute =
      originalRequest.url?.includes(API_ROUTES.AUTH.LOGIN) ||
      originalRequest.url?.includes(API_ROUTES.POLICE.LOGIN) ||
      originalRequest.url?.includes(API_ROUTES.ADMIN.LOGIN) ||
      originalRequest.url?.includes(API_ROUTES.AUTH.REGISTER) ||
      originalRequest.url?.includes(API_ROUTES.AUTH.VERIFY_EMAIL) ||
      originalRequest.url?.includes(API_ROUTES.AUTH.RESEND_OTP) ||
      originalRequest.url?.includes(API_ROUTES.AUTH.FORGOT_PASSWORD) ||
      originalRequest.url?.includes(API_ROUTES.AUTH.RESET_PASSWORD) ||
      originalRequest.url?.includes(API_ROUTES.AUTH.REFRESH_TOKEN);

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isPublicAuthRoute
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers!.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await apiClient.post<{ data: { accessToken: string } }>(
          API_ROUTES.AUTH.REFRESH_TOKEN,
        );
        const newToken = response.data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        originalRequest.headers!.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        // Clear auth state and redirect to login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Try offline fallback for network errors
    if (
      !originalRequest._offlineRetry &&
      (error.code === 'ERR_NETWORK' || !navigator.onLine) &&
      !isPublicAuthRoute
    ) {
      console.log(`[apiClient] ⚠️ Network error for ${originalRequest.method} ${originalRequest.url}`);
      console.log('[apiClient] Navigator online status:', navigator.onLine);
      console.log('[apiClient] Error code:', error.code);
      
      const method = originalRequest.method?.toUpperCase();
      
      // For GET requests, try cache
      if (method === 'GET' && shouldUseOfflineFallback(originalRequest.url)) {
        console.log('[apiClient] 📦 Attempting cache retrieval...');
        originalRequest._offlineRetry = true;
        const { OfflineApiClient } = await import('./offline/offlineApiClient');
        try {
          const result = await OfflineApiClient.request(originalRequest);
          console.log('[apiClient] ✓ Cache hit!');
          return result;
        } catch (offlineError) {
          console.error('[apiClient] ✗ Cache miss:', offlineError);
        }
      }
      
      // For mutations (POST/PUT/PATCH/DELETE), queue them
      if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        console.log('[apiClient] 📝 Queueing mutation for sync...');
        originalRequest._offlineRetry = true;
        const { OfflineApiClient } = await import('./offline/offlineApiClient');
        try {
          const result = await OfflineApiClient.request(originalRequest);
          console.log('[apiClient] ✓ Mutation queued');
          // Return success response indicating queued
          return result;
        } catch (offlineError) {
          console.error('[apiClient] ✗ Failed to queue mutation:', offlineError);
        }
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;

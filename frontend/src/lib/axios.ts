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

// ─── Response interceptor — silent refresh on 401 ─────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

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

    return Promise.reject(error);
  },
);

export default apiClient;

'use client';

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Cookies from 'js-cookie';
import apiClient from '@/lib/axios';
import { API_ROUTES, ROLE } from '@/lib/constants';
import type { AuthUser, ApiResponse, LoginResponse } from '@/lib/types';
import { CaseCacheManager, OutboxManager } from '@/lib/offline';

// ─── Context Shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginCitizen: (email: string, password: string) => Promise<void>;
  loginPolice: (email: string, password: string) => Promise<void>;
  loginAdmin: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * On mount — rehydrate auth state from localStorage if a token exists.
   * Silently verify the token by fetching the profile.
   */
  useEffect(() => {
    const rehydrate = async (): Promise<void> => {
      const token = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (!token) {
        setIsLoading(false);
        return;
      }

      // Optimistically set user from cache while we verify
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser) as AuthUser);
        } catch {
          // ignore parse errors
        }
      }

      try {
        const cachedUser = storedUser ? (JSON.parse(storedUser) as AuthUser) : null;
        const isPolice =
          cachedUser?.role === ROLE.SHO || cachedUser?.role === ROLE.IO;
        const isAdmin = cachedUser?.role === ROLE.ADMIN;

        let endpoint: string = API_ROUTES.AUTH.ME;
        if (isPolice) {
          endpoint = API_ROUTES.POLICE.ME;
        } else if (isAdmin) {
          endpoint = API_ROUTES.ADMIN.ME;
        }

        const response = await apiClient.get<ApiResponse<AuthUser>>(endpoint);

        if (response.data.success && response.data.data) {
          setUser(response.data.data);
          localStorage.setItem('user', JSON.stringify(response.data.data));
        }
      } catch {
        // Token is invalid — clear storage (interceptor handles redirect)
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        Cookies.remove('role', { path: '/' });
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    rehydrate();
  }, []);

  const loginCitizen = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(API_ROUTES.AUTH.LOGIN, {
      email,
      password,
    });

    const { accessToken, user: citizenUser } = response.data.data!;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify({ ...citizenUser, role: ROLE.USER }));
    Cookies.set('role', ROLE.USER, { path: '/', sameSite: 'strict', expires: 7 });
    setUser({ ...citizenUser!, role: ROLE.USER });
  }, []);

  const loginPolice = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(API_ROUTES.POLICE.LOGIN, {
      email,
      password,
    });

    const { accessToken, officer } = response.data.data!;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(officer));
    Cookies.set('role', officer!.role, { path: '/', sameSite: 'strict', expires: 7 });
    setUser(officer!);
  }, []);

  const loginAdmin = useCallback(async (username: string, password: string): Promise<void> => {
    const response = await apiClient.post<ApiResponse<{ accessToken: string; admin: AuthUser }>>(
      API_ROUTES.ADMIN.LOGIN,
      { username, password }
    );

    const { accessToken, admin } = response.data.data!;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify({ ...admin, role: ROLE.ADMIN }));
    Cookies.set('role', ROLE.ADMIN, { path: '/', sameSite: 'strict', expires: 7 });
    setUser({ ...admin, role: ROLE.ADMIN });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const isPolice = user?.role === ROLE.SHO || user?.role === ROLE.IO;
    const isAdmin = user?.role === ROLE.ADMIN;
    
    let endpoint: string = API_ROUTES.AUTH.LOGOUT;
    if (isPolice) {
      endpoint = API_ROUTES.POLICE.LOGOUT;
    } else if (isAdmin) {
      endpoint = API_ROUTES.ADMIN.LOGOUT;
    }

    // Try to sync one last time before clearing caches
    if (isPolice && user?._id && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        console.log('[Auth] Attempting pre-logout sync...');
        await OutboxManager.processPendingOperations(user._id);
      } catch (error) {
        console.error('[Auth] Pre-logout sync failed:', error);
      }
    }

    try {
      await apiClient.post(endpoint);
    } catch {
      // Proceed with local cleanup even if server logout fails
    } finally {
      // Clear offline data for this officer
      if (user?._id && isPolice) {
        try {
          await CaseCacheManager.clearCachesForOfficer(user._id);
          await OutboxManager.clearOutboxForOfficer(user._id);
        } catch (error) {
          console.error('Failed to clear offline data:', error);
        }
      }
      
      // Clear Service Worker Caches to prevent cross-role data leaks
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map(key => caches.delete(key)));
          console.log('[Auth] Cleared Service Worker caches');
        } catch (error) {
          console.error('[Auth] Failed to clear Service Worker caches:', error);
        }
      }

      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      Cookies.remove('role', { path: '/' });
      setUser(null);
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      loginCitizen,
      loginPolice,
      loginAdmin,
      logout,
    }),
    [user, isLoading, loginCitizen, loginPolice, loginAdmin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

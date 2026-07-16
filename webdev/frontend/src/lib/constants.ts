/**
 * Strongly-typed API endpoint constants.
 * Single source of truth — update here, not scattered across components.
 */
export const API_ROUTES = {
  AUTH: {
    REGISTER: '/auth/register',
    VERIFY_EMAIL: '/auth/verify-email',
    RESEND_OTP: '/auth/resend-otp',
    LOGIN: '/auth/login',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    REFRESH_TOKEN: '/auth/refresh-token',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  POLICE: {
    LOGIN: '/police/login',
    LOGOUT: '/police/logout',
    ME: '/police/me',
  },
  ADMIN: {
    LOGIN: '/admin/login',
    LOGOUT: '/admin/logout',
    ME: '/admin/me',
    STATIONS: '/admin/police-stations',
    OFFICERS: '/admin/officers',
  },
  COMPLAINTS: {
    CREATE: '/complaints',
    LIST: '/complaints',
    DETAIL: (id: string) => `/complaints/${id}`,
    UPLOAD_SIGNATURE: '/complaints/upload-signature',
    STATIONS_SEARCH: '/police-stations/search',
    STATION_LIST: '/complaints/station/list',
    APPROVE: (id: string) => `/complaints/${id}/approve`,
    REJECT: (id: string) => `/complaints/${id}/reject`,
    UPDATE: (id: string) => `/complaints/${id}/update`,
    REGISTER_FIR: (id: string) => `/complaints/${id}/register-fir`,
  },
} as const;

export const APP_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  VERIFY_EMAIL: '/verify-email',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/dashboard',
  POLICE_DASHBOARD: '/police/dashboard',
  ADMIN_LOGIN: '/admin/login',
  ADMIN_DASHBOARD: '/admin/dashboard',
  FILE_COMPLAINT: '/dashboard/complaints/new',
  MY_COMPLAINTS: '/dashboard/complaints',
  COMPLAINT_DETAIL: (id: string) => `/dashboard/complaints/${id}`,
  POLICE_COMPLAINTS: '/police/dashboard/complaints',
  POLICE_COMPLAINT_DETAIL: (id: string) => `/police/dashboard/complaints/${id}`,
} as const;

export const ROLE = {
  USER: 'USER',
  SHO: 'SHO',
  IO: 'IO',
  ADMIN: 'ADMIN',
} as const;

export type RoleType = (typeof ROLE)[keyof typeof ROLE];

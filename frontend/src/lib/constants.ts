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
    IO_LIST: '/complaints/police/ios',
    UPLOAD_SIGNATURE: '/complaints/upload-signature',
    STATIONS_SEARCH: '/complaints/police-stations/search',
    STATION_LIST: '/complaints/station/list',
    APPROVE: (id: string) => `/complaints/${id}/approve`,
    REJECT: (id: string) => `/complaints/${id}/reject`,
    UPDATE: (id: string) => `/complaints/${id}/update`,
    REGISTER_FIR: (id: string) => `/complaints/${id}/register-fir`,
  },
  CASES: {
    PARTICIPANTS: (id: string) => `/cases/${id}/participants`,
    APPROVE_PARTICIPANT_RECOMMENDATION: (id: string) => `/cases/${id}/participants/recommendations/approve`,
    ATTACH_PARTICIPANT_SECTIONS: (id: string, participantId: string) => `/cases/${id}/participants/${participantId}/sections/attach`,
  },
  CASE_UNDERSTANDING: {
    ANALYZE: '/case-understanding/analyze',
    SUBMIT_CASE: '/case-understanding/submit-case',
    DETAIL: (id: string) => `/case-understanding/${id}`,
    OVERVIEW: (id: string) => `/case-understanding/${id}/overview`,
    TIMELINE: (id: string) => `/case-understanding/${id}/timeline`,
    ENTITIES: (id: string) => `/case-understanding/${id}/entities`,
    EVIDENCE: (id: string) => `/case-understanding/${id}/evidence`,
    CORRELATION: (id: string) => `/case-understanding/${id}/evidence-correlation`,
    CRIME_ANALYSIS: (id: string) => `/case-understanding/${id}/crime-analysis`,
    CONTRADICTIONS: (id: string) => `/case-understanding/${id}/contradictions`,
    MISSING_INFO: (id: string) => `/case-understanding/${id}/missing-information`,
    MISSING_EVIDENCE: (id: string) => `/case-understanding/${id}/missing-evidence`,
  },
  TRANSLATION: {
    BATCH: '/translation/batch',
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
  ADMIN_DEPARTMENTS: '/admin/departments',
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

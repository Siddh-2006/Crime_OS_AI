import { RoleType } from '@/lib/constants';

export interface AuthUser {
  _id: string;
  firstName?: string;
  lastName?: string;
  officerName?: string;
  email: string;
  role: RoleType;
  isEmailVerified?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: unknown;
}

export interface LoginResponse {
  accessToken: string;
  user?: AuthUser;
  officer?: AuthUser;
}

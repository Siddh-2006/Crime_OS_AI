/**
 * Re-export the configured Axios instance as `apiClient`.
 * This alias exists so both `@/lib/axios` and `@/lib/apiClient` resolve
 * to the same singleton instance (interceptors, base URL, credentials).
 */
export { default } from './axios';

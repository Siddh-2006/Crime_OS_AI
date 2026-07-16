/**
 * Redis key prefixes for all namespaced keys.
 * Centralised to avoid typos and key collisions.
 */
export const REDIS_KEYS = {
  REFRESH_TOKEN:        (userId: string) => `refresh_token:${userId}`,
  OTP_EMAIL_VERIFY:     (email: string)  => `otp:email_verify:${email}`,
  OTP_FORGOT_PASSWORD:  (email: string)  => `otp:forgot_password:${email}`,
  POLICE_STATIONS_LIST: 'cache:police_stations',
} as const;

export const REDIS_TTL = {
  REFRESH_TOKEN:    60 * 60 * 24 * 7,  // 7 days
  OTP:              60 * 5,             // 5 minutes
  POLICE_STATIONS:  60 * 60 * 24,       // 24 hours
} as const;

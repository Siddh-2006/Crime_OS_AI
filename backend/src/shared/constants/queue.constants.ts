/**
 * BullMQ queue names.
 * Centralised to ensure consistency between producers and workers.
 */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  FIR:   'fir',
} as const;

/**
 * BullMQ job names within the email queue.
 */
export const EMAIL_JOB_NAMES = {
  SEND_EMAIL_VERIFICATION_OTP:  'send_email_verification_otp',
  SEND_FORGOT_PASSWORD_OTP:     'send_forgot_password_otp',
  SEND_WELCOME:                 'send_welcome',
  SEND_COMPLAINT_REJECTION:     'send_complaint_rejection',
  SEND_FIR_REGISTERED:          'send_fir_registered',
} as const;

/**
 * BullMQ job names within the FIR queue.
 */
export const FIR_JOB_NAMES = {
  GENERATE_FIR_PDF: 'generate_fir_pdf',
} as const;

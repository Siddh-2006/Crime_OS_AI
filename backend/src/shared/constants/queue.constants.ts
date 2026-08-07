/**
 * BullMQ queue names.
 * Centralised to ensure consistency between producers and workers.
 */
export const QUEUE_NAMES = {
  EMAIL:      'email',
  FIR:        'fir',
  ANALYSIS:   'analysis',
  GMAIL_POLL: 'gmail-poll',
  CASE_DIARY: 'case-diary',
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
  SEND_DEPARTMENT_REQUEST:      'send_department_request',
  SEND_CITIZEN_REQUEST:         'send_citizen_request',
  SEND_ESCALATION:              'send_escalation',
} as const;

/**
 * BullMQ job names within the FIR queue.
 */
export const FIR_JOB_NAMES = {
  GENERATE_FIR_PDF: 'generate_fir_pdf',
} as const;

/**
 * BullMQ job names within the analysis queue.
 */
export const ANALYSIS_JOB_NAMES = {
  ANALYZE_CASE: 'analyze_case',
} as const;

export const CASE_DIARY_JOB_NAMES = {
  GENERATE_PDF: 'generate_case_diary_pdf',
} as const;

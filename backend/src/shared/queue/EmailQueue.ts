import { createQueue } from '../../config/bullmq';
import { QUEUE_NAMES, EMAIL_JOB_NAMES } from '../constants/queue.constants';
import type {
  OtpEmailPayload,
  WelcomeEmailPayload,
  ComplaintRejectionEmailPayload,
  FirRegisteredEmailPayload,
  DepartmentRequestEmailPayload,
  CitizenRequestEmailPayload,
  EscalationEmailPayload,
} from '../services/email/EmailService';

export type EmailJobData =
  | { type: typeof EMAIL_JOB_NAMES.SEND_EMAIL_VERIFICATION_OTP; payload: OtpEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_FORGOT_PASSWORD_OTP;    payload: OtpEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_WELCOME;                payload: WelcomeEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_COMPLAINT_REJECTION;    payload: ComplaintRejectionEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_FIR_REGISTERED;         payload: FirRegisteredEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_DEPARTMENT_REQUEST;     payload: DepartmentRequestEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_CITIZEN_REQUEST;        payload: CitizenRequestEmailPayload }
  | { type: typeof EMAIL_JOB_NAMES.SEND_ESCALATION;             payload: EscalationEmailPayload };

const emailQueue = createQueue<EmailJobData>(QUEUE_NAMES.EMAIL);

/**
 * Email queue producer.
 * Enqueues email jobs to be processed asynchronously by the EmailWorker.
 * Controllers and services call these methods — never Nodemailer directly.
 */
export class EmailQueue {
  static async enqueueVerificationOtp(payload: OtpEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_EMAIL_VERIFICATION_OTP, {
      type: EMAIL_JOB_NAMES.SEND_EMAIL_VERIFICATION_OTP,
      payload,
    });
  }

  static async enqueueForgotPasswordOtp(payload: OtpEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_FORGOT_PASSWORD_OTP, {
      type: EMAIL_JOB_NAMES.SEND_FORGOT_PASSWORD_OTP,
      payload,
    });
  }

  static async enqueueWelcomeEmail(payload: WelcomeEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_WELCOME, {
      type: EMAIL_JOB_NAMES.SEND_WELCOME,
      payload,
    });
  }

  static async enqueueComplaintRejectionEmail(payload: ComplaintRejectionEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_COMPLAINT_REJECTION, {
      type: EMAIL_JOB_NAMES.SEND_COMPLAINT_REJECTION,
      payload,
    });
  }

  static async enqueueFirRegisteredEmail(payload: FirRegisteredEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_FIR_REGISTERED, {
      type: EMAIL_JOB_NAMES.SEND_FIR_REGISTERED,
      payload,
    });
  }

  static async enqueueDepartmentRequest(payload: DepartmentRequestEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_DEPARTMENT_REQUEST, {
      type: EMAIL_JOB_NAMES.SEND_DEPARTMENT_REQUEST,
      payload,
    });
  }

  static async enqueueCitizenRequest(payload: CitizenRequestEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_CITIZEN_REQUEST, {
      type: EMAIL_JOB_NAMES.SEND_CITIZEN_REQUEST,
      payload,
    });
  }

  static async enqueueEscalationEmail(payload: EscalationEmailPayload): Promise<void> {
    await emailQueue.add(EMAIL_JOB_NAMES.SEND_ESCALATION, {
      type: EMAIL_JOB_NAMES.SEND_ESCALATION,
      payload,
    });
  }
}

import { Job } from 'bullmq';
import { createWorker } from '../../config/bullmq';
import { QUEUE_NAMES, EMAIL_JOB_NAMES } from '../constants/queue.constants';
import { EmailService } from '../services/email/EmailService';
import { NodemailerProvider } from '../services/email/NodemailerProvider';
import type { EmailJobData } from './EmailQueue';
import logger from '../../config/logger';

// Wire up the concrete provider here — this is the ONLY place Nodemailer is referenced outside its class
const emailService = new EmailService(new NodemailerProvider());

/**
 * BullMQ worker that processes email jobs from the email queue.
 * Dispatches to EmailService based on job type.
 * Never import or call this from routes/controllers — it is started once in server.ts.
 */
export function startEmailWorker(): void {
  createWorker<EmailJobData>(QUEUE_NAMES.EMAIL, async (job: Job<EmailJobData>) => {
    const { type, payload } = job.data;

    switch (type) {
      case EMAIL_JOB_NAMES.SEND_EMAIL_VERIFICATION_OTP:
        await emailService.sendEmailVerificationOtp(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_FORGOT_PASSWORD_OTP:
        await emailService.sendForgotPasswordOtp(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_WELCOME:
        await emailService.sendWelcomeEmail(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_COMPLAINT_REJECTION:
        await emailService.sendComplaintRejectionEmail(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_FIR_REGISTERED:
        await emailService.sendFirRegisteredEmail(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_DEPARTMENT_REQUEST:
        await emailService.sendDepartmentRequestEmail(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_CITIZEN_REQUEST:
        await emailService.sendCitizenRequestEmail(payload);
        break;

      case EMAIL_JOB_NAMES.SEND_ESCALATION:
        await emailService.sendEscalationEmail(payload);
        break;

      default:
        logger.warn('Unknown email job type received', { type });
    }
  });

  logger.info('Email worker started');
}

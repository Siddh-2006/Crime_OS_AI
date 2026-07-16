import { IEmailProvider } from './IEmailProvider';
import logger from '../../../config/logger';

export interface OtpEmailPayload {
  to: string;
  name: string;
  otp: string;
  expiryMinutes: number;
}

export interface WelcomeEmailPayload {
  to: string;
  name: string;
}

export interface ComplaintRejectionEmailPayload {
  to: string;
  name: string;
  complaintNumber: string;
  rejectionReason: string;
}

export interface FirRegisteredEmailPayload {
  to: string;
  name: string;
  complaintNumber: string;
  firNumber: string;
  firPdfUrl: string;
}

/**
 * High-level email service.
 * Uses IEmailProvider to send emails — agnostic to the underlying transport.
 * Add new email methods here (welcome, password-changed, etc.).
 */
export class EmailService {
  constructor(private readonly provider: IEmailProvider) {}

  async sendEmailVerificationOtp(payload: OtpEmailPayload): Promise<void> {
    logger.debug('Sending email verification OTP', { to: payload.to });
    await this.provider.sendMail({
      to: payload.to,
      subject: 'Verify your email — Crime OS Gujarat Police',
      html: this.buildOtpEmailHtml({
        name: payload.name,
        otp: payload.otp,
        expiryMinutes: payload.expiryMinutes,
        title: 'Email Verification',
        description: 'Use the OTP below to verify your email address.',
      }),
    });
  }

  async sendForgotPasswordOtp(payload: OtpEmailPayload): Promise<void> {
    logger.debug('Sending forgot password OTP', { to: payload.to });
    await this.provider.sendMail({
      to: payload.to,
      subject: 'Reset your password — Crime OS Gujarat Police',
      html: this.buildOtpEmailHtml({
        name: payload.name,
        otp: payload.otp,
        expiryMinutes: payload.expiryMinutes,
        title: 'Password Reset',
        description: 'Use the OTP below to reset your password.',
      }),
    });
  }

  async sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<void> {
    logger.debug('Sending welcome email', { to: payload.to });
    await this.provider.sendMail({
      to: payload.to,
      subject: 'Welcome to Crime OS — Gujarat Police',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
          </div>
          <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1a237e;">Welcome, ${payload.name}!</h2>
            <p style="color: #333;">Your account has been verified. You can now use the Crime OS portal to file complaints and track their status.</p>
            <p style="color: #666; font-size: 12px; margin-top: 32px;">Gujarat Police — Serving with Integrity</p>
          </div>
        </body>
        </html>
      `,
    });
  }

  async sendComplaintRejectionEmail(payload: ComplaintRejectionEmailPayload): Promise<void> {
    logger.debug('Sending complaint rejection email', { to: payload.to, complaintNumber: payload.complaintNumber });
    await this.provider.sendMail({
      to: payload.to,
      subject: `Complaint ${payload.complaintNumber} — Update from Gujarat Police`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
          </div>
          <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #c62828;">Complaint Update</h2>
            <p style="color: #333;">Dear ${payload.name},</p>
            <p style="color: #333;">After reviewing your complaint <strong>${payload.complaintNumber}</strong>, the Station House Officer has determined that the complaint cannot be progressed at this time.</p>
            <div style="background: #fff3f3; border-left: 4px solid #c62828; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; font-weight: bold; color: #c62828;">Reason for Rejection:</p>
              <p style="margin: 8px 0 0; color: #333;">${payload.rejectionReason}</p>
            </div>
            <p style="color: #555;">If you believe this decision is incorrect, you may visit your nearest police station with supporting evidence, or contact the District Superintendent of Police.</p>
            <p style="color: #666; font-size: 12px; margin-top: 32px;">Gujarat Police — Serving with Integrity</p>
          </div>
        </body>
        </html>
      `,
    });
  }

  async sendFirRegisteredEmail(payload: FirRegisteredEmailPayload): Promise<void> {
    logger.debug('Sending FIR registered email', { to: payload.to, firNumber: payload.firNumber });
    await this.provider.sendMail({
      to: payload.to,
      subject: `FIR Registered — ${payload.firNumber} | Gujarat Police`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
          </div>
          <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1a237e;">FIR Successfully Registered</h2>
            <p style="color: #333;">Dear ${payload.name},</p>
            <p style="color: #333;">Your First Information Report (FIR) has been officially registered. Please keep this information for your records.</p>
            <div style="background: white; border: 2px solid #1a237e; border-radius: 8px; padding: 20px; margin: 16px 0;">
              <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">FIR Number</p>
              <p style="margin: 4px 0 12px; font-size: 22px; font-weight: bold; color: #1a237e;">${payload.firNumber}</p>
              <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Complaint Number</p>
              <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #333;">${payload.complaintNumber}</p>
            </div>
            <p style="color: #333;">Your FIR copy is available for download from the Crime OS portal. You can also access it using the button below.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${payload.firPdfUrl}" style="background: #1a237e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Download FIR Copy</a>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 32px;">Gujarat Police — Serving with Integrity | This is a system-generated email.</p>
          </div>
        </body>
        </html>
      `,
    });
  }

  private buildOtpEmailHtml(opts: {
    name: string;
    otp: string;
    expiryMinutes: number;
    title: string;
    description: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
        </div>
        <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1a237e;">${opts.title}</h2>
          <p style="color: #333;">Dear ${opts.name},</p>
          <p style="color: #333;">${opts.description}</p>
          <div style="background: white; border: 2px dashed #1a237e; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <p style="margin: 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 2px;">One-Time Password</p>
            <p style="margin: 8px 0 0; font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #1a237e;">${opts.otp}</p>
          </div>
          <p style="color: #d32f2f; font-size: 13px;">⚠️ This OTP expires in ${opts.expiryMinutes} minutes. Do not share it with anyone.</p>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">Gujarat Police — Serving with Integrity</p>
        </div>
      </body>
      </html>
    `;
  }
}

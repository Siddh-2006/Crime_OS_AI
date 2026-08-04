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

export interface DepartmentRequestEmailPayload {
  to: string;
  departmentName: string;
  caseId: string;
  requestId: string;
  content: string;
  attachments?: { filename: string; url: string }[];
}

export interface CitizenRequestEmailPayload {
  to: string;
  name: string;
  caseId: string;
  requestId: string;
  content: string;
  attachments?: { filename: string; url: string }[];
}

export interface EscalationEmailPayload {
  to: string;
  caseId: string;
  escalationId: string;
  reason: string;
  summary: string;
}

export interface EvidenceUploadNoticeEmailPayload {
  to: string;
  complainantName: string;
  uploadUrl: string;
  qrCodeBase64?: string;
  suggestedEvidence: string[];
}

/**
 * High-level email service.
 * Uses IEmailProvider to send emails — agnostic to the underlying transport.
 * Add new email methods here (welcome, password-changed, etc.).
 */
export class EmailService {
  constructor(private readonly provider: IEmailProvider) {}

  async sendEmailVerificationOtp(payload: OtpEmailPayload): Promise<void> {
    logger.info(`[DEVELOPMENT] Email verification OTP for ${payload.to}: ${payload.otp}`);
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
    logger.info(`[DEVELOPMENT] Forgot password OTP for ${payload.to}: ${payload.otp}`);
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

  async sendDepartmentRequestEmail(payload: DepartmentRequestEmailPayload): Promise<void> {
    logger.debug('Sending department request email', { to: payload.to, requestId: payload.requestId });
    await this.provider.sendMail({
      to:      payload.to,
      subject: `Official Request - Case ${payload.caseId} | Gujarat Police`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
          </div>
          <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1a237e;">Official Request to ${payload.departmentName}</h2>
            <div style="background: white; border: 1px solid #ccc; padding: 20px; white-space: pre-wrap; font-family: monospace;">${payload.content}</div>

            <!-- Reply instructions box -->
            <div style="background: #fff8e1; border: 2px solid #f9a825; border-radius: 8px; padding: 16px; margin-top: 24px;">
              <p style="margin: 0 0 8px; font-weight: bold; color: #e65100; font-size: 14px;">
                ⚠️ IMPORTANT — Reply Instructions
              </p>
              <p style="margin: 0 0 8px; color: #333; font-size: 13px;">
                When replying to this email, you <strong>MUST</strong> include the following lines
                at the very beginning of your reply body (before any other content):
              </p>
              <div style="background: #fff3e0; border: 1px dashed #fb8c00; padding: 10px 14px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #bf360c; font-weight: bold;">
                Complaint ID: ${payload.caseId}<br />
                Request ID: ${payload.requestId}<br />
                Reply Origin: department
              </div>
              <p style="margin: 8px 0 0; color: #555; font-size: 12px;">
                This line allows our system to automatically link your response to the correct case and request.
                Responses without these lines may not be processed automatically.
                You may attach documents, images, audio, or video files to your reply.
              </p>
            </div>

            <p style="color: #666; font-size: 12px; margin-top: 32px;">
              Gujarat Police — Serving with Integrity | This is a system-generated email.
            </p>
          </div>
        </body>
        </html>
      `,
      attachments: payload.attachments?.map(att => ({
        filename: att.filename,
        path: att.url,
      })),
    });
  }

  async sendCitizenRequestEmail(payload: CitizenRequestEmailPayload): Promise<void> {
    logger.debug('Sending citizen request email', { to: payload.to, caseId: payload.caseId });
    await this.provider.sendMail({
      to: payload.to,
      subject: `Information Required - Case ${payload.caseId} | Gujarat Police`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
          </div>
          <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1a237e;">Information Required for Case ${payload.caseId}</h2>
            <p>Dear ${payload.name},</p>
            <div style="background: white; border: 1px solid #ccc; padding: 20px; white-space: pre-wrap;">${payload.content}</div>
            <div style="background: #fff8e1; border: 2px solid #f9a825; border-radius: 8px; padding: 16px; margin-top: 24px;">
              <p style="margin: 0 0 8px; font-weight: bold; color: #e65100; font-size: 14px;">
                ⚠️ IMPORTANT — Include these lines at the very top of your reply:
              </p>
              <div style="background: #fff3e0; border: 1px dashed #fb8c00; padding: 10px 14px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #bf360c; font-weight: bold;">
                Complaint ID: ${payload.caseId}<br />
                Request ID: ${payload.requestId}<br />
                Reply Origin: complainant
              </div>
              <p style="margin: 8px 0 0; color: #555; font-size: 12px;">
                These lines let our system automatically link your response to the correct case.
                Attach any supporting documents directly to your reply.
              </p>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 32px;">Gujarat Police — Serving with Integrity | This is a system-generated email.</p>
          </div>
        </body>
        </html>
      `,
      attachments: payload.attachments?.map(att => ({
        filename: att.filename,
        path: att.url,
      })),
    });
  }

  async sendEscalationEmail(payload: EscalationEmailPayload): Promise<void> {
    logger.debug('Sending escalation email', { to: payload.to, escalationId: payload.escalationId });
    await this.provider.sendMail({
      to: payload.to,
      subject: `🚨 URGENT: Escalation for Case ${payload.caseId} | Gujarat Police`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: #c62828; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS Escalation</h1>
          </div>
          <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #c62828;">Case Escalated: ${payload.caseId}</h2>
            <p><strong>Reason:</strong> ${payload.reason}</p>
            <div style="background: white; border: 1px solid #c62828; padding: 20px; white-space: pre-wrap;">${payload.summary}</div>
            <p style="color: #666; font-size: 12px; margin-top: 32px;">System-generated escalation alert.</p>
          </div>
        </body>
        </html>
      `,
    });
  }

  async sendEvidenceUploadNoticeEmail(payload: EvidenceUploadNoticeEmailPayload): Promise<void> {
    logger.debug('Sending additional evidence upload notice email', { to: payload.to });

    const suggestedItemsText = payload.suggestedEvidence.length > 0
      ? payload.suggestedEvidence.map((item) => `• ${item}`).join('\n')
      : '• Any relevant receipts, transaction records, or screenshots\n• CCTV or photo evidence if available\n• Call recordings or message logs';

    const suggestedItemsHtml = payload.suggestedEvidence.length > 0
      ? payload.suggestedEvidence.map((item) => `<li style="margin-bottom: 6px;">${item}</li>`).join('')
      : '<li style="margin-bottom: 6px;">Any relevant receipts, transaction records, or screenshots</li><li style="margin-bottom: 6px;">CCTV or photo evidence if available</li><li style="margin-bottom: 6px;">Call recordings or message logs</li>';

    const plainText = `Subject: Additional Evidence Upload Request

Dear ${payload.complainantName},

Based on the information available in your complaint, the following supporting evidence, if available, may assist the investigation:

${suggestedItemsText}

You may also upload any other photographs, videos, audio recordings, PDFs, screenshots, medical reports, or other documents relevant to your complaint.

Secure Evidence Upload:
${payload.uploadUrl}

Alternatively, scan the attached QR Code to access the secure evidence upload portal.

This upload link and QR Code are unique to your complaint and should not be shared with unauthorized persons.

Regards,

Gujarat Police
Crime OS Intelligence Platform
Government of Gujarat`;

    const hasQr = !!payload.qrCodeBase64;
    const attachments = hasQr
      ? [
          {
            filename: 'qrcode.png',
            content: Buffer.from(payload.qrCodeBase64!.replace(/^data:image\/\w+;base64,/, ''), 'base64'),
            cid: 'qrcode_cid',
            contentType: 'image/png',
          },
        ]
      : undefined;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="background: #1a237e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Gujarat Police — Crime OS</h1>
          <p style="color: #b0bec5; margin: 4px 0 0; font-size: 13px;">Additional Evidence Upload Request</p>
        </div>
        <div style="background: #ffffff; border: 1px solid #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${payload.complainantName}</strong>,</p>
          <p>Based on the information available in your complaint, the following supporting evidence, if available, may assist the investigation:</p>
          <ul style="background: #f8f9fa; border-left: 4px solid #1a237e; padding: 16px 16px 16px 36px; border-radius: 4px; margin: 16px 0;">
            ${suggestedItemsHtml}
          </ul>
          <p>You may also upload any other photographs, videos, audio recordings, PDFs, screenshots, medical reports, or other documents relevant to your complaint.</p>
          
          <div style="text-align: center; margin: 28px 0;">
            <a href="${payload.uploadUrl}" style="background-color: #1a237e; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 15px;">Secure Evidence Upload Portal</a>
            <p style="font-size: 12px; color: #666; margin-top: 8px; word-break: break-all;">Link: <a href="${payload.uploadUrl}" style="color: #1a237e;">${payload.uploadUrl}</a></p>
          </div>

          <div style="text-align: center; background: #fafafa; border: 1px dashed #bbb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px; font-weight: bold; font-size: 14px; color: #1a237e;">Alternatively, scan the QR Code below using your mobile phone camera:</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload.uploadUrl)}" alt="Upload QR Code" style="width: 180px; height: 180px; border: 4px solid #ffffff; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
            <p style="font-size: 11px; color: #777; margin-top: 8px;">Scan with any mobile camera or QR scanner app</p>
          </div>

          <p style="color: #d32f2f; font-size: 12px; margin-top: 24px;">⚠️ This upload link and QR Code are unique to your complaint and should not be shared with unauthorized persons.</p>
          
          <div style="margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px; font-size: 13px; color: #555;">
            <p style="margin: 0;">Regards,</p>
            <p style="margin: 4px 0 0; font-weight: bold; color: #1a237e;">Gujarat Police</p>
            <p style="margin: 2px 0 0; color: #666;">Crime OS Intelligence Platform</p>
            <p style="margin: 2px 0 0; color: #888; font-size: 12px;">Government of Gujarat</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.provider.sendMail({
      to: payload.to,
      subject: 'Additional Evidence Upload Request — Gujarat Police',
      text: plainText,
      html: html,
      attachments: attachments,
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

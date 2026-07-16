import nodemailer, { Transporter } from 'nodemailer';
import { IEmailProvider, SendMailOptions } from './IEmailProvider';
import env from '../../../config/env';
import logger from '../../../config/logger';

/**
 * Nodemailer-backed email provider.
 * Implements IEmailProvider — swap this class for SendGrid/SES without touching callers.
 */
export class NodemailerProvider implements IEmailProvider {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    logger.info('Email sent successfully', { to: options.to, subject: options.subject });
  }
}

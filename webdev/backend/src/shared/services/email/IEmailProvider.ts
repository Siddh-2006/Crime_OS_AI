/**
 * Email provider interface (Dependency Inversion Principle).
 * Any concrete provider (Nodemailer, SendGrid, AWS SES) must implement this contract.
 * Controllers and services depend on this interface, never on concrete implementations.
 */
export interface IEmailProvider {
  sendMail(options: SendMailOptions): Promise<void>;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

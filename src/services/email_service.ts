import nodemailer from 'nodemailer';
import getEmailTransporter from './email_transporter';
import getFrontendBase from '../helpers/frontend_base';
import logger from '../helpers/logger';

type SendTestEmailInput = {
  to: string;
  subject?: string;
  message?: string;
};

export async function sendTestEmail({ to, subject, message }: SendTestEmailInput): Promise<{ messageId: string; previewUrl?: string }> {
  const transporter = getEmailTransporter();

  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;
  const finalSubject = subject && subject.trim().length > 0 ? subject : 'BetMate Test Email';
  const bodyText = message && message.trim().length > 0 ? message : 'This is a test email from BetMate.';

  const mailOptions: any = {
    from,
    to,
    subject: finalSubject,
    text: bodyText,
    html: `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
      <p>${escapeHtml(bodyText)}</p>
      <hr />
      <p style="color:#666">Environment: ${process.env.NODE_ENV || 'development'}</p>
    </div>`,
  };
  if (replyTo) mailOptions.replyTo = replyTo;

  const info = await transporter.sendMail(mailOptions);

  const isProd = process.env.NODE_ENV === 'production';
  const previewUrl = (!isProd && typeof (nodemailer as any).getTestMessageUrl === 'function')
    ? (nodemailer as any).getTestMessageUrl(info) || undefined
    : undefined;

  logger.log({ level: 'info', event: 'admin_test_email_sent', context: { to, messageId: info?.messageId, provider: providerName(transporter) } });

  return { messageId: info?.messageId, previewUrl };
}

export async function sendVerificationEmail(to: string, token: string, firstName?: string): Promise<{ messageId: string; previewUrl?: string }> {
  const transporter = getEmailTransporter();
  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;
  const base = getFrontendBase();
  const link = `${base}/verify-email/${encodeURIComponent(token)}`;
  const name = firstName ? escapeHtml(firstName) : 'there';
  const subject = 'Verify your BetMate email';
  const text = `Hi ${firstName || 'there'},\n\nPlease verify your email by clicking this link:\n${link}\n\nIf you did not sign up, you can ignore this email.`;
  const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
    <p>Hi ${name},</p>
    <p>Please verify your email by clicking the button below:</p>
    <p><a href="${link}" style="background:#4a90e2;color:#fff;padding:10px 14px;border-radius:4px;text-decoration:none;display:inline-block">Verify Email</a></p>
    <p style="color:#666">Or open this link: <a href="${link}">${link}</a></p>
  </div>`;
  const info = await transporter.sendMail({ from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
  const isProd = process.env.NODE_ENV === 'production';
  const previewUrl = (!isProd && typeof (nodemailer as any).getTestMessageUrl === 'function')
    ? (nodemailer as any).getTestMessageUrl(info) || undefined
    : undefined;
  logger.log({ level: 'info', event: 'auth_verification_email_sent', context: { to, messageId: info?.messageId } });
  return { messageId: info?.messageId, previewUrl };
}

export async function sendDepositReceipt(to: string, amountUsd: number, currency: string, depId: string): Promise<void> {
  const transporter = getEmailTransporter();
  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;
  const subject = 'Deposit confirmed';
  const text = `Your deposit of $${amountUsd.toFixed(2)} (${currency}) is confirmed. Ref: ${depId}`;
  const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
    <p>Your deposit is confirmed.</p>
    <p><strong>Amount:</strong> $${amountUsd.toFixed(2)} (${escapeHtml(currency)})</p>
    <p><strong>Reference:</strong> ${escapeHtml(depId)}</p>
  </div>`;
  await transporter.sendMail({ from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
}

export async function sendWithdrawalStatusEmail(to: string, status: string, amountUsd: number, currency: string, wdId: string): Promise<void> {
  const transporter = getEmailTransporter();
  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;
  const pretty = status.charAt(0).toUpperCase() + status.slice(1);
  const subject = `Withdrawal ${pretty}`;
  const text = `Your withdrawal ${status}. Amount: $${amountUsd.toFixed(2)} (${currency}). Ref: ${wdId}`;
  const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
    <p>Your withdrawal <strong>${escapeHtml(pretty)}</strong>.</p>
    <p><strong>Amount:</strong> $${amountUsd.toFixed(2)} (${escapeHtml(currency)})</p>
    <p><strong>Reference:</strong> ${escapeHtml(wdId)}</p>
  </div>`;
  await transporter.sendMail({ from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
}

export function getMailProviderInfo(): { provider: string; host?: string; service?: string } {
  try {
    const transporter = getEmailTransporter();
    const host = (transporter as any)?.options?.host;
    const service = (transporter as any)?.options?.service;
    const provider = providerName(transporter);
    return { provider, host, service };
  } catch {
    return { provider: 'unknown' };
  }
}

function providerName(transporter: any): string {
  try {
    if (transporter?.options?.streamTransport === true) return 'dev-stream';
    const host = transporter?.options?.host || '';
    if (host.includes('ethereal')) return 'ethereal';
    if (host.includes('amazonaws') || host.includes('ses')) return 'ses-smtp';
    if (host.includes('sendgrid')) return 'sendgrid-smtp';
    if (host.includes('mailgun')) return 'mailgun-smtp';
    if (transporter?.options?.service) return String(transporter.options.service);
  } catch {}
  return 'smtp';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default { sendTestEmail };
export const emailService = { sendTestEmail, sendVerificationEmail, sendDepositReceipt, sendWithdrawalStatusEmail };

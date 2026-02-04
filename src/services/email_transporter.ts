import nodemailer, { Transporter } from 'nodemailer';
import logger from '../helpers/logger';
import sgMail from '@sendgrid/mail';

let cachedTransporter: Transporter | null = null;

// Helpers to read env with common synonyms (SMTP_* or EMAIL_*)
function envOr(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).length > 0) return v as string;
  }
  return undefined;
}

function hasSmtpUrl() {
  return !!envOr('SMTP_URL');
}

function hasGenericSmtp() {
  return !!envOr('EMAIL_HOST', 'SMTP_HOST')
    && !!envOr('EMAIL_PORT', 'SMTP_PORT')
    && !!envOr('EMAIL_USER', 'SMTP_USER')
    && !!envOr('EMAIL_PASSWORD', 'SMTP_PASS', 'SMTP_PASSWORD');
}

export function getEmailTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  // Prefer SendGrid API transport when SENDGRID_API_KEY is set
  const sgKey = envOr('SENDGRID_API_KEY');
  if (sgKey) {
    try {
      sgMail.setApiKey(sgKey);
      const sgRegion = envOr('SENDGRID_DATA_RESIDENCY', 'SENDGRID_REGION');
      if (sgRegion && typeof (sgMail as any).setDataResidency === 'function') {
        (sgMail as any).setDataResidency(sgRegion);
      }
      function parseFrom(input?: any): any {
        const envEmail = envOr('SENDGRID_FROM_EMAIL');
        const envName = envOr('SENDGRID_FROM_NAME');
        if (envEmail) return envName ? { email: envEmail, name: envName } : { email: envEmail };
        const raw = input || envOr('EMAIL_FROM');
        if (!raw) return undefined;
        if (typeof raw === 'string') {
          const m = raw.match(/^(.*)<([^>]+)>\s*$/);
          if (m) {
            const name = m[1].trim().replace(/^"|"$/g, '');
            const email = m[2].trim();
            return name ? { email, name } : { email };
          }
          // if raw looks like plain email
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) return { email: raw.trim() };
          return { email: String(raw) };
        }
        if (raw && typeof raw === 'object' && raw.email) return raw;
        return undefined;
      }

      const sgTransport: any = {
        __provider: 'sendgrid-api',
        options: { service: 'sendgrid-api' },
        async sendMail(tx: any) {
          const from = parseFrom(tx?.from);
          const msg: any = {
            to: tx.to,
            from,
            subject: tx.subject,
            text: tx.text,
            html: tx.html,
          };
          if (tx.replyTo) msg.replyTo = tx.replyTo;
          // SendGrid expects a string or array for 'to'
          try {
            await sgMail.send(msg);
          } catch (e: any) {
            // Surface SendGrid error details for admin debug
            const details = e?.response?.body?.errors || e?.response?.body || e?.message || e;
            throw new Error(typeof details === 'string' ? details : JSON.stringify(details));
          }
          // SG returns an array of responses; message id is not always surfaced, so return undefined
          return { messageId: undefined };
        },
      };
      cachedTransporter = sgTransport as Transporter;
      return cachedTransporter;
    } catch (e) {
      // If SG init fails, continue to other transports
      try { logger.log({ level: 'error', event: 'sendgrid_init_error', context: { error: (e as any)?.message || String(e) } }); } catch {}
    }
  }

  // Prefer explicit SMTP URL when provided
  const smtpUrl = envOr('SMTP_URL');
  if (smtpUrl) {
    cachedTransporter = nodemailer.createTransport(smtpUrl);
    return cachedTransporter;
  }

  // Generic SMTP config (e.g., SES SMTP, SendGrid SMTP, Mailgun SMTP, Gmail SMTP)
  if (hasGenericSmtp()) {
    const host = envOr('EMAIL_HOST', 'SMTP_HOST') as string;
    const portRaw = envOr('EMAIL_PORT', 'SMTP_PORT');
    const secureRaw = envOr('EMAIL_SECURE', 'SMTP_SECURE');
    const user = envOr('EMAIL_USER', 'SMTP_USER') as string;
    const pass = envOr('EMAIL_PASSWORD', 'SMTP_PASS', 'SMTP_PASSWORD') as string;

    const port = Number(portRaw);
    const secure = typeof secureRaw === 'string' ? ['1', 'true', 'yes'].includes(secureRaw.toLowerCase()) : false;

    cachedTransporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      secure,
      auth: { user, pass },
    });
    return cachedTransporter;
  }

  // Default: Ethereal for development and staging
  const etherealUser = envOr('ETHEREAL_EMAIL');
  const etherealPass = envOr('ETHEREAL_PASSWORD');

  if (etherealUser && etherealPass) {
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: etherealUser, pass: etherealPass },
    });
    return cachedTransporter;
  }

  // Development fallback: use in-memory stream transport when not configured
  // Emails will not be delivered; content is buffered for logs/testing
  if (process.env.NODE_ENV !== 'production') {
    try {
      cachedTransporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      } as any);
      try { logger.log({ level: 'warn', event: 'email_dev_stream_fallback' }); } catch {}
      return cachedTransporter;
    } catch {}
  }

  // Last resort: throw a clear error
  throw new Error('No SMTP configuration found. Provide SMTP_URL or EMAIL_HOST/PORT/USER/PASSWORD (or SMTP_* equivalents) or ETHEREAL_EMAIL/ETHEREAL_PASSWORD');
}

export default getEmailTransporter;

import nodemailer, { Transporter } from 'nodemailer';

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

  // Last resort: throw a clear error
  throw new Error('No SMTP configuration found. Provide SMTP_URL or EMAIL_HOST/PORT/USER/PASSWORD (or SMTP_* equivalents) or ETHEREAL_EMAIL/ETHEREAL_PASSWORD');
}

export default getEmailTransporter;

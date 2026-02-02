import { Request, Response } from 'express';
import validator from 'email-validator';
import logger from '../helpers/logger';
import { sendTestEmail, sendVerificationEmail, sendWithdrawalStatusEmail, sendDepositReceipt } from '../services/email_service';
import userService from '../services/user_service';
import { InviteCode } from '../models';
import crypto from 'crypto';

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 2000;

function safeString(input?: string, max = 255): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

async function sendTestEmailHandler(req: Request, res: Response) {
  try {
    const { to, subject, message } = req.body || {};

    if (!to || typeof to !== 'string' || !validator.validate(to)) {
      return res.status(400).json({ ok: false, error: 'Invalid or missing "to" email' });
    }

    const safeSubject = safeString(subject, MAX_SUBJECT);
    const safeMessage = safeString(message, MAX_MESSAGE);

    try {
      const result = await sendTestEmail({ to, subject: safeSubject, message: safeMessage });
      return res.status(200).json({ ok: true, messageId: result.messageId, previewUrl: result.previewUrl });
    } catch (e: any) {
      logger.log({ level: 'error', event: 'admin_test_email_failed', context: { to, error: e?.message || String(e) } });
      return res.status(500).json({ ok: false, error: 'Failed to send email' });
    }
  } catch (err: any) {
    logger.log({ level: 'error', event: 'admin_test_email_unexpected', context: { error: err?.message || String(err) } });
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
}

const adminEmailController = {
  sendTestEmail: sendTestEmailHandler,
  // Admin-only: resend verification email for a given user email
  async resendVerification(req: Request, res: Response) {
    try {
      const { email } = (req.body || {}) as { email?: string };
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ ok: false, error: 'Missing email' });
      }
      const user = await userService.getUserByEmail(email);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
      if ((user as any).email_verified) return res.status(200).json({ ok: true, sent: false, reason: 'already_verified' });
      const token = crypto.randomBytes(24).toString('hex');
      const ttlMin = Math.max(5, Number(process.env.VERIFICATION_TOKEN_TTL_MIN || 60));
      const expires = new Date(Date.now() + ttlMin * 60 * 1000);
      await userService.updateUserData(user._id, { $set: { verification_token: token, verification_token_expires: expires } } as any);
      await sendVerificationEmail(user.email, token, (user as any)?.first_name);
      return res.status(200).json({ ok: true, sent: true });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'Failed to send' });
    }
  },
  // Admin-only: send Beta invite emails in bulk, creating codes on the fly
  async sendInviteEmailsBulk(req: Request, res: Response) {
    try {
      const { recipients, emails, list: listText, text, campaign, expires_at, grant_tokens, grant_cash_usd, max_redemptions } = (req.body || {}) as any;
      const raw: any = recipients ?? emails ?? listText ?? text ?? [];
      let list: string[] = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[\n,;\s]+/) : []);
      list = (list || []).map((s) => String(s || '').trim().toLowerCase()).filter((s) => validator.validate(s));
      if (!list.length) return res.status(400).json({ ok: false, error: 'No valid recipients' });
      const camp = String(campaign || 'BETA');
      const maxRed = Number.isFinite(Number(max_redemptions)) ? Number(max_redemptions) : 1;
      const exp = (expires_at && typeof expires_at === 'string' && expires_at.trim()) ? new Date(expires_at) : undefined;
      const grantTok = Number(grant_tokens || 0);
      const grantCash = Number(grant_cash_usd || 0);

      const created: any[] = [];
      for (const to of list) {
        const code = autoCode(camp.toUpperCase());
        const inv = new InviteCode({
          code,
          campaign: camp,
          max_redemptions: maxRed,
          redeemed_count: 0,
          expires_at: exp,
          active: true,
          grant_tokens: grantTok,
          grant_cash_usd: grantCash,
        });
        await inv.save();
        try {
          await sendInviteEmail(to, code, camp);
          created.push({ to, code });
        } catch (_e) {
          created.push({ to, code, error: 'send_failed' });
        }
      }
      return res.status(200).json({ ok: true, count: created.length, results: created });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'Bulk invite failed' });
    }
  },
};

export default adminEmailController;

// Local helpers
function autoCode(prefix = 'BETA') {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rnd}`;
}

async function sendInviteEmail(to: string, code: string, campaign?: string) {
  // Lightweight invite email via email_service
  const transporter = getEmailTransporterLazy();
  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;
  const subject = `You're invited to BetMate${campaign ? ` — ${campaign}` : ''}`;
  const body = `You're invited to BetMate! Use invite code ${code} during signup.`;
  const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
    <p>You're invited to <strong>BetMate</strong>!</p>
    <p>Use this invite code during signup:</p>
    <p style="font-size:16px;background:#111;padding:8px 10px;border-radius:4px;display:inline-block;letter-spacing:1px">${escapeHtml(code)}</p>
  </div>`;
  const tx: any = { from, to, subject, text: body, html };
  if (replyTo) tx.replyTo = replyTo;
  await transporter.sendMail(tx);
}

function getEmailTransporterLazy() {
  const { default: _default, getEmailTransporter } = require('../services/email_transporter');
  return getEmailTransporter();
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

import { Request, Response } from 'express';
import validator from 'email-validator';
import logger from '../helpers/logger';
import { sendTestEmail, sendVerificationEmail, sendWithdrawalStatusEmail, sendDepositReceipt } from '../services/email_service';
import userService from '../services/user_service';
import { InviteCode } from '../models';
import crypto from 'crypto';
import { writeAuditEntry } from '../utils/admin_audit';
import getFrontendBase from '../helpers/frontend_base';

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
      try { await writeAuditEntry(req as any, 'email.test', undefined, `to=${to}`); } catch {}
      return res.status(200).json({ ok: true, messageId: result.messageId, previewUrl: result.previewUrl });
    } catch (e: any) {
      logger.log({ level: 'error', event: 'admin_test_email_failed', context: { to, error: e?.message || String(e) } });
      const debug = process.env.DEBUG_PROVIDER_ERRORS === 'true';
      return res.status(500).json({ ok: false, error: 'Failed to send email', ...(debug ? { provider_error: String(e?.message || e) } : {}) });
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
      try { await writeAuditEntry(req as any, 'email.resend_verification', String(user._id), user.email); } catch {}
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
          await sendInviteEmail(to, code, camp, { grantTokens: grantTok, grantCashUsd: grantCash });
          created.push({ to, code });
        } catch (e: any) {
          logger.log({ level: 'error', event: 'admin_invite_send_failed', context: { to, code, error: e?.message || String(e) } });
          const debug = process.env.DEBUG_PROVIDER_ERRORS === 'true';
          created.push({ to, code, error: 'send_failed', ...(debug ? { provider_error: String(e?.message || e) } : {}) });
        }
      }
      try { await writeAuditEntry(req as any, 'email.invites.bulk', undefined, `count=${created.length}`, { campaign: camp }); } catch {}
      return res.status(200).json({ ok: true, count: created.length, results: created });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'Bulk invite failed' });
    }
  },
  // Admin-only: pre-provision users and send magic login links (beta campaign)
  async preprovisionInvites(req: Request, res: Response) {
    try {
      const { recipients, campaign, ttl_min, grant_tokens, grant_cash_usd, deleteExisting } = (req.body || {}) as any;
      const list: Array<{ email: string; first_name?: string; last_name?: string; name?: string }> = Array.isArray(recipients) ? recipients : [];
      if (!Array.isArray(list) || list.length === 0) {
        return res.status(400).json({ ok: false, error: 'Missing recipients' });
      }
      const camp = String(campaign || 'BETA');
      const ttlMin = Math.max(5, Number(ttl_min || (60 * 24 * 7))); // default 7 days
      const grantTok = Number(grant_tokens || 0);
      const grantCash = Number(grant_cash_usd || 0);

      const base = getFrontendBase();
      const results: any[] = [];
      for (const r of list) {
        const email = String(r?.email || '').toLowerCase().trim();
        const first = safeString(r?.first_name || r?.name, 80) || '';
        const last = safeString(r?.last_name, 80) || '';
        if (!email || !validator.validate(email)) {
          results.push({ email, error: 'invalid_email' });
          continue;
        }
        let user = await userService.getUserByEmail(email);
        try {
          if (!user && deleteExisting === true) {
            // no-op; kept for symmetry
          }
        } catch {}
        if (!user) {
          // Create with random strong password; mark verified
          const randomPass = crypto.randomBytes(18).toString('hex');
          user = await userService.createUser({ email, password: randomPass, first_name: first, last_name: last });
          try { await userService.updateUserData(user._id, { $set: { email_verified: true } } as any); } catch {}
        } else {
          // Ensure verified for frictionless magic-login
          try { await userService.updateUserData(user._id, { $set: { email_verified: true } } as any); } catch {}
        }
        // Apply optional signup grants
        try {
          const inc: any = {};
          if (grantTok > 0) inc.token_balance = grantTok;
          if (grantCash > 0) inc.cash_balance = grantCash;
          if (Object.keys(inc).length) {
            await userService.updateUserData((user as any)._id, { $inc: inc } as any);
            if (grantTok > 0) await userService.recordBalanceChange((user as any)._id, grantTok, 'Signup bonus', undefined, 'Invite', 'BET');
            if (grantCash > 0) await userService.recordBalanceChange((user as any)._id, grantCash, 'Signup bonus', undefined, 'Invite', 'USDT');
          }
        } catch {}

        // Issue magic link
        const token = crypto.randomBytes(24).toString('hex');
        const expires = new Date(Date.now() + ttlMin * 60 * 1000);
        await userService.updateUserData((user as any)._id, { $set: { magic_login_token: token, magic_login_expires: expires, magic_login_used_at: undefined } } as any);
        const magicUrl = `${base}/magic/${encodeURIComponent(token)}?tour=1`;
        try {
          await sendMagicLinkEmail(email, magicUrl, {
            name: first || undefined,
            campaign: camp,
            grantTokens: grantTok,
            grantCashUsd: grantCash,
            expiresAt: expires,
          });
          results.push({ email, user_id: String((user as any)._id), magicUrl });
        } catch (_e: any) {
          const debug = process.env.DEBUG_PROVIDER_ERRORS === 'true';
          results.push({ email, user_id: String((user as any)._id), magicUrl, error: 'send_failed', ...(debug ? { provider_error: String(_e?.message || _e) } : {}) });
        }
      }
      try { await writeAuditEntry(req as any, 'email.preprovision', undefined, `count=${results.length}`, { campaign: camp }); } catch {}
      return res.status(200).json({ ok: true, count: results.length, results });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'preprovision_failed' });
    }
  },
};

export default adminEmailController;

// Local helpers
function autoCode(prefix = 'BETA') {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rnd}`;
}

async function sendInviteEmail(to: string, code: string, campaign?: string, grants?: { grantTokens?: number; grantCashUsd?: number }) {
  // Lightweight invite email with link + accessible pill
  const transporter = getEmailTransporterLazy();
  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;
  const subject = `You're invited to BetMate${campaign ? ` — ${campaign}` : ''}`;
  const base = getFrontendBase();
  const link = `${base}/onboarding?code=${encodeURIComponent(code)}`;
  const grantTokens = Math.round(Number(grants?.grantTokens || 0));
  const grantCash = Number(grants?.grantCashUsd || 0);
  const grantLines: string[] = [];
  if (grantCash > 0) grantLines.push(`• $${grantCash.toFixed(2)} BetMate Cash`);
  if (grantTokens > 0) grantLines.push(`• ${grantTokens} K‑Bits`);

  const body = [
    `You're invited to BetMate!`,
    ...(grantLines.length ? ['', 'Your beta grant includes:', ...grantLines, ''] : []),
    `Use invite code ${code} during signup, or open:`,
    link,
  ].join('\n');
  const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
    <p>You're invited to <strong>BetMate</strong>!</p>
    ${grantLines.length ? `<div style="margin:14px 0;padding:12px;border:1px solid #eee;border-radius:8px;background:#fafafa">
        <div style=\"font-weight:600;margin-bottom:6px\">Your beta grant</div>
        <ul style=\"margin:0;padding-left:18px;color:#333\">
          ${grantCash > 0 ? `<li><strong>$${grantCash.toFixed(2)} BetMate Cash</strong></li>` : ''}
          ${grantTokens > 0 ? `<li><strong>${escapeHtml(String(grantTokens))} K‑Bits</strong></li>` : ''}
        </ul>
      </div>` : ''}
    <p>Use this invite code during signup:</p>
    <p style="font-size:16px;background:#111;color:#fff;padding:8px 10px;border-radius:4px;display:inline-block;letter-spacing:1px">${escapeHtml(code)}</p>
    <p style="margin:12px 0 6px">Or start onboarding with your code pre‑applied:</p>
    <p><a href="${link}" style="background:#4a90e2;color:#fff;padding:10px 14px;border-radius:4px;text-decoration:none;display:inline-block">Start Onboarding</a></p>
    <p style="color:#666">Plain link: <a href="${link}">${link}</a></p>
  </div>`;
  const tx: any = { from, to, subject, text: body, html };
  if (replyTo) tx.replyTo = replyTo;
  await transporter.sendMail(tx);
}

type MagicEmailOpts = {
  name?: string;
  campaign?: string;
  grantTokens?: number;
  grantCashUsd?: number;
  expiresAt?: Date;
};

async function sendMagicLinkEmail(to: string, magicUrl: string, opts: MagicEmailOpts = {}) {
  const transporter = getEmailTransporterLazy();
  const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
  const replyTo = process.env.REPLY_TO || undefined;

  const campaign = opts.campaign ? String(opts.campaign) : undefined;
  const displayName = opts.name ? escapeHtml(opts.name) : 'there';
  const grantTokens = Number(opts.grantTokens || 0);
  const grantCash = Number(opts.grantCashUsd || 0);
  const hasGrant = (grantTokens > 0) || (grantCash > 0);
  const expText = opts.expiresAt ? new Date(opts.expiresAt).toLocaleString('en-US', { timeZone: 'UTC', hour12: false }) + ' UTC' : undefined;

  const subject = `Your BetMate beta access${campaign ? ` — ${campaign}` : ''}`;

  const grantLines: string[] = [];
  if (grantCash > 0) grantLines.push(`• $${grantCash.toFixed(2)} BetMate Cash`);
  if (grantTokens > 0) grantLines.push(`• ${Math.round(grantTokens)} K‑Bits`);

  const text = [
    `Hi ${displayName},`,
    '',
    `Your BetMate beta access is ready. Use this magic link to sign in:`,
    magicUrl,
    '',
    ...(hasGrant ? [`We’ve also added a beta grant to your account:`, ...grantLines, ''] : []),
    `Important notes:`,
    `• This is a beta product. Features may change and availability is not guaranteed.`,
    `• Only BetMate Cash winnings are eligible for withdrawal (subject to limits/verification and Terms).`,
    `• This link is single‑use and will expire${expText ? ` on ${expText}` : ' soon'}.`,
    '',
    `If you did not request this, you can ignore this email.`,
  ].join('\n');

  const htmlGrant = hasGrant
    ? `<div style="margin:14px 0;padding:12px;border:1px solid #eee;border-radius:8px;background:#fafafa">
        <div style="font-weight:600;margin-bottom:6px">Your beta grant</div>
        <ul style="margin:0;padding-left:18px;color:#333">
          ${grantCash > 0 ? `<li><strong>$${grantCash.toFixed(2)} BetMate Cash</strong></li>` : ''}
          ${grantTokens > 0 ? `<li><strong>${escapeHtml(String(Math.round(grantTokens)))} K‑Bits</strong></li>` : ''}
        </ul>
      </div>`
    : '';

  const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.45; color: #111;">
    <p>Hi ${displayName},</p>
    <p>Your <strong>BetMate beta access</strong> is ready. Tap below to sign in:</p>
    <p>
      <a href="${magicUrl}" style="background:#111;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none;display:inline-block">
        Open BetMate
      </a>
    </p>
    <p style="color:#666;margin-top:8px">Or open this link: <a href="${magicUrl}">${magicUrl}</a></p>

    ${htmlGrant}

    <div style="margin-top:14px;color:#444">
      <div style="font-weight:600;margin-bottom:6px">Important notes</div>
      <ul style="margin:0;padding-left:18px">
        <li>This is a beta product; features may change and availability is not guaranteed.</li>
        <li>Only <strong>BetMate Cash</strong> winnings are eligible for withdrawal (subject to limits/verification and Terms).</li>
        <li>This link is single‑use and will expire${expText ? ` on <strong>${escapeHtml(expText)}</strong>` : ' soon'}.</li>
      </ul>
    </div>

    <p style="color:#666;margin-top:14px">If you did not request this email, you can ignore it.</p>
    <p style="color:#999;font-size:12px;margin-top:16px">Subject to BetMate Terms and Conditions.</p>
  </div>`;

  const tx: any = { from, to, subject, text, html };
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

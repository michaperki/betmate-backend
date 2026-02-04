import { RequestHandler } from 'express';
import logger from '../helpers/logger';
import getEmailTransporter from '../services/email_transporter';

// Use Node 18 global fetch if available; otherwise lazy import node-fetch
const getFetch = async () => (typeof (global as any).fetch !== 'undefined'
  ? (global as any).fetch
  : (await import('node-fetch')).default as unknown as (url: string, init?: any) => Promise<any>);

/**
 * Handle client-side log events from the frontend
 * Acts as a proxy to Axiom, adding authentication and validation
 */
const clientLogRequest: RequestHandler = async (req, res) => {
  try {
    // Always return 200 in production if AXIOM_TOKEN is not configured
    // This prevents frontend errors while allowing for local development
    if (process.env.NODE_ENV === 'production' && !process.env.AXIOM_TOKEN) {
      return res.status(200).json({ message: 'Logging disabled in production' });
    }

    const { level, event, message, context } = req.body;

    // Validate required fields
    if (!level || !event) {
      return res.status(400).json({
        message: 'Missing required fields: level and event are required'
      });
    }

    // Validate log level
    if (!['debug', 'info', 'warn', 'error'].includes(level)) {
      return res.status(400).json({
        message: 'Invalid log level. Must be one of: debug, info, warn, error'
      });
    }

    // Add client IP and user agent for security/debugging
    const clientContext = {
      ...context,
      client_ip: req.ip,
      user_agent: req.headers['user-agent'],
      referer: req.headers.referer || req.headers.referrer
    };

    // Log to Axiom with client-side prefix to distinguish from server logs
    await logger.log({
      level,
      event: `client_${event}`,
      message,
      service: 'frontend',
      context: clientContext
    });

    return res.status(200).json({ message: 'Log recorded successfully' });
  } catch (error) {
    logger.log({ level: 'error', event: 'client_log_processing_error', context: { error: (error as Error)?.message || String(error) } });
    // Always return 200 even on error to prevent frontend issues
    return res.status(200).json({ message: 'Log request received' });
  }
};

/**
 * Report an issue from the frontend (optional Discord relay)
 * Accepts: { description: string; category?: string; url?: string; extra?: any }
 */
const reportIssue: RequestHandler = async (req, res) => {
  try {
    const { description, category, url, extra } = req.body || {};
    if (!description || String(description).trim().length < 3) {
      return res.status(400).json({ message: 'Description is required' });
    }

    const payload = {
      level: 'info' as const,
      event: 'client_issue_report',
      message: String(description).slice(0, 2000),
      service: 'frontend',
      context: {
        category: category || 'unspecified',
        url: url || req.headers.referer || req.headers.referrer,
        client_ip: req.ip,
        user_agent: req.headers['user-agent'],
        extra: (extra && typeof extra === 'object') ? extra : undefined,
      }
    };

    await logger.log(payload);

    // Send email to the configured recipient (defaults to Mike)
    try {
      const transporter = getEmailTransporter();
      const to = process.env.ISSUE_REPORT_EMAIL_TO || 'mike@betmate.dev';
      const from = process.env.EMAIL_FROM || 'BetMate <noreply@betmate.app>';
      const replyTo = process.env.REPLY_TO || undefined;
      const envName = process.env.TARGET_ENV || process.env.NODE_ENV || 'development';

      const subject = `Issue Report${category ? ` [${String(category)}]` : ''} — ${envName}`;
      const safe = (v: any) => (v == null ? '' : String(v));
      const contextLines = [
        `Category: ${safe(payload.context?.category)}`,
        `URL: ${safe(payload.context?.url)}`,
        `User-Agent: ${safe(payload.context?.user_agent)}`,
        `Client IP: ${safe(payload.context?.client_ip)}`,
      ];
      const extraJson = payload.context?.extra ? JSON.stringify(payload.context.extra, null, 2) : undefined;
      const text = [
        'A new issue was reported from the frontend.',
        '',
        ...contextLines,
        '',
        'Description:',
        safe(payload.message),
        ...(extraJson ? ['','Extra:', extraJson] : []),
      ].join('\n');
      const html = `<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #111;">
        <div style="font-weight:600;margin-bottom:6px">New Issue Reported</div>
        <div style="margin:8px 0;padding:10px;border:1px solid #eee;border-radius:8px;background:#fafafa">
          <div><strong>Category:</strong> ${safe(payload.context?.category)}</div>
          <div><strong>URL:</strong> ${safe(payload.context?.url)}</div>
          <div><strong>User-Agent:</strong> ${safe(payload.context?.user_agent)}</div>
          <div><strong>Client IP:</strong> ${safe(payload.context?.client_ip)}</div>
        </div>
        <div style="margin-top:10px">
          <div style="font-weight:600;margin-bottom:4px">Description</div>
          <div style="white-space:pre-wrap">${safe(payload.message)}</div>
        </div>
        ${extraJson ? `<div style="margin-top:12px">
          <div style=\"font-weight:600;margin-bottom:4px\">Extra</div>
          <pre style=\"margin:0;padding:10px;background:#111;color:#fff;border-radius:6px;overflow:auto\">${extraJson.replace(/</g, '&lt;')}</pre>
        </div>` : ''}
        <div style="color:#777;margin-top:12px">Environment: ${envName}</div>
      </div>`;
      const tx: any = { from, to, subject, text, html };
      if (replyTo) tx.replyTo = replyTo;
      await transporter.sendMail(tx);
    } catch (e: any) {
      try {
        await logger.log({ level: 'error', event: 'client_issue_email_failed', context: { error: e?.message || String(e) } });
      } catch {}
    }

    // Optional Discord webhook relay (non-blocking)
    try {
      const webhook = process.env.DISCORD_WEBHOOK_URL_ISSUES || process.env.DISCORD_WEBHOOK_URL_BE;
      if (webhook) {
        const embed = {
          title: '🐞 Issue Reported',
          description: payload.message,
          color: 0xff5555,
          fields: [
            { name: 'Category', value: String(payload.context?.category || 'unspecified'), inline: true },
            { name: 'URL', value: String(payload.context?.url || 'n/a'), inline: true },
            { name: 'User Agent', value: String(payload.context?.user_agent || 'n/a'), inline: false },
          ]
        };
        const fetch = await getFetch();
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: null, embeds: [embed] }),
        } as any).catch(() => null);
      }
    } catch {}

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(200).json({ ok: true });
  }
};

const logController = {
  clientLogRequest,
  reportIssue,
};

export default logController;

/* Notify Discord of a successful backend production release (Heroku release phase) */
import type { RequestInit } from 'node-fetch';
// Use Node 18 global fetch if available; otherwise lazy import node-fetch
const getFetch = async () => (typeof (global as any).fetch !== 'undefined'
  ? (global as any).fetch
  : (await import('node-fetch')).default as unknown as (url: string, init?: RequestInit) => Promise<any>);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pkg from '../../package.json';

async function main(): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL_BE;
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv !== 'production') {
    console.log('[notify-discord] Skipping (NODE_ENV != production):', nodeEnv);
    return;
  }
  if (!webhook) {
    console.log('[notify-discord] Skipping (missing DISCORD_WEBHOOK_URL_BE)');
    return;
  }

  const appName = process.env.HEROKU_APP_NAME || 'betmate-backend';
  const release = process.env.HEROKU_RELEASE_VERSION || 'unknown';
  const releasedAtISO = process.env.HEROKU_RELEASE_CREATED_AT || new Date().toISOString();
  const commit = process.env.SOURCE_VERSION || process.env.HEROKU_SLUG_COMMIT || '';
  const appVersion = (pkg && pkg.version) ? `v${pkg.version}` : 'v0.0.0';

  const payload = {
    content: null,
    embeds: [
      {
        title: '✅ BetMate Backend Deployed',
        description: `App: ${appName}`,
        color: 0x3366cc,
        fields: [
          { name: 'When', value: new Date(releasedAtISO).toUTCString(), inline: false },
          { name: 'Release', value: release, inline: true },
          { name: 'Version', value: appVersion, inline: true },
          ...(commit ? [{ name: 'Commit', value: commit.substring(0, 7), inline: true }] : []),
        ],
      },
    ],
  };

  try {
    const fetch = await getFetch();
    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    } as any);
    if (!(resp as any).ok) {
      console.error('[notify-discord] Failed:', (resp as any).status, await (resp as any).text());
    } else {
      console.log('[notify-discord] Sent');
    }
  } catch (err) {
    console.error('[notify-discord] Error:', err);
  }
}

void main();


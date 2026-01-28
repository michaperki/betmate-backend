/*
 * Create an invite code for gated signup with optional grants.
 *
 * Usage examples:
 *  - Minimal (auto-code):
 *      npm run admin:create-invite -- --campaign beta --max 100 --grant-bet 1000 --grant-usd 10 --yes
 *  - Explicit code with expiry date:
 *      npm run admin:create-invite -- --campaign beta --code BETA-ALPHA-123 --max 5 --expires 2026-12-31 --yes
 *
 * Notes
 * - Loads backend/.env.local (if present) then backend/.env.
 * - Requires --yes to confirm write.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import InviteCode from '../src/models/invite_code_model';

// Load env similar to server.ts: .env.local first (if present), then .env
(() => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) dotenv.config({ path: localEnvPath });
  dotenv.config();
})();

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true; // flag
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out as {
    campaign?: string;
    code?: string;
    max?: string | number;
    expires?: string;
    days?: string | number;
    grantBet?: string | number;
    'grant-bet'?: string | number;
    grantUsd?: string | number;
    'grant-usd'?: string | number;
    active?: string | boolean;
    yes?: string | boolean;
    update?: string | boolean;
  } as any;
}

function autoCode(prefix = 'BETA') {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rnd}`;
}

function parseBool(v: any, d: boolean) {
  if (v === true || v === false) return v;
  if (v == null) return d;
  const s = String(v).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return d;
}

function parseNumber(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function connectMongo() {
  const mongoUri = process.env.MONGODB_URI as string;
  if (!mongoUri) throw new Error('MONGODB_URI not set');
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    } as any);
  } catch (e: any) {
    if (mongoUri.includes('mongodb+srv')) {
      const formatted = constructSrvUri(mongoUri);
      await mongoose.connect(formatted, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true,
      } as any);
    } else {
      throw e;
    }
  }
}

function constructSrvUri(mongoUri: string) {
  const mongoUrl = new URL(mongoUri);
  const hostname = mongoUrl.hostname;
  const pathname = mongoUrl.pathname;
  const search = mongoUrl.search;
  const username = process.env.MONGODB_USERNAME || mongoUrl.username;
  const password = process.env.MONGODB_PASSWORD || mongoUrl.password;
  if (!username || !password) {
    throw new Error('MongoDB username or password missing for SRV URI');
  }
  const u = encodeURIComponent(username);
  const p = encodeURIComponent(password);
  return `mongodb+srv://${u}:${p}@${hostname}${pathname}${search}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const campaign = String(args.campaign || '').trim();
  const updateExisting = parseBool(args.update, false);
  const confirmed = parseBool(args.yes, false);

  if (!confirmed) {
    console.error('Refusing to write without --yes');
    process.exit(1);
  }
  if (!campaign) {
    console.error('Error: --campaign is required');
    process.exit(1);
  }

  const code = String(args.code || '').trim() || autoCode(campaign.toUpperCase());
  const max = Math.max(1, parseNumber(args.max, 1));
  const grantTokens = Math.max(0, parseNumber(args['grant-bet'] ?? args.grantBet, 0));
  const grantUsd = Math.max(0, parseNumber(args['grant-usd'] ?? args.grantUsd, 0));
  let expiresAt: Date | undefined = undefined;
  if (args.expires) {
    const d = new Date(String(args.expires));
    if (!isNaN(d.getTime())) expiresAt = d;
  } else if (args.days) {
    const days = Math.max(1, parseNumber(args.days, 0));
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  const active = parseBool(args.active, true);

  await connectMongo();
  try {
    let doc = await InviteCode.findOne({ code }).exec();
    if (doc && !updateExisting) {
      console.error(`Invite code already exists: ${code} (use --update to modify)`);
      process.exit(2);
    }
    if (!doc) {
      doc = new InviteCode({ code, campaign, max_redemptions: max });
    }
    doc.campaign = campaign;
    doc.max_redemptions = max;
    doc.active = active;
    doc.grant_tokens = grantTokens;
    doc.grant_cash_usd = grantUsd;
    doc.expires_at = expiresAt;
    await doc.save();

    console.log(JSON.stringify({
      ok: true,
      _id: String(doc._id),
      code: doc.code,
      campaign: doc.campaign,
      max_redemptions: doc.max_redemptions,
      redeemed_count: doc.redeemed_count,
      expires_at: doc.expires_at,
      active: doc.active,
      grant_tokens: doc.grant_tokens,
      grant_cash_usd: doc.grant_cash_usd,
    }, null, 2));
    process.exit(0);
  } catch (e: any) {
    console.error('Failed to create/update invite:', e?.message || String(e));
    process.exit(1);
  } finally {
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  }
}

main();


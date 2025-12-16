/*
 * Promote (or demote) a user to a specific role by email.
 *
 * Usage examples:
 *  - Promote to admin (staging/prod one-off):
 *      npm run promote-admin -- --email you@example.com --role admin --yes
 *
 *  - Demote back to user:
 *      npm run promote-admin -- --email you@example.com --role user --yes
 *
 * Notes
 * - This script loads .env.local (if present) then .env for MONGODB_URI, etc.
 * - Requires --yes to avoid accidental changes.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/user_model';
import { UserRole } from '../src/types/models/user';

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
    email?: string;
    role?: string;
    yes?: boolean | string;
  } as any;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email || '').trim().toLowerCase();
  const role = (String(args.role || 'admin').trim().toLowerCase()) as 'admin' | 'user' | 'streamer';
  const confirmed = args.yes === true || String(args.yes).toLowerCase() === 'true';

  if (!email) {
    console.error('Error: --email is required');
    process.exit(1);
  }
  if (!confirmed) {
    console.error('Refusing to modify roles without --yes');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI is not set in environment');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI as string;
  try {
    await mongoose.connect(mongoUri as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    } as any);

    const user = await User.findOne({ email }).exec();
    if (!user) {
      console.error(`User not found for email: ${email}`);
      process.exit(2);
    }

    const newRole =
      role === 'admin' ? UserRole.ADMIN
      : role === 'streamer' ? UserRole.STREAMER
      : UserRole.USER;

    user.role = newRole as any;
    await user.save();

    console.log(`Success: set role for ${email} to ${newRole}`);
    process.exit(0);
  } catch (e: any) {
    // Try SRV reconstruction fallback (mirrors backend/src/server.ts)
    if (mongoUri.includes('mongodb+srv')) {
      try {
        const formatted = constructSrvUri(mongoUri);
        await mongoose.connect(formatted as string, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useFindAndModify: false,
          useCreateIndex: true,
        } as any);

        const user = await User.findOne({ email }).exec();
        if (!user) {
          console.error(`User not found for email: ${email}`);
          process.exit(2);
        }
        const newRole =
          role === 'admin' ? UserRole.ADMIN
          : role === 'streamer' ? UserRole.STREAMER
          : UserRole.USER;
        user.role = newRole as any;
        await user.save();
        console.log(`Success: set role for ${email} to ${newRole}`);
        process.exit(0);
      } catch (err: any) {
        console.error('Error updating role (SRV fallback):', err?.message || String(err));
        process.exit(1);
      }
    } else {
      console.error('Error updating role:', e?.message || String(e));
      process.exit(1);
    }
  } finally {
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  }
}

main();

// Copied from backend/src/server.ts logic
function constructSrvUri(mongoUri: string) {
  // Use URL to parse URI and inject credentials from env if needed
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

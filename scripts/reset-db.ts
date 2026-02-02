/*
 * Reset (drop) the MongoDB database configured for the backend.
 *
 * Usage:
 *   - Dry run (shows what would happen):
 *       npx ts-node -r tsconfig-paths/register scripts/reset-db.ts
 *   - Execute (requires confirmation flag):
 *       npx ts-node -r tsconfig-paths/register scripts/reset-db.ts --yes
 *   - If URI host is not local (localhost/127.0.0.1/mongo), require --force:
 *       npx ts-node -r tsconfig-paths/register scripts/reset-db.ts --yes --force
 *
 * Notes
 * - Loads backend/.env.local (if present) then backend/.env (same as server.ts).
 * - Uses MONGODB_URI and drops that database entirely. Irreversible.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load env similar to server.ts: .env.local first (if present), then .env
(() => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) dotenv.config({ path: localEnvPath });
  dotenv.config();
})();

type Args = {
  yes?: boolean | string;
  force?: boolean | string;
};

function parseArgs(argv: string[]): Args {
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
  return out as Args;
}

function toBool(v: any): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function sanitizeUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***@');
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === 'mongo';
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

async function connectMongo(uri: string) {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    } as any);
  } catch (e: any) {
    if (uri.includes('mongodb+srv')) {
      const formatted = constructSrvUri(uri);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const confirmed = toBool(args.yes);
  const force = toBool(args.force);

  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) {
    console.error('Error: MONGODB_URI is not set in environment');
    process.exit(1);
  }

  let url: URL;
  try {
    url = new URL(mongoUri);
  } catch (e) {
    console.error('Invalid MONGODB_URI');
    process.exit(1);
    return;
  }

  const host = url.hostname;
  const dbNameFromUri = (url.pathname || '/').replace(/^\//, '') || '(default)';
  const safeUri = sanitizeUri(mongoUri);

  console.log('Database reset (dropDatabase) plan:');
  console.log(`  URI: ${safeUri}`);
  console.log(`  Host: ${host}`);
  console.log(`  Target DB (from URI): ${dbNameFromUri}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);

  // Safety checks
  const prodEnv = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const localHost = isLocalHost(host);

  if (!confirmed) {
    console.error('Refusing to drop database without --yes');
    process.exit(1);
  }
  if ((prodEnv || !localHost) && !force) {
    console.error('Refusing to drop non-local or production database without --force');
    process.exit(1);
  }

  try {
    await connectMongo(mongoUri);
    const activeDbName = mongoose.connection.db.databaseName;
    console.log(`Connected. Dropping database: ${activeDbName}`);
    const result = await mongoose.connection.db.dropDatabase();
    console.log('dropDatabase result:', result);
    console.log('Success. Database dropped.');
    process.exit(0);
  } catch (e: any) {
    console.error('Failed to drop database:', e?.message || String(e));
    process.exit(1);
  } finally {
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  }
}

main();


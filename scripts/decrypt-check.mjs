#!/usr/bin/env node
/**
 * decrypt-check.mjs — verify round-trip: decrypt data/worklog.enc and print JSON
 * Usage: WORKLOG_PASS="your-passphrase" node scripts/decrypt-check.mjs
 *
 * This is a dev-only verification tool. Not needed for production use.
 */

import { createDecipheriv, pbkdf2 } from 'crypto';
import { readFileSync } from 'fs';
import { promisify } from 'util';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const pbkdf2Async = promisify(pbkdf2);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const passphrase = process.env.WORKLOG_PASS;
if (!passphrase) {
  console.error('Set WORKLOG_PASS env var');
  process.exit(1);
}

const encPath = join(ROOT, 'data', 'worklog.enc');
const envelope = JSON.parse(readFileSync(encPath, 'utf8'));

const { iter, salt: saltB64, iv: ivB64, ct: ctB64 } = envelope;

const salt = Buffer.from(saltB64, 'base64');
const iv = Buffer.from(ivB64, 'base64');
const ctWithTag = Buffer.from(ctB64, 'base64');

// Last 16 bytes = GCM authTag
const authTag = ctWithTag.slice(-16);
const ct = ctWithTag.slice(0, -16);

const key = await pbkdf2Async(passphrase, salt, iter, 32, 'sha256');

const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);

let plaintext;
try {
  plaintext = decipher.update(ct) + decipher.final('utf8');
} catch {
  console.error('Decryption FAILED — wrong passphrase or tampered file');
  process.exit(1);
}

const data = JSON.parse(plaintext);
console.log('Round-trip OK');
console.log(`  owner: ${data.owner ?? '(none)'}`);
console.log(`  month: ${data.month}`);
console.log(`  days:  ${Object.keys(data.days).length}`);
console.log(`  categories: ${data.categories.map((c) => c.label).join(', ')}`);

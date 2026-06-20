#!/usr/bin/env node
/**
 * encrypt.mjs — encrypt a plaintext worklog JSON with PBKDF2+AES-256-GCM
 * Usage:
 *   WORKLOG_PASS="your-passphrase" node scripts/encrypt.mjs sample/worklog-2026-06.json
 *
 * Output: data/worklog.enc (JSON envelope, safe to commit)
 * Passphrase: read from env WORKLOG_PASS or prompted interactively (never logged)
 */

import { createCipheriv, pbkdf2, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { promisify } from 'util';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const pbkdf2Async = promisify(pbkdf2);

const ITER = 600000;
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;
const HASH = 'sha256';
const ALGO = 'aes-256-gcm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function getPassphrase() {
  if (process.env.WORKLOG_PASS) {
    return process.env.WORKLOG_PASS;
  }
  // Interactive prompt — input is not echoed on most terminals
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  // Suppress echo if TTY
  if (process.stdin.isTTY) {
    process.stdout.write('Passphrase: ');
    process.stdin.setRawMode(true);
    return new Promise((res) => {
      let pass = '';
      process.stdin.on('data', (chunk) => {
        const ch = chunk.toString();
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          rl.close();
          res(pass);
        } else if (ch === '') {
          process.exit(1);
        } else if (ch === '') {
          pass = pass.slice(0, -1);
        } else {
          pass += ch;
        }
      });
    });
  }
  // Non-TTY (pipe)
  return new Promise((res) => {
    rl.question('Passphrase: ', (answer) => {
      rl.close();
      res(answer);
    });
  });
}

async function encrypt(plaintextPath, passphrase) {
  const plaintext = readFileSync(plaintextPath, 'utf8');

  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);

  const key = await pbkdf2Async(passphrase, salt, ITER, KEY_LEN, HASH);

  const cipher = createCipheriv(ALGO, key, iv);
  const ctBuf = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Append authTag to ciphertext — mirrors Web Crypto AES-GCM output format
  const ctWithTag = Buffer.concat([ctBuf, authTag]);

  const envelope = {
    v: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iter: ITER,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: ctWithTag.toString('base64'),
  };

  const outDir = join(ROOT, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'worklog.enc');
  writeFileSync(outPath, JSON.stringify(envelope, null, 2), 'utf8');
  console.log(`Encrypted → ${outPath}`);
  console.log(`  iterations: ${ITER}, salt: ${SALT_LEN}B, iv: ${IV_LEN}B`);
}

// ── main ──────────────────────────────────────────────────────────────────────
const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Usage: WORKLOG_PASS="..." node scripts/encrypt.mjs <plaintext.json>');
  process.exit(1);
}
const inputPath = resolve(process.cwd(), inputArg);

const passphrase = await getPassphrase();
if (!passphrase || passphrase.length < 1) {
  console.error('Error: passphrase must not be empty');
  process.exit(1);
}
if (passphrase.length < 12 && process.env.WORKLOG_ALLOW_WEAK !== '1') {
  console.error('Error: passphrase สั้นเกินไป (ต้องการ ≥12 ตัวอักษร หรือ ≥4 คำสุ่ม เช่น diceware)');
  console.error('  ข้าม: WORKLOG_ALLOW_WEAK=1 (สำหรับ demo/ทดสอบ local เท่านั้น)');
  process.exit(1);
}

await encrypt(inputPath, passphrase);

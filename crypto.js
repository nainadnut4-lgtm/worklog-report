/**
 * crypto.js — browser-side AES-256-GCM decrypt using Web Crypto
 * Mirrors the envelope format written by scripts/encrypt.mjs
 */

async function deriveKey(passphrase, saltBuf, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Decrypt a worklog envelope object.
 * @param {object} envelope  — parsed data/worklog.enc JSON
 * @param {string} passphrase
 * @returns {Promise<object>} — parsed worklog JSON
 * @throws if passphrase is wrong or file is tampered
 */
async function decryptWorklog(envelope, passphrase) {
  const { iter, salt: saltB64, iv: ivB64, ct: ctB64 } = envelope;

  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const iv   = Uint8Array.from(atob(ivB64),   (c) => c.charCodeAt(0));
  const ct   = Uint8Array.from(atob(ctB64),   (c) => c.charCodeAt(0));

  const key = await deriveKey(passphrase, salt, iter);

  // Web Crypto AES-GCM expects ciphertext+authTag concatenated (same as our format)
  let plaintextBuf;
  try {
    plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    throw new Error('DECRYPT_FAILED');
  }

  const plaintext = new TextDecoder().decode(plaintextBuf);
  return JSON.parse(plaintext);
}

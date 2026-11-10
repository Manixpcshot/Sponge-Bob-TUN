import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { ServerSecretRecord, SubscriptionUserInfo } from '../types';
import { buildVlessUriFromRecord, parseVlessPayload } from './vlessParser';

export interface NpvsDecodeResult {
  status: 'ok' | 'needs_password' | 'invalid_password' | 'unsupported';
  servers: ServerSecretRecord[];
  inlineHeaders: Record<string, string>;
  userInfo?: Partial<SubscriptionUserInfo>;
  errorCode?: string;
}

interface SpongeNpvsEnvelope {
  format: 'sponge-npvs-v1';
  cipher: 'aes-256-gcm';
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function tryDecompress(buf: Buffer): Buffer | null {
  try {
    // Gzip magic 1f 8b or zlib 78 9c / 78 da / 78 01
    if (buf.length >= 2) {
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        return zlib.gunzipSync(buf);
      }
      if (buf[0] === 0x78 && (buf[1] === 0x9c || buf[1] === 0xda || buf[1] === 0x01)) {
        return zlib.inflateSync(buf);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * OpenSSL EVP_BytesToKey (compatible with CryptoJS.AES.encrypt(text, passphrase)).
 */
function evpBytesToKey(
  password: string,
  salt: Buffer,
  keyLen: number,
  ivLen: number,
  hashAlg: 'md5' | 'sha256' = 'md5',
): { key: Buffer; iv: Buffer } {
  const passBuf = Buffer.from(password, 'utf8');
  const blocks: Buffer[] = [];
  let totalLen = 0;
  let prev = Buffer.alloc(0);

  while (totalLen < keyLen + ivLen) {
    const hash = crypto.createHash(hashAlg);
    hash.update(prev);
    hash.update(passBuf);
    hash.update(salt);
    prev = hash.digest();
    blocks.push(prev);
    totalLen += prev.length;
  }

  const derived = Buffer.concat(blocks);
  return {
    key: derived.subarray(0, keyLen),
    iv: derived.subarray(keyLen, keyLen + ivLen),
  };
}

function tryDecryptOpenSslSalted(saltedBuf: Buffer, password: string): string | null {
  if (saltedBuf.length <= 16) return null;
  if (saltedBuf.subarray(0, 8).toString('ascii') !== 'Salted__') return null;

  const salt = saltedBuf.subarray(8, 16);
  const ciphertext = saltedBuf.subarray(16);

  const strategies: Array<() => { key: Buffer; iv: Buffer; alg: string }> = [
    () => ({ ...evpBytesToKey(password, salt, 32, 16, 'md5'), alg: 'aes-256-cbc' }),
    () => ({ ...evpBytesToKey(password, salt, 32, 16, 'sha256'), alg: 'aes-256-cbc' }),
    () => {
      const derived = crypto.pbkdf2Sync(password, salt, 10000, 48, 'sha256');
      return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48), alg: 'aes-256-cbc' };
    },
    () => ({ ...evpBytesToKey(password, salt, 16, 16, 'md5'), alg: 'aes-128-cbc' }),
  ];

  for (const getParams of strategies) {
    try {
      const { key, iv, alg } = getParams();
      const decipher = crypto.createDecipheriv(alg, key, iv);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const decompressed = tryDecompress(plain) || plain;
      const text = decompressed.toString('utf8');
      if (isLikelyConfigPayload(text)) {
        return text;
      }
    } catch {
      // Try next strategy
    }
  }
  return null;
}

function tryDecryptSpongeEnvelope(env: SpongeNpvsEnvelope, password: string): string | null {
  try {
    const salt = Buffer.from(env.salt, 'base64');
    const iv = Buffer.from(env.iv, 'base64');
    const tag = Buffer.from(env.tag, 'base64');
    const data = Buffer.from(env.data, 'base64');
    const iterations = Number.isFinite(env.iterations) && env.iterations >= 1000 ? env.iterations : 120000;

    const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    const decompressed = tryDecompress(plain) || plain;
    return decompressed.toString('utf8');
  } catch {
    return null;
  }
}

function tryDecryptGenericEnvelope(obj: Record<string, unknown>, password: string): string | null {
  const dataRaw = typeof obj.data === 'string' ? obj.data : typeof obj.payload === 'string' ? obj.payload : null;
  if (!dataRaw) return null;

  const ivRaw = typeof obj.iv === 'string' ? obj.iv : null;
  const saltRaw = typeof obj.salt === 'string' ? obj.salt : null;
  const tagRaw = typeof obj.tag === 'string' ? obj.tag : null;

  const dataBuf = Buffer.from(dataRaw, 'base64');
  if (dataBuf.length === 0) return null;

  if (dataBuf.subarray(0, 8).toString('ascii') === 'Salted__') {
    const res = tryDecryptOpenSslSalted(dataBuf, password);
    if (res) return res;
  }

  const keyCandidates: Buffer[] = [
    crypto.createHash('sha256').update(password, 'utf8').digest(),
    crypto.createHash('md5').update(password, 'utf8').digest(),
  ];

  if (saltRaw) {
    const saltBuf = Buffer.from(saltRaw, 'base64');
    keyCandidates.unshift(crypto.pbkdf2Sync(password, saltBuf, 100000, 32, 'sha256'));
    keyCandidates.push(crypto.pbkdf2Sync(password, saltBuf, 10000, 32, 'sha256'));
  }

  const ivBuf = ivRaw ? Buffer.from(ivRaw, 'base64') : Buffer.alloc(16, 0);

  for (const key of keyCandidates) {
    if (tagRaw && key.length === 32) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
        decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
        const plain = Buffer.concat([decipher.update(dataBuf), decipher.final()]).toString('utf8');
        if (isLikelyConfigPayload(plain)) return plain;
      } catch {
        // continue
      }
    }
    const alg = key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
    if (ivBuf.length === 16) {
      try {
        const decipher = crypto.createDecipheriv(alg, key, ivBuf);
        const plain = Buffer.concat([decipher.update(dataBuf), decipher.final()]).toString('utf8');
        if (isLikelyConfigPayload(plain)) return plain;
      } catch {
        // continue
      }
    }
  }
  return null;
}

function isLikelyConfigPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/vless:\/\//i.test(trimmed)) return true;
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && /vnext|vless|outbounds|servers|configs|sponge-npvs/i.test(trimmed)) {
    return true;
  }
  // Check if decrypted text is base64-wrapped vless lines
  const compact = trimmed.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(compact)) {
    const parsed = parseVlessPayload(trimmed);
    return parsed.servers.length > 0;
  }
  return false;
}

function looksEncrypted(rawBuf: Buffer, textTrimmed: string): {
  encrypted: boolean;
  envelope?: Record<string, unknown>;
  saltedBuf?: Buffer;
} {
  if (rawBuf.subarray(0, 8).toString('ascii') === 'Salted__') {
    return { encrypted: true, saltedBuf: rawBuf };
  }

  // CryptoJS Salted__ base64 starts with U2FsdGVkX1
  if (textTrimmed.startsWith('U2FsdGVkX1')) {
    const cleaned = textTrimmed.replace(/\s+/g, '');
    return { encrypted: true, saltedBuf: Buffer.from(cleaned, 'base64') };
  }

  if (textTrimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(textTrimmed) as Record<string, unknown>;
      if (obj.format === 'sponge-npvs-v1' || (obj.encrypted === true && typeof obj.data === 'string')) {
        return { encrypted: true, envelope: obj };
      }
      if (typeof obj.data === 'string' && (typeof obj.iv === 'string' || typeof obj.salt === 'string' || typeof obj.cipher === 'string')) {
        return { encrypted: true, envelope: obj };
      }
    } catch {
      // Not JSON
    }
  }

  // Check for raw base64 wrapping `Salted__` or encrypted bytes
  const compact = textTrimmed.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/_-]{24,}={0,2}$/.test(compact)) {
    try {
      const std = compact.replace(/-/g, '+').replace(/_/g, '/');
      const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64');
      if (decoded.subarray(0, 8).toString('ascii') === 'Salted__') {
        return { encrypted: true, saltedBuf: decoded };
      }
      // Binary encrypted blob (not valid JSON or VLESS text)
      const decodedStr = decoded.toString('utf8');
      if (decodedStr.startsWith('{')) {
        const inner = JSON.parse(decodedStr) as Record<string, unknown>;
        if (inner.format === 'sponge-npvs-v1' || inner.encrypted === true || typeof inner.data === 'string') {
          return { encrypted: true, envelope: inner };
        }
      }
    } catch {
      // Ignore
    }
  }

  // Non-printable binary buffer likely encrypted
  let nonPrintable = 0;
  const sampleLen = Math.min(rawBuf.length, 256);
  for (let i = 0; i < sampleLen; i++) {
    const b = rawBuf[i];
    if (b < 9 || (b > 13 && b < 32)) nonPrintable++;
  }
  if (sampleLen > 16 && nonPrintable / sampleLen > 0.15) {
    return { encrypted: true };
  }

  return { encrypted: false };
}

/**
 * Decodes raw `.npvs` / `.txt` / encrypted subscription content.
 * Supports plain VLESS, Base64, compressed payloads, JSON outbounds,
 * CryptoJS/OpenSSL `Salted__`, and `sponge-npvs-v1` PBKDF2+AES-GCM files.
 */
export function decodeNpvsOrSubscriptionPayload(
  rawInput: Buffer | string,
  password?: string,
): NpvsDecodeResult {
  const initialBuf = Buffer.isBuffer(rawInput) ? rawInput : Buffer.from(rawInput, 'utf8');
  const decompressed = tryDecompress(initialBuf);
  const workingBuf = decompressed ?? initialBuf;
  const text = workingBuf.toString('utf8').replace(/^\uFEFF/, '').trim();

  if (!text && workingBuf.length === 0) {
    return { status: 'unsupported', servers: [], inlineHeaders: {}, errorCode: 'EMPTY_INPUT' };
  }

  // 1. Check if it looks encrypted BEFORE plain parsing
  const encInfo = looksEncrypted(workingBuf, text);
  if (encInfo.encrypted) {
    if (!password || password.length === 0) {
      return { status: 'needs_password', servers: [], inlineHeaders: {} };
    }

    let decryptedText: string | null = null;

    if (encInfo.envelope && encInfo.envelope.format === 'sponge-npvs-v1') {
      decryptedText = tryDecryptSpongeEnvelope(encInfo.envelope as unknown as SpongeNpvsEnvelope, password);
    } else if (encInfo.saltedBuf) {
      decryptedText = tryDecryptOpenSslSalted(encInfo.saltedBuf, password);
    } else if (encInfo.envelope) {
      decryptedText = tryDecryptGenericEnvelope(encInfo.envelope, password);
    } else {
      // Fallback: try treating buffer directly as raw AES ciphertext with password hash
      decryptedText = tryDecryptOpenSslSalted(workingBuf, password);
    }

    if (!decryptedText) {
      return { status: 'invalid_password', servers: [], inlineHeaders: {}, errorCode: 'INVALID_PASSWORD' };
    }

    const parsed = parseVlessPayload(decryptedText);
    if (parsed.servers.length === 0) {
      return { status: 'unsupported', servers: [], inlineHeaders: parsed.inlineHeaders, errorCode: 'NO_VLESS_FOUND' };
    }
    return { status: 'ok', servers: parsed.servers, inlineHeaders: parsed.inlineHeaders };
  }

  // 2. Unencrypted path: parse VLESS URIs / Base64 / JSON
  const parsed = parseVlessPayload(text);
  if (parsed.servers.length > 0) {
    return { status: 'ok', servers: parsed.servers, inlineHeaders: parsed.inlineHeaders };
  }

  // 3. Could it be an unrecognized base64-encoded ciphertext if password is provided?
  if (password && /^[A-Za-z0-9+/_=\r\n-]{24,}$/.test(text)) {
    const compact = text.replace(/\s+/g, '');
    const rawFromB64 = Buffer.from(compact.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const res = tryDecryptOpenSslSalted(rawFromB64, password);
    if (res) {
      const inner = parseVlessPayload(res);
      if (inner.servers.length > 0) {
        return { status: 'ok', servers: inner.servers, inlineHeaders: inner.inlineHeaders };
      }
    }
    return { status: 'invalid_password', servers: [], inlineHeaders: {}, errorCode: 'INVALID_PASSWORD' };
  }

  return { status: 'unsupported', servers: [], inlineHeaders: parsed.inlineHeaders, errorCode: 'NO_VLESS_FOUND' };
}

/**
 * Exports servers into a `.npvs` payload.
 * When a non-empty password is supplied, encrypts with PBKDF2-SHA256 + AES-256-GCM (`sponge-npvs-v1`).
 */
export function exportNpvsPayload(servers: ServerSecretRecord[], password?: string): string {
  const uris = servers.map(buildVlessUriFromRecord).join('\n');
  if (!password) {
    return Buffer.from(uris, 'utf8').toString('base64');
  }

  const compressed = zlib.deflateSync(Buffer.from(uris, 'utf8'));
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const iterations = 120000;
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: SpongeNpvsEnvelope = {
    format: 'sponge-npvs-v1',
    cipher: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };

  return JSON.stringify(envelope, null, 2);
}

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeNpvsOrSubscriptionPayload, exportNpvsPayload } from '../electron/core/npvsCodec';
import { parseVlessUri } from '../electron/core/vlessParser';

function makeOpenSslSaltedBase64(plainText: string, passphrase: string): string {
  const salt = crypto.randomBytes(8);
  const blocks: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let total = 0;
  while (total < 48) {
    const h = crypto.createHash('md5');
    h.update(prev);
    h.update(Buffer.from(passphrase, 'utf8'));
    h.update(salt);
    prev = h.digest();
    blocks.push(prev);
    total += prev.length;
  }
  const derived = Buffer.concat(blocks);
  const key = derived.subarray(0, 32);
  const iv = derived.subarray(32, 48);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from('Salted__'), salt, enc]).toString('base64');
}

describe('npvsCodec', () => {
  const sampleVless =
    'vless://aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee@198.51.100.10:443?type=tcp&security=reality&pbk=pk123&sid=12#DE-Test';

  it('handles encrypted sponge-npvs-v1 export & password-protected import', () => {
    const srv = parseVlessUri(sampleVless)!;
    const exported = exportNpvsPayload([srv], 'krabby-patty-secret');

    const noPass = decodeNpvsOrSubscriptionPayload(exported);
    expect(noPass.status).toBe('needs_password');

    const wrongPass = decodeNpvsOrSubscriptionPayload(exported, 'plankton');
    expect(wrongPass.status).toBe('invalid_password');

    const rightPass = decodeNpvsOrSubscriptionPayload(exported, 'krabby-patty-secret');
    expect(rightPass.status).toBe('ok');
    expect(rightPass.servers).toHaveLength(1);
    expect(rightPass.servers[0].remark).toBe('DE-Test');
  });

  it('decrypts OpenSSL/CryptoJS Salted__ encrypted .npvs payloads', () => {
    const saltedB64 = makeOpenSslSaltedBase64(sampleVless, 'sponge123');
    expect(saltedB64.startsWith('U2FsdGVkX1')).toBe(true);

    expect(decodeNpvsOrSubscriptionPayload(saltedB64).status).toBe('needs_password');
    expect(decodeNpvsOrSubscriptionPayload(saltedB64, 'wrong').status).toBe('invalid_password');

    const ok = decodeNpvsOrSubscriptionPayload(saltedB64, 'sponge123');
    expect(ok.status).toBe('ok');
    expect(ok.servers[0].uuid).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('decodes compressed JSON NapsternetV/Xray .npvs payloads', () => {
    const jsonPayload = JSON.stringify({
      outbounds: [
        {
          protocol: 'vless',
          remark: '🇫🇮 Helsinki JSON',
          settings: {
            vnext: [
              {
                address: '203.0.113.55',
                port: 443,
                users: [{ id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', encryption: 'none' }],
              },
            ],
          },
          streamSettings: {
            network: 'ws',
            security: 'tls',
            wsSettings: { path: '/ray', host: 'cdn.example.com' },
            tlsSettings: { serverName: 'cdn.example.com' },
          },
        },
      ],
    });

    const gzipped = zlib.gzipSync(Buffer.from(jsonPayload, 'utf8'));
    const decoded = decodeNpvsOrSubscriptionPayload(gzipped);
    expect(decoded.status).toBe('ok');
    expect(decoded.servers).toHaveLength(1);
    expect(decoded.servers[0].countryCode).toBe('FI');
    expect(decoded.servers[0].network).toBe('ws');
  });
});

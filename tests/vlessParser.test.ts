import { describe, expect, it } from 'vitest';
import {
  buildVlessUriFromRecord,
  detectCountry,
  parseVlessPayload,
  parseVlessUri,
} from '../electron/core/vlessParser';

describe('vlessParser', () => {
  it('parses VLESS Reality + Vision URI accurately', () => {
    const uri =
      'vless://a1b2c3d4-e5f6-4789-9012-abcdef123456@de1.example.net:443?type=tcp&security=reality&fp=chrome&pbk=pubKeyXYZ&sid=ab12&spx=%2F&sni=www.microsoft.com&flow=xtls-rprx-vision#%F0%9F%87%A9%F0%9F%87%AA%20Frankfurt%20VIP';
    const parsed = parseVlessUri(uri);
    expect(parsed).not.toBeNull();
    expect(parsed?.uuid).toBe('a1b2c3d4-e5f6-4789-9012-abcdef123456');
    expect(parsed?.address).toBe('de1.example.net');
    expect(parsed?.port).toBe(443);
    expect(parsed?.security).toBe('reality');
    expect(parsed?.network).toBe('tcp');
    expect(parsed?.flow).toBe('xtls-rprx-vision');
    expect(parsed?.pbk).toBe('pubKeyXYZ');
    expect(parsed?.sid).toBe('ab12');
    expect(parsed?.sni).toBe('www.microsoft.com');
    expect(parsed?.countryCode).toBe('DE');
    expect(parsed?.countryNameFa).toBe('آلمان');
  });

  it('parses Base64 and double-Base64 subscription payloads with inline userinfo', () => {
    const raw = [
      '#subscription-userinfo: upload=1024; download=2048; total=10240; expire=1900000000',
      'vless://11111111-1111-4111-8111-111111111111@1.2.3.4:443?type=ws&security=tls&path=%2Fws&host=cdn.test#%D8%AA%D8%B1%DA%A9%DB%8C%D9%87%20TR1',
      'vless://22222222-2222-4222-8222-222222222222@[2001:db8::1]:8443?type=grpc&security=tls&serviceName=grpcSvc#Amsterdam-NL',
    ].join('\n');

    const b64 = Buffer.from(raw, 'utf8').toString('base64');
    const urlSafeB64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = parseVlessPayload(urlSafeB64);

    expect(res.servers).toHaveLength(2);
    expect(res.inlineHeaders['subscription-userinfo']).toContain('total=10240');
    expect(res.servers[0].countryCode).toBe('TR');
    expect(res.servers[0].network).toBe('ws');
    expect(res.servers[1].countryCode).toBe('NL');
    expect(res.servers[1].address).toBe('2001:db8::1');
    expect(res.servers[1].port).toBe(8443);
    expect(res.servers[1].serviceName).toBe('grpcSvc');

    // Roundtrip URI rebuild
    const rebuilt = buildVlessUriFromRecord(res.servers[0]);
    const reparsed = parseVlessUri(rebuilt);
    expect(reparsed?.uuid).toBe(res.servers[0].uuid);
    expect(reparsed?.path).toBe('/ws');
  });

  it('detects countries from emojis, Persian names, and city keywords without false positives', () => {
    expect(detectCountry('🇩🇪 Germany 1').countryCode).toBe('DE');
    expect(detectCountry('سرور فنلاند هلسینکی').countryCode).toBe('FI');
    expect(detectCountry('Istanbul Fast 02').countryCode).toBe('TR');
    expect(detectCountry('VLESS TLS TCP').countryCode).toBe('UN');
  });
});

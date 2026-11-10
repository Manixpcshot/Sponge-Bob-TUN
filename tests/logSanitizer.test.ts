import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRegisteredSecrets,
  maskUrlForDisplay,
  registerSecret,
  SafeLogger,
  sanitizeLogMessage,
} from '../electron/core/logSanitizer';

describe('logSanitizer', () => {
  afterEach(() => {
    clearRegisteredSecrets();
  });

  it('redacts VLESS URIs, HTTPS subscription URLs, UUIDs, IPs, and Reality keys', () => {
    const rawUrl = 'https://secret.panel.example.com:8443/sub/abc123token';
    const rawVless =
      'vless://11111111-2222-4333-8444-555555555555@198.51.100.42:443?security=reality&pbk=SuperSecretPublicKey123456&sid=abcd1234#MyServer';

    registerSecret(rawUrl);
    registerSecret('secret.panel.example.com');

    const log = sanitizeLogMessage(
      `Failed fetching ${rawUrl} with node ${rawVless} ip 203.0.113.9:8080 and local 127.0.0.1:10808`,
    );

    expect(log).not.toContain('secret.panel.example.com');
    expect(log).not.toContain('abc123token');
    expect(log).not.toContain('11111111-2222-4333-8444-555555555555');
    expect(log).not.toContain('198.51.100.42');
    expect(log).not.toContain('203.0.113.9');
    expect(log).not.toContain('SuperSecretPublicKey123456');
    expect(log).toContain('127.0.0.1:10808');
  });

  it('masks subscription URLs safely for UI display', () => {
    const masked = maskUrlForDisplay('https://my-private-sub.domain.org/api/v1/user/xyz');
    expect(masked).toContain('https://');
    expect(masked).not.toContain('my-private-sub');
    expect(masked).not.toContain('xyz');
  });

  it('sanitizes errors pushed through SafeLogger', () => {
    const logger = new SafeLogger();
    logger.error('Sub failed', new Error('GET https://top-secret.io/sub/999 failed for 185.10.20.30'));
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).not.toContain('top-secret.io');
    expect(entries[0].message).not.toContain('185.10.20.30');
  });
});

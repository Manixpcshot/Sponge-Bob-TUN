import type { ServerSecretRecord } from '../types';

const registeredSecrets = new Set<string>();

const SAFE_LOCAL_IPS = new Set(['127.0.0.1', '0.0.0.0']);

export function registerSecret(secret: string | undefined | null): void {
  if (!secret) return;
  const trimmed = secret.trim();
  if (trimmed.length >= 4) {
    registeredSecrets.add(trimmed);
  }
}

export function registerSecretsFromServers(servers: ServerSecretRecord[]): void {
  for (const s of servers) {
    registerSecret(s.address);
    registerSecret(s.uuid);
    registerSecret(s.pbk);
    registerSecret(s.sid);
    registerSecret(s.sni);
    registerSecret(s.hostHeader);
    registerSecret(s.authority);
  }
}

export function clearRegisteredSecrets(): void {
  registeredSecrets.clear();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strictly redacts all subscription URLs, VLESS/proxy URIs, UUIDs, non-local IPs,
 * Reality keys, passwords, base64 blobs, and registered secret strings.
 */
export function sanitizeLogMessage(input: unknown): string {
  let msg =
    input instanceof Error
      ? `${input.name}: ${input.message}`
      : typeof input === 'string'
        ? input
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();

  // 1. Strip any registered dynamic secrets (longest first to prevent partial remnants)
  if (registeredSecrets.size > 0) {
    const sorted = Array.from(registeredSecrets).sort((a, b) => b.length - a.length);
    for (const secret of sorted) {
      if (secret.length >= 4 && !SAFE_LOCAL_IPS.has(secret)) {
        msg = msg.replace(new RegExp(escapeRegExp(secret), 'gi'), '[REDACTED]');
      }
    }
  }

  // 2. Redact proxy/VPN protocol URIs
  msg = msg.replace(
    /\b(?:vless|vmess|trojan|ss|ssr|hy2|hysteria2|tuic|wireguard):\/\/[^\s"'<>]+/gi,
    '[REDACTED_CONFIG_URI]',
  );

  // 3. Redact HTTP/HTTPS URLs completely (never expose subscription endpoints or hostnames)
  msg = msg.replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]');

  // 4. Redact UUIDs
  msg = msg.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    '[REDACTED_UUID]',
  );

  // 5. Redact sensitive key=value pairs
  msg = msg.replace(
    /\b(pbk|sid|spx|sni|password|pass|pwd|secret|token|auth|key|uuid|id)\s*[:=]\s*([^\s,&;"'}]+)/gi,
    '$1=[REDACTED]',
  );

  // 6. Redact non-local IPv4 addresses (with optional :port)
  msg = msg.replace(/\b(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?\b/g, (full, ip: string) => {
    if (SAFE_LOCAL_IPS.has(ip)) return full;
    return '[REDACTED_IP]';
  });

  // 7. Redact non-loopback IPv6 addresses
  msg = msg.replace(
    /(?<![a-zA-Z0-9:])(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}(?::\d+)?(?![a-zA-Z0-9:])/g,
    (match) => {
      if (match === '::1') return match;
      return '[REDACTED_IP6]';
    },
  );

  // 8. Redact long Base64/token blobs (>= 32 chars without spaces)
  msg = msg.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, '[REDACTED_TOKEN]');

  return msg;
}

/**
 * Produces a masked display string for subscription URLs when hidden in the UI.
 */
export function maskUrlForDisplay(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url.trim());
    return `${parsed.protocol}//••••••••••/••••`;
  } catch {
    return '••••••••••••••••••••';
  }
}

export class SafeLogger {
  private readonly buffer: Array<{ ts: number; level: 'info' | 'warn' | 'error'; message: string }> = [];
  private readonly maxEntries = 200;

  private push(level: 'info' | 'warn' | 'error', raw: string): void {
    const sanitized = sanitizeLogMessage(raw);
    this.buffer.push({ ts: Date.now(), level, message: sanitized });
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }
  }

  info(message: string): void {
    this.push('info', message);
  }

  warn(message: string): void {
    this.push('warn', message);
  }

  error(message: string, err?: unknown): void {
    const detail = err ? `${message} — ${sanitizeLogMessage(err)}` : message;
    this.push('error', detail);
  }

  getEntries() {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

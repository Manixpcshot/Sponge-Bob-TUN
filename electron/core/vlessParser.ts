import crypto from 'node:crypto';
import type { ServerSecretRecord } from '../types';

interface CountryDef {
  code: string;
  fa: string;
  en: string;
  keywords: string[];
}

const COUNTRIES: CountryDef[] = [
  { code: 'DE', fa: 'آلمان', en: 'Germany', keywords: ['germany', 'deutschland', 'آلمان', 'المان', 'frankfurt', 'falkenstein', 'nuremberg', 'nuernberg', 'berlin', 'munich', 'hetzner', 'fsn1', 'nbg1', 'fra'] },
  { code: 'TR', fa: 'ترکیه', en: 'Turkey', keywords: ['turkey', 'türkiye', 'turkiye', 'ترکیه', 'istanbul', 'ankara', 'izmir', 'ist'] },
  { code: 'NL', fa: 'هلند', en: 'Netherlands', keywords: ['netherlands', 'holland', 'هلند', 'amsterdam', 'rotterdam', 'ams', 'nl-'] },
  { code: 'FI', fa: 'فنلاند', en: 'Finland', keywords: ['finland', 'suomi', 'فنلاند', 'helsinki', 'hel1', 'hel'] },
  { code: 'FR', fa: 'فرانسه', en: 'France', keywords: ['france', 'فرانسه', 'paris', 'marseille', 'lyon', 'gravelines', 'rbx', 'sbg', 'par'] },
  { code: 'GB', fa: 'بریتانیا', en: 'United Kingdom', keywords: ['united kingdom', 'britain', 'england', 'انگلیس', 'انگلستان', 'بریتانیا', 'london', 'manchester', 'uk', 'lon'] },
  { code: 'US', fa: 'آمریکا', en: 'United States', keywords: ['united states', 'america', 'usa', 'آمریکا', 'امریکا', 'ایالات متحده', 'new york', 'los angeles', 'ashburn', 'dallas', 'miami', 'chicago', 'seattle', 'silicon valley', 'san jose', 'nyc', 'lax', 'iad'] },
  { code: 'SE', fa: 'سوئد', en: 'Sweden', keywords: ['sweden', 'سوئد', 'stockholm', 'sto', 'arn'] },
  { code: 'CH', fa: 'سوئیس', en: 'Switzerland', keywords: ['switzerland', 'سوئیس', 'سوییس', 'zurich', 'zürich', 'geneva', 'zrh'] },
  { code: 'AT', fa: 'اتریش', en: 'Austria', keywords: ['austria', 'اتریش', 'vienna', 'wien', 'vie'] },
  { code: 'PL', fa: 'لهستان', en: 'Poland', keywords: ['poland', 'لهستان', 'warsaw', 'waw'] },
  { code: 'AE', fa: 'امارات', en: 'UAE', keywords: ['uae', 'emirates', 'امارات', 'دبی', 'dubai', 'abudhabi', 'dxb'] },
  { code: 'SG', fa: 'سنگاپور', en: 'Singapore', keywords: ['singapore', 'سنگاپور', 'sin', 'sgp'] },
  { code: 'JP', fa: 'ژاپن', en: 'Japan', keywords: ['japan', 'ژاپن', 'tokyo', 'osaka', 'nrt', 'tyo'] },
  { code: 'CA', fa: 'کانادا', en: 'Canada', keywords: ['canada', 'کانادا', 'toronto', 'montreal', 'vancouver', 'yyz', 'yul'] },
  { code: 'RU', fa: 'روسیه', en: 'Russia', keywords: ['russia', 'روسیه', 'moscow', 'petersburg', 'spb', 'msk'] },
  { code: 'IT', fa: 'ایتالیا', en: 'Italy', keywords: ['italy', 'ایتالیا', 'milan', 'rome', 'mil'] },
  { code: 'ES', fa: 'اسپانیا', en: 'Spain', keywords: ['spain', 'اسپانیا', 'madrid', 'barcelona', 'mad'] },
  { code: 'NO', fa: 'نروژ', en: 'Norway', keywords: ['norway', 'نروژ', 'oslo', 'osl'] },
  { code: 'DK', fa: 'دانمارک', en: 'Denmark', keywords: ['denmark', 'دانمارک', 'copenhagen', 'cph'] },
  { code: 'BE', fa: 'بلژیک', en: 'Belgium', keywords: ['belgium', 'بلژیک', 'brussels', 'bru'] },
  { code: 'IE', fa: 'ایرلند', en: 'Ireland', keywords: ['ireland', 'ایرلند', 'dublin', 'dub'] },
  { code: 'RO', fa: 'رومانی', en: 'Romania', keywords: ['romania', 'رومانی', 'bucharest', 'otp'] },
  { code: 'CZ', fa: 'چک', en: 'Czechia', keywords: ['czech', 'چک', 'prague', 'prg'] },
  { code: 'HU', fa: 'مجارستان', en: 'Hungary', keywords: ['hungary', 'مجارستان', 'budapest', 'bud'] },
  { code: 'BG', fa: 'بلغارستان', en: 'Bulgaria', keywords: ['bulgaria', 'بلغارستان', 'sofia', 'sof'] },
  { code: 'LU', fa: 'لوکزامبورگ', en: 'Luxembourg', keywords: ['luxembourg', 'لوکزامبورگ', 'lux'] },
  { code: 'EE', fa: 'استونی', en: 'Estonia', keywords: ['estonia', 'استونی', 'tallinn', 'tll'] },
  { code: 'LV', fa: 'لتونی', en: 'Latvia', keywords: ['latvia', 'لتونی', 'riga', 'rix'] },
  { code: 'LT', fa: 'لیتوانی', en: 'Lithuania', keywords: ['lithuania', 'لیتوانی', 'vilnius', 'vno'] },
  { code: 'UA', fa: 'اوکراین', en: 'Ukraine', keywords: ['ukraine', 'اوکراین', 'kyiv', 'kiev'] },
  { code: 'MD', fa: 'مولداوی', en: 'Moldova', keywords: ['moldova', 'مولداوی', 'chisinau'] },
  { code: 'HK', fa: 'هنگ‌کنگ', en: 'Hong Kong', keywords: ['hong kong', 'hongkong', 'هنگ کنگ', 'هنگ‌کنگ', 'hkg'] },
  { code: 'TW', fa: 'تایوان', en: 'Taiwan', keywords: ['taiwan', 'تایوان', 'taipei', 'tpe'] },
  { code: 'KR', fa: 'کره جنوبی', en: 'South Korea', keywords: ['korea', 'کره', 'seoul', 'icn'] },
  { code: 'IN', fa: 'هند', en: 'India', keywords: ['india', 'هند', 'mumbai', 'bangalore', 'bom'] },
  { code: 'AU', fa: 'استرالیا', en: 'Australia', keywords: ['australia', 'استرالیا', 'sydney', 'melbourne', 'syd'] },
  { code: 'BR', fa: 'برزیل', en: 'Brazil', keywords: ['brazil', 'برزیل', 'sao paulo', 'gru'] },
  { code: 'OM', fa: 'عمان', en: 'Oman', keywords: ['oman', 'عمان', 'muscat'] },
  { code: 'QA', fa: 'قطر', en: 'Qatar', keywords: ['qatar', 'قطر', 'doha'] },
  { code: 'BH', fa: 'بحرین', en: 'Bahrain', keywords: ['bahrain', 'بحرین', 'manama'] },
  { code: 'AM', fa: 'ارمنستان', en: 'Armenia', keywords: ['armenia', 'ارمنستان', 'yerevan'] },
  { code: 'GE', fa: 'گرجستان', en: 'Georgia', keywords: ['georgia', 'گرجستان', 'tbilisi'] },
  { code: 'AZ', fa: 'آذربایجان', en: 'Azerbaijan', keywords: ['azerbaijan', 'آذربایجان', 'baku'] },
  { code: 'IR', fa: 'ایران', en: 'Iran', keywords: ['iran', 'ایران', 'tehran', 'تهران'] },
];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/**
 * Extracts ISO-3166-1 alpha-2 country code from Regional Indicator flag emoji pairs (e.g. 🇩🇪 -> DE).
 */
export function extractFlagEmojiCode(text: string): string | null {
  const chars = Array.from(text);
  for (let i = 0; i < chars.length - 1; i++) {
    const cp1 = chars[i].codePointAt(0) ?? 0;
    const cp2 = chars[i + 1].codePointAt(0) ?? 0;
    if (cp1 >= 0x1f1e6 && cp1 <= 0x1f1ff && cp2 >= 0x1f1e6 && cp2 <= 0x1f1ff) {
      const code =
        String.fromCharCode(cp1 - 0x1f1e6 + 65) + String.fromCharCode(cp2 - 0x1f1e6 + 65);
      return code === 'UK' ? 'GB' : code;
    }
  }
  return null;
}

export function detectCountry(remark: string, address?: string): {
  countryCode: string;
  countryNameFa: string;
  countryNameEn: string;
} {
  // 1. Check Unicode flag emoji in remark first
  const emojiCode = extractFlagEmojiCode(remark);
  if (emojiCode) {
    const found = COUNTRY_BY_CODE.get(emojiCode);
    if (found) {
      return { countryCode: found.code, countryNameFa: found.fa, countryNameEn: found.en };
    }
    return { countryCode: emojiCode, countryNameFa: emojiCode, countryNameEn: emojiCode };
  }

  const combined = `${remark} ${address ?? ''}`.toLowerCase();

  // 2. Match explicit country/city/provider keywords
  for (const country of COUNTRIES) {
    for (const kw of country.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Avoid matching short 2-3 char tokens inside unrelated words
      if (kw.length <= 4 && /^[a-z0-9-]+$/i.test(kw)) {
        const re = new RegExp(`(?:^|[\\s\\[\\]()\\-_.:|,])${escaped}(?:$|[\\s\\[\\]()\\-_.:|,0-9])`, 'i');
        if (re.test(combined)) {
          return { countryCode: country.code, countryNameFa: country.fa, countryNameEn: country.en };
        }
      } else if (combined.includes(kw.toLowerCase())) {
        return { countryCode: country.code, countryNameFa: country.fa, countryNameEn: country.en };
      }
    }
  }

  // 3. Match delimited ISO-2 codes like [DE], DE-01, NL_VIP, TR 2
  const tokenMatches = remark.toUpperCase().match(/(?:^|[\s[\]()\-_.:|,])([A-Z]{2})(?=$|[\s[\]()\-_.:|,0-9])/g);
  if (tokenMatches) {
    for (const rawToken of tokenMatches) {
      const clean = rawToken.replace(/[^A-Z]/g, '');
      const code = clean === 'UK' ? 'GB' : clean;
      const found = COUNTRY_BY_CODE.get(code);
      if (found) {
        return { countryCode: found.code, countryNameFa: found.fa, countryNameEn: found.en };
      }
    }
  }

  return { countryCode: 'UN', countryNameFa: 'جهانی', countryNameEn: 'Global' };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function normalizeNetwork(raw?: string): ServerSecretRecord['network'] {
  const val = (raw || 'tcp').toLowerCase();
  if (val === 'raw') return 'tcp';
  if (
    val === 'tcp' ||
    val === 'ws' ||
    val === 'grpc' ||
    val === 'http' ||
    val === 'h2' ||
    val === 'httpupgrade' ||
    val === 'splithttp' ||
    val === 'xhttp' ||
    val === 'kcp' ||
    val === 'quic'
  ) {
    return val;
  }
  return 'tcp';
}

function normalizeSecurity(raw?: string): ServerSecretRecord['security'] {
  const val = (raw || 'none').toLowerCase();
  if (val === 'tls' || val === 'reality' || val === 'none') return val;
  if (val === 'xtls') return 'tls';
  return 'none';
}

function makeServerId(canonicalKey: string): string {
  return crypto.createHash('sha256').update(canonicalKey).digest('hex').slice(0, 16);
}

/**
 * Parses a single `vless://...` URI into a structured ServerSecretRecord.
 * Returns null if invalid or unsupported.
 */
export function parseVlessUri(rawUri: string, index = 0): ServerSecretRecord | null {
  const trimmed = rawUri.trim();
  if (!trimmed.toLowerCase().startsWith('vless://')) {
    return null;
  }

  try {
    // Handle URL parsing carefully (including IPv6 hosts & missing scheme features)
    const parsed = new URL(trimmed);
    const uuid = safeDecodeURIComponent(parsed.username);
    const address = parsed.hostname.replace(/^\[|\]$/g, '');
    const port = parsed.port ? Number(parsed.port) : 443;

    if (!uuid || !address || !Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }

    const params = parsed.searchParams;
    const rawHash = parsed.hash ? safeDecodeURIComponent(parsed.hash.slice(1)).trim() : '';
    const remark = rawHash || `Server #${index + 1}`;

    const network = normalizeNetwork(params.get('type') || undefined);
    const security = normalizeSecurity(params.get('security') || undefined);
    const encryption = params.get('encryption') || 'none';
    const flow = params.get('flow') || undefined;
    const sni = params.get('sni') || params.get('peer') || undefined;
    const fp = params.get('fp') || undefined;
    const pbk = params.get('pbk') || undefined;
    const sid = params.get('sid') || undefined;
    const spx = params.get('spx') || undefined;
    const alpnRaw = params.get('alpn');
    const alpn = alpnRaw
      ? alpnRaw
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : undefined;
    const allowInsecure =
      params.get('allowInsecure') === '1' ||
      params.get('allowInsecure') === 'true' ||
      params.get('insecure') === '1';

    const hostHeader = params.get('host') || undefined;
    const path = params.get('path') || undefined;
    const headerType = params.get('headerType') || undefined;
    const serviceName = params.get('serviceName') || undefined;
    const grpcMode = params.get('mode') || undefined;
    const authority = params.get('authority') || undefined;
    const seed = params.get('seed') || undefined;

    let extra: Record<string, unknown> | undefined;
    const extraParam = params.get('extra');
    if (extraParam) {
      try {
        extra = JSON.parse(extraParam);
      } catch {
        // Ignore malformed extra JSON
      }
    }

    const country = detectCountry(remark, address);
    const canonical = `${uuid}@${address}:${port}|${network}|${security}|${sni || ''}|${pbk || ''}|${path || ''}|${serviceName || ''}|${remark}`;

    return {
      id: makeServerId(canonical),
      remark,
      address,
      port,
      uuid,
      encryption,
      flow,
      network,
      security,
      sni,
      fp,
      pbk,
      sid,
      spx,
      alpn,
      allowInsecure,
      hostHeader,
      path,
      headerType,
      serviceName,
      grpcMode,
      authority,
      extra,
      seed,
      countryCode: country.countryCode,
      countryNameFa: country.countryNameFa,
      countryNameEn: country.countryNameEn,
      rawHash: makeServerId(trimmed),
    };
  } catch {
    return null;
  }
}

/**
 * Converts Xray/V2Ray/NapsternetV outbound JSON objects containing VLESS vnext entries
 * into ServerSecretRecord instances.
 */
export function parseVlessJsonObject(obj: unknown): ServerSecretRecord[] {
  const results: ServerSecretRecord[] = [];
  if (!obj || typeof obj !== 'object') return results;

  const visit = (node: unknown, fallbackRemark?: string) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => visit(item, fallbackRemark || `Server #${idx + 1}`));
      return;
    }

    const rec = node as Record<string, unknown>;

    // Case 1: Full Xray outbound object { protocol: 'vless', settings: { vnext: [...] }, streamSettings: {...} }
    if (rec.protocol === 'vless' && rec.settings && typeof rec.settings === 'object') {
      const settings = rec.settings as Record<string, unknown>;
      const vnextList = Array.isArray(settings.vnext) ? settings.vnext : [];
      const stream = (rec.streamSettings || {}) as Record<string, unknown>;

      for (const vnext of vnextList) {
        if (!vnext || typeof vnext !== 'object') continue;
        const v = vnext as Record<string, unknown>;
        const address = String(v.address || '');
        const port = Number(v.port || 443);
        const users = Array.isArray(v.users) ? v.users : [];
        const user = (users[0] || {}) as Record<string, unknown>;
        const uuid = String(user.id || '');
        if (!address || !uuid || !Number.isInteger(port)) continue;

        const remark = String(rec.remark || rec.name || rec.tag || fallbackRemark || `VLESS ${results.length + 1}`);
        const network = normalizeNetwork(typeof stream.network === 'string' ? stream.network : 'tcp');
        const security = normalizeSecurity(typeof stream.security === 'string' ? stream.security : 'none');
        const tlsSettings = (stream.tlsSettings || {}) as Record<string, unknown>;
        const realitySettings = (stream.realitySettings || {}) as Record<string, unknown>;
        const wsSettings = (stream.wsSettings || {}) as Record<string, unknown>;
        const grpcSettings = (stream.grpcSettings || {}) as Record<string, unknown>;
        const xhttpSettings = (stream.xhttpSettings || stream.splithttpSettings || {}) as Record<string, unknown>;
        const httpupgradeSettings = (stream.httpupgradeSettings || {}) as Record<string, unknown>;
        const tcpSettings = (stream.tcpSettings || {}) as Record<string, unknown>;
        const tcpHeader = (tcpSettings.header || {}) as Record<string, unknown>;

        const sni =
          (typeof realitySettings.serverName === 'string' && realitySettings.serverName) ||
          (typeof tlsSettings.serverName === 'string' && tlsSettings.serverName) ||
          undefined;
        const fp =
          (typeof realitySettings.fingerprint === 'string' && realitySettings.fingerprint) ||
          (typeof tlsSettings.fingerprint === 'string' && tlsSettings.fingerprint) ||
          undefined;
        const pbk = typeof realitySettings.publicKey === 'string' ? realitySettings.publicKey : undefined;
        const sid = typeof realitySettings.shortId === 'string' ? realitySettings.shortId : undefined;
        const spx = typeof realitySettings.spiderX === 'string' ? realitySettings.spiderX : undefined;
        const alpn = Array.isArray(tlsSettings.alpn) ? tlsSettings.alpn.map(String) : undefined;
        const allowInsecure = Boolean(tlsSettings.allowInsecure);

        const wsHeaders = (wsSettings.headers || {}) as Record<string, unknown>;
        const path =
          (typeof wsSettings.path === 'string' && wsSettings.path) ||
          (typeof httpupgradeSettings.path === 'string' && httpupgradeSettings.path) ||
          (typeof xhttpSettings.path === 'string' && xhttpSettings.path) ||
          undefined;
        const hostHeader =
          (typeof wsSettings.host === 'string' && wsSettings.host) ||
          (typeof wsHeaders.Host === 'string' && wsHeaders.Host) ||
          (typeof httpupgradeSettings.host === 'string' && httpupgradeSettings.host) ||
          (typeof xhttpSettings.host === 'string' && xhttpSettings.host) ||
          undefined;

        const country = detectCountry(remark, address);
        const canonical = `${uuid}@${address}:${port}|${network}|${security}|${sni || ''}|${pbk || ''}|${path || ''}|${remark}`;

        results.push({
          id: makeServerId(canonical),
          remark,
          address,
          port,
          uuid,
          encryption: String(user.encryption || 'none'),
          flow: typeof user.flow === 'string' && user.flow ? user.flow : undefined,
          network,
          security,
          sni,
          fp,
          pbk,
          sid,
          spx,
          alpn,
          allowInsecure,
          hostHeader,
          path,
          headerType: typeof tcpHeader.type === 'string' ? tcpHeader.type : undefined,
          serviceName: typeof grpcSettings.serviceName === 'string' ? grpcSettings.serviceName : undefined,
          grpcMode: typeof grpcSettings.multiMode === 'boolean' && grpcSettings.multiMode ? 'multi' : undefined,
          authority: typeof grpcSettings.authority === 'string' ? grpcSettings.authority : undefined,
          countryCode: country.countryCode,
          countryNameFa: country.countryNameFa,
          countryNameEn: country.countryNameEn,
          rawHash: makeServerId(JSON.stringify(rec)),
        });
      }
      return;
    }

    // Case 2: NapsternetV / simple JSON entry { uri / url / link: 'vless://...' } or direct fields
    for (const key of ['uri', 'url', 'link', 'config', 'vlessUri']) {
      if (typeof rec[key] === 'string' && rec[key].trim().toLowerCase().startsWith('vless://')) {
        const parsed = parseVlessUri(rec[key], results.length);
        if (parsed) results.push(parsed);
      }
    }

    if (
      typeof rec.address === 'string' &&
      (typeof rec.uuid === 'string' || typeof rec.id === 'string') &&
      rec.port !== undefined &&
      (!rec.protocol || rec.protocol === 'vless')
    ) {
      const uuid = String(rec.uuid || rec.id);
      const port = Number(rec.port);
      if (Number.isInteger(port) && port >= 1 && port <= 65535 && uuid.length >= 8) {
        const remark = String(rec.remark || rec.ps || rec.name || `VLESS ${results.length + 1}`);
        const network = normalizeNetwork(typeof rec.network === 'string' ? rec.network : typeof rec.net === 'string' ? rec.net : 'tcp');
        const security = normalizeSecurity(typeof rec.security === 'string' ? rec.security : typeof rec.tls === 'string' ? rec.tls : 'none');
        const country = detectCountry(remark, rec.address);
        const canonical = `${uuid}@${rec.address}:${port}|${network}|${security}|${remark}`;
        results.push({
          id: makeServerId(canonical),
          remark,
          address: rec.address,
          port,
          uuid,
          encryption: typeof rec.encryption === 'string' ? rec.encryption : 'none',
          flow: typeof rec.flow === 'string' ? rec.flow : undefined,
          network,
          security,
          sni: typeof rec.sni === 'string' ? rec.sni : undefined,
          fp: typeof rec.fp === 'string' ? rec.fp : undefined,
          pbk: typeof rec.pbk === 'string' ? rec.pbk : undefined,
          sid: typeof rec.sid === 'string' ? rec.sid : undefined,
          spx: typeof rec.spx === 'string' ? rec.spx : undefined,
          hostHeader: typeof rec.host === 'string' ? rec.host : undefined,
          path: typeof rec.path === 'string' ? rec.path : undefined,
          serviceName: typeof rec.serviceName === 'string' ? rec.serviceName : undefined,
          countryCode: country.countryCode,
          countryNameFa: country.countryNameFa,
          countryNameEn: country.countryNameEn,
          rawHash: makeServerId(JSON.stringify(rec)),
        });
        return;
      }
    }

    // Recurse into nested containers (outbounds, servers, configs, data, etc.)
    const nestedRemark =
      typeof rec.remark === 'string'
        ? rec.remark
        : typeof rec.name === 'string'
          ? rec.name
          : fallbackRemark;
    for (const val of Object.values(rec)) {
      if (val && typeof val === 'object') {
        visit(val, nestedRemark);
      }
    }
  };

  visit(obj);
  return dedupeServers(results);
}

export function dedupeServers(servers: ServerSecretRecord[]): ServerSecretRecord[] {
  const seen = new Set<string>();
  const out: ServerSecretRecord[] = [];
  for (const s of servers) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/**
 * Decodes Base64 (standard or URL-safe, optionally double-encoded) or plain text
 * containing VLESS links or JSON configs.
 */
export function tryDecodeBase64Text(input: string): string | null {
  const cleaned = input.replace(/[\r\n\s]+/g, '');
  if (!cleaned || cleaned.length < 8) return null;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleaned)) return null;

  const standard = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (standard.length % 4)) % 4;
  const padded = standard + '='.repeat(padLen);

  try {
    const buf = Buffer.from(padded, 'base64');
    if (buf.length === 0) return null;
    const text = buf.toString('utf8');
    // Heuristic: must look like printable text / VLESS URIs / JSON
    if (/vless:\/\/|vmess:\/\/|trojan:\/\/|ss:\/\/|\{\s*"|\[\s*\{|#profile|#subscription/i.test(text)) {
      return text;
    }
    // Check if double base64 encoded
    const innerCleaned = text.replace(/[\r\n\s]+/g, '');
    if (/^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(innerCleaned)) {
      const innerStd = innerCleaned.replace(/-/g, '+').replace(/_/g, '/');
      const innerPad = innerStd + '='.repeat((4 - (innerStd.length % 4)) % 4);
      const innerText = Buffer.from(innerPad, 'base64').toString('utf8');
      if (/vless:\/\/|\{\s*"/i.test(innerText)) {
        return innerText;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function parseVlessPayload(rawPayload: string): {
  servers: ServerSecretRecord[];
  inlineHeaders: Record<string, string>;
} {
  let working = rawPayload.trim();
  const inlineHeaders: Record<string, string> = {};

  // Check if entire payload is base64-encoded (and doesn't already contain plain vless:// lines)
  if (!working.includes('vless://') && !working.startsWith('{') && !working.startsWith('[')) {
    const decoded = tryDecodeBase64Text(working);
    if (decoded) {
      working = decoded.trim();
    }
  }

  // Extract inline subscription comment headers (e.g. #subscription-userinfo: upload=...)
  const lines = working.split(/\r?\n/);
  const candidateLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^#\s*([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (headerMatch) {
      inlineHeaders[headerMatch[1].toLowerCase()] = headerMatch[2].trim();
      continue;
    }
    candidateLines.push(trimmed);
  }

  // Try JSON object/array parsing first if it looks like JSON
  const joined = candidateLines.join('\n').trim();
  if (joined.startsWith('{') || joined.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(joined);
      const jsonServers = parseVlessJsonObject(parsedJson);
      if (jsonServers.length > 0) {
        return { servers: jsonServers, inlineHeaders };
      }
    } catch {
      // Fall through to line-by-line VLESS parsing
    }
  }

  // Line-by-line VLESS parsing (also scan inside lines in case of embedded base64 chunks)
  const servers: ServerSecretRecord[] = [];
  for (const line of candidateLines) {
    if (line.toLowerCase().startsWith('vless://')) {
      const server = parseVlessUri(line, servers.length);
      if (server) servers.push(server);
    } else {
      const maybeDecoded = tryDecodeBase64Text(line);
      if (maybeDecoded) {
        for (const subLine of maybeDecoded.split(/\r?\n/)) {
          if (subLine.trim().toLowerCase().startsWith('vless://')) {
            const server = parseVlessUri(subLine.trim(), servers.length);
            if (server) servers.push(server);
          }
        }
      }
    }
  }

  return { servers: dedupeServers(servers), inlineHeaders };
}

export function buildVlessUriFromRecord(s: ServerSecretRecord): string {
  const params = new URLSearchParams();
  params.set('type', s.network);
  params.set('security', s.security);
  if (s.encryption && s.encryption !== 'none') params.set('encryption', s.encryption);
  if (s.flow) params.set('flow', s.flow);
  if (s.sni) params.set('sni', s.sni);
  if (s.fp) params.set('fp', s.fp);
  if (s.pbk) params.set('pbk', s.pbk);
  if (s.sid) params.set('sid', s.sid);
  if (s.spx) params.set('spx', s.spx);
  if (s.alpn?.length) params.set('alpn', s.alpn.join(','));
  if (s.allowInsecure) params.set('allowInsecure', '1');
  if (s.hostHeader) params.set('host', s.hostHeader);
  if (s.path) params.set('path', s.path);
  if (s.headerType) params.set('headerType', s.headerType);
  if (s.serviceName) params.set('serviceName', s.serviceName);
  if (s.grpcMode) params.set('mode', s.grpcMode);
  if (s.authority) params.set('authority', s.authority);
  if (s.seed) params.set('seed', s.seed);
  if (s.extra) params.set('extra', JSON.stringify(s.extra));

  const host = s.address.includes(':') && !s.address.startsWith('[') ? `[${s.address}]` : s.address;
  const query = params.toString();
  const hash = encodeURIComponent(s.remark);
  return `vless://${encodeURIComponent(s.uuid)}@${host}:${s.port}${query ? `?${query}` : ''}#${hash}`;
}

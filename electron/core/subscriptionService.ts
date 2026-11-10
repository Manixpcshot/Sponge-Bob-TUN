import type { QuotaAlertState, ServerSecretRecord, SubscriptionUserInfo } from '../types';
import { decodeNpvsOrSubscriptionPayload } from './npvsCodec';
import { registerSecret, registerSecretsFromServers, sanitizeLogMessage } from './logSanitizer';

export function parseSubscriptionUserInfo(headerValue?: string | null): SubscriptionUserInfo | null {
  if (!headerValue) return null;
  const uploadMatch = headerValue.match(/upload\s*=\s*(\d+)/i);
  const downloadMatch = headerValue.match(/download\s*=\s*(\d+)/i);
  const totalMatch = headerValue.match(/total\s*=\s*(\d+)/i);
  const expireMatch = headerValue.match(/expire\s*=\s*(\d+)/i);

  if (!uploadMatch && !downloadMatch && !totalMatch && !expireMatch) {
    return null;
  }

  return {
    uploadBytes: uploadMatch ? Number(uploadMatch[1]) : 0,
    downloadBytes: downloadMatch ? Number(downloadMatch[1]) : 0,
    totalBytes: totalMatch ? Number(totalMatch[1]) : 0,
    expireTimestampSec: expireMatch && Number(expireMatch[1]) > 0 ? Number(expireMatch[1]) : null,
    updatedAt: Date.now(),
  };
}

export function evaluateQuotaAlert(
  userInfo: SubscriptionUserInfo | null,
  nowMs = Date.now(),
): QuotaAlertState | null {
  if (!userInfo) return null;

  const usedBytes = Math.max(0, (userInfo.uploadBytes || 0) + (userInfo.downloadBytes || 0));
  const totalBytes = Math.max(0, userInfo.totalBytes || 0);
  const percentUsed = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : null;

  const daysRemaining =
    userInfo.expireTimestampSec && userInfo.expireTimestampSec > 0
      ? (userInfo.expireTimestampSec * 1000 - nowMs) / 86400000
      : null;

  const isExpired = daysRemaining !== null && daysRemaining <= 0;
  const isOver80Percent = percentUsed !== null && percentUsed >= 80;
  const isExpiringSoon = daysRemaining !== null && daysRemaining < 3;

  return {
    shouldAlert: isOver80Percent || isExpiringSoon,
    percentUsed,
    daysRemaining,
    isExpired,
    isOver80Percent,
    isExpiringSoon,
    usedBytes,
    totalBytes,
  };
}

function decodeProfileTitle(rawTitle?: string | null): string | undefined {
  if (!rawTitle) return undefined;
  const trimmed = rawTitle.trim();
  if (trimmed.toLowerCase().startsWith('base64:')) {
    try {
      return Buffer.from(trimmed.slice(7).trim(), 'base64').toString('utf8').trim();
    } catch {
      return undefined;
    }
  }
  return trimmed;
}

export interface FetchSubscriptionResult {
  status: 'ok' | 'needs_password' | 'invalid_password' | 'error';
  servers: ServerSecretRecord[];
  userInfo: SubscriptionUserInfo | null;
  errorMessage?: string;
}

export async function fetchSubscriptionFromUrl(
  subscriptionUrl: string,
  password?: string,
  timeoutMs = 15000,
): Promise<FetchSubscriptionResult> {
  const cleanedUrl = subscriptionUrl.trim();
  if (!cleanedUrl) {
    return { status: 'error', servers: [], userInfo: null, errorMessage: 'SUBSCRIPTION_URL_EMPTY' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { status: 'error', servers: [], userInfo: null, errorMessage: 'SUBSCRIPTION_URL_INVALID_SCHEME' };
    }
  } catch {
    return { status: 'error', servers: [], userInfo: null, errorMessage: 'SUBSCRIPTION_URL_INVALID' };
  }

  // Register secret immediately so nothing downstream can log it
  registerSecret(cleanedUrl);
  registerSecret(parsedUrl.hostname);
  registerSecret(parsedUrl.pathname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(cleanedUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'SpongeBobTUN/1.0 (v2rayNG-compatible)',
        Accept: 'text/plain, application/json, application/octet-stream, */*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        status: 'error',
        servers: [],
        userInfo: null,
        errorMessage: `SUBSCRIPTION_HTTP_${response.status}`,
      };
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    const decoded = decodeNpvsOrSubscriptionPayload(rawBuffer, password);

    if (decoded.status === 'needs_password') {
      return { status: 'needs_password', servers: [], userInfo: null };
    }
    if (decoded.status === 'invalid_password') {
      return {
        status: 'invalid_password',
        servers: [],
        userInfo: null,
        errorMessage: 'INVALID_PASSWORD',
      };
    }
    if (decoded.status !== 'ok' || decoded.servers.length === 0) {
      return {
        status: 'error',
        servers: [],
        userInfo: null,
        errorMessage: decoded.errorCode || 'NO_VLESS_FOUND',
      };
    }

    registerSecretsFromServers(decoded.servers);

    const headerUserInfo =
      response.headers.get('subscription-userinfo') ||
      decoded.inlineHeaders['subscription-userinfo'];
    const parsedInfo = parseSubscriptionUserInfo(headerUserInfo);
    const title = decodeProfileTitle(
      response.headers.get('profile-title') || decoded.inlineHeaders['profile-title'],
    );
    const updateIntRaw =
      response.headers.get('profile-update-interval') ||
      decoded.inlineHeaders['profile-update-interval'];

    const userInfo: SubscriptionUserInfo | null = parsedInfo
      ? {
          ...parsedInfo,
          profileTitle: title,
          updateIntervalHours: updateIntRaw ? Number(updateIntRaw) : undefined,
        }
      : title
        ? {
            uploadBytes: 0,
            downloadBytes: 0,
            totalBytes: 0,
            expireTimestampSec: null,
            profileTitle: title,
            updateIntervalHours: updateIntRaw ? Number(updateIntRaw) : undefined,
            updatedAt: Date.now(),
          }
        : null;

    return {
      status: 'ok',
      servers: decoded.servers,
      userInfo,
    };
  } catch (err) {
    const safeMsg = sanitizeLogMessage(err);
    const isTimeout = safeMsg.toLowerCase().includes('abort');
    return {
      status: 'error',
      servers: [],
      userInfo: null,
      errorMessage: isTimeout ? 'SUBSCRIPTION_TIMEOUT' : 'SUBSCRIPTION_NETWORK_ERROR',
    };
  } finally {
    clearTimeout(timer);
  }
}

export type AppLanguage = 'fa' | 'en';
export type AppTheme = 'obsidian' | 'bikinibottom';

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type ConnectionMode = 'manual' | 'auto';

export interface SubscriptionUserInfo {
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
  expireTimestampSec: number | null;
  profileTitle?: string;
  updateIntervalHours?: number;
  updatedAt: number;
}

/**
 * Full VLESS server configuration kept strictly inside the encrypted Main Process vault.
 * NEVER sent to Renderer or written to logs.
 */
export interface ServerSecretRecord {
  id: string; // SHA-256 derived opaque ID
  remark: string;
  address: string;
  port: number;
  uuid: string;
  encryption: string;
  flow?: string;
  network: 'tcp' | 'ws' | 'grpc' | 'http' | 'h2' | 'httpupgrade' | 'splithttp' | 'xhttp' | 'kcp' | 'quic';
  security: 'none' | 'tls' | 'reality';
  sni?: string;
  fp?: string;
  pbk?: string;
  sid?: string;
  spx?: string;
  alpn?: string[];
  allowInsecure?: boolean;
  hostHeader?: string;
  path?: string;
  headerType?: string;
  serviceName?: string;
  grpcMode?: string;
  authority?: string;
  extra?: Record<string, unknown>;
  seed?: string;
  countryCode: string; // ISO-3166-1 alpha-2 or 'UN'
  countryNameFa: string;
  countryNameEn: string;
  rawHash: string;
}

/**
 * Sanitized server summary safe for UI rendering — contains NO address, UUID, SNI, pbk, sid, or raw URI.
 */
export interface PublicServerInfo {
  id: string;
  remark: string;
  countryCode: string;
  countryNameFa: string;
  countryNameEn: string;
  network: ServerSecretRecord['network'];
  security: ServerSecretRecord['security'];
  isPinned: boolean;
  latencyMs: number | null;
  healthy: boolean;
  lastCheckedAt: number | null;
  consecutiveFailures: number;
}

export interface BandwidthPoint {
  ts: number;
  uploadBps: number;
  downloadBps: number;
}

export interface TrafficStatsSnapshot {
  uploadBps: number;
  downloadBps: number;
  peakUploadBps: number;
  peakDownloadBps: number;
  sessionUploadBytes: number;
  sessionDownloadBytes: number;
  history: BandwidthPoint[];
}

export interface QuotaAlertState {
  shouldAlert: boolean;
  percentUsed: number | null;
  daysRemaining: number | null;
  isExpired: boolean;
  isOver80Percent: boolean;
  isExpiringSoon: boolean;
  usedBytes: number;
  totalBytes: number;
}

export interface AppSettings {
  language: AppLanguage;
  theme: AppTheme;
  socksPort: number;
  httpPort: number;
  enableSystemProxy: boolean;
  bypassLan: boolean;
  autoBestServer: boolean;
  latencyCheckIntervalSec: number;
  healthCheckIntervalSec: number;
  fallbackFailureThreshold: number;
  autoUpdateOnLaunch: boolean;
  autoInstallUpdateOnLaunch: boolean;
  minimizeToTrayOnClose: boolean;
  customSpongeMascotDataUrl: string | null;
  customCrabMascotDataUrl: string | null;
}

export interface UpdateStatus {
  stage: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  currentVersion: string;
  latestVersion?: string;
  percent?: number;
  message?: string;
  releaseUrl?: string;
}

export interface AppSnapshot {
  connectionState: ConnectionState;
  connectionMode: ConnectionMode;
  activeServerId: string | null;
  selectedServerId: string | null;
  hasSubscriptionUrl: boolean;
  maskedSubscriptionUrl: string;
  servers: PublicServerInfo[];
  userInfo: SubscriptionUserInfo | null;
  quotaAlert: QuotaAlertState | null;
  traffic: TrafficStatsSnapshot;
  settings: AppSettings;
  updateStatus: UpdateStatus;
  errorMessage: string | null;
  xrayAvailable: boolean;
  xrayVersion: string | null;
  connectedSince: number | null;
}

export interface SubscriptionImportResult {
  ok: boolean;
  needsPassword?: boolean;
  invalidPassword?: boolean;
  serverCount?: number;
  error?: string;
}

export interface AppToast {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface SafeLogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface WindowControlsState {
  isMaximized: boolean;
  isFullScreen: boolean;
}

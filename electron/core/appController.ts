import fs from 'node:fs';
import type {
  AppSettings,
  AppSnapshot,
  AppToast,
  ConnectionMode,
  ConnectionState,
  PublicServerInfo,
  QuotaAlertState,
  ServerSecretRecord,
  SubscriptionImportResult,
  TrafficStatsSnapshot,
  UpdateStatus,
} from '../types';
import {
  measureAllServersLatency,
  measureTcpLatency,
  probeThroughHttpProxy,
  selectBestServer,
  ServerRuntimeMetrics,
  SmartFallbackTracker,
} from './latencyService';
import { maskUrlForDisplay, registerSecret, registerSecretsFromServers, SafeLogger, sanitizeLogMessage } from './logSanitizer';
import { decodeNpvsOrSubscriptionPayload, exportNpvsPayload } from './npvsCodec';
import { SecureVaultStore, VaultState } from './secureStore';
import { evaluateQuotaAlert, fetchSubscriptionFromUrl } from './subscriptionService';
import { SystemProxyManager } from './systemProxy';
import { UpdaterService } from './updaterService';
import { XrayManager } from './xrayManager';
import { XrayStatsClient } from './xrayStatsClient';

export interface ControllerCallbacks {
  onSnapshotChanged: (snapshot: AppSnapshot) => void;
  onToast: (toast: AppToast) => void;
  onQuotaNotification: (alert: QuotaAlertState) => void;
  onTrayStateChanged: (state: ConnectionState, hasQuotaAlert: boolean) => void;
}

function emptyTraffic(): TrafficStatsSnapshot {
  return {
    uploadBps: 0,
    downloadBps: 0,
    peakUploadBps: 0,
    peakDownloadBps: 0,
    sessionUploadBytes: 0,
    sessionDownloadBytes: 0,
    history: [],
  };
}

export class AppController {
  private vaultState: VaultState;
  private readonly store: SecureVaultStore;
  private readonly logger: SafeLogger;
  private readonly xrayManager: XrayManager;
  private readonly statsClient: XrayStatsClient;
  private readonly systemProxy: SystemProxyManager;
  private readonly updater: UpdaterService;
  private readonly callbacks: ControllerCallbacks;

  private connectionState: ConnectionState = 'disconnected';
  private connectionMode: ConnectionMode = 'auto';
  private activeServerId: string | null = null;
  private errorMessage: string | null = null;
  private connectedSince: number | null = null;
  private quotaAlert: QuotaAlertState | null = null;
  private lastNotifiedAlertKey: string | null = null;

  private readonly metrics = new Map<string, ServerRuntimeMetrics>();
  private readonly fallbackTracker = new SmartFallbackTracker(3);
  private failedServersInCycle = new Set<string>();
  private isConnectingOrSwitching = false;

  private traffic: TrafficStatsSnapshot = emptyTraffic();
  private lastSampleTime = 0;
  private lastUpTotal = 0;
  private lastDownTotal = 0;

  private statsTimer: NodeJS.Timeout | null = null;
  private latencyTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private latencyProbeRunning = false;

  constructor(options: {
    userDataDir: string;
    appRoot: string;
    resourcesPath?: string;
    appVersion: string;
    isPackaged: boolean;
    safeStorage?: import('./secureStore').SafeStorageAdapter;
    callbacks: ControllerCallbacks;
  }) {
    this.callbacks = options.callbacks;
    this.logger = new SafeLogger();
    this.store = new SecureVaultStore(options.userDataDir, options.safeStorage);
    this.vaultState = this.store.load();
    this.connectionMode = this.vaultState.settings.autoBestServer ? 'auto' : 'manual';
    this.fallbackTracker.setThreshold(this.vaultState.settings.fallbackFailureThreshold);

    this.systemProxy = new SystemProxyManager(options.userDataDir, this.logger);
    this.statsClient = new XrayStatsClient();
    this.xrayManager = new XrayManager({
      appRoot: options.appRoot,
      resourcesPath: options.resourcesPath,
      logger: this.logger,
      onUnexpectedExit: (reason) => {
        void this.handleUnexpectedXrayExit(reason);
      },
    });
    this.updater = new UpdaterService({
      currentVersion: options.appVersion,
      isPackaged: options.isPackaged,
      logger: this.logger,
      onStatusChange: () => {
        this.emitSnapshot();
      },
      beforeQuitCleanup: () => this.shutdown(),
    });
    this.updater.setAutoInstallOnLaunch(this.vaultState.settings.autoInstallUpdateOnLaunch);

    this.recomputeQuotaAlert(false);
  }

  async initialize(): Promise<void> {
    await this.systemProxy.recoverStaleProxyIfNeeded();
    this.startBackgroundLatencyLoop();

    if (this.vaultState.servers.length > 0) {
      void this.probeAllLatencies();
    }

    if (this.vaultState.settings.autoUpdateOnLaunch) {
      setTimeout(() => {
        void this.updater.checkForUpdates(true);
      }, 1800);
    }
  }

  private toPublicServer(s: ServerSecretRecord): PublicServerInfo {
    const m = this.metrics.get(s.id);
    return {
      id: s.id,
      remark: s.remark,
      countryCode: s.countryCode,
      countryNameFa: s.countryNameFa,
      countryNameEn: s.countryNameEn,
      network: s.network,
      security: s.security,
      isPinned: this.vaultState.pinnedIds.includes(s.id),
      latencyMs: m?.latencyMs ?? null,
      healthy: m ? m.healthy : true,
      lastCheckedAt: m?.lastCheckedAt ?? null,
      consecutiveFailures: m?.consecutiveFailures ?? 0,
    };
  }

  getSnapshot(): AppSnapshot {
    const xrayInfo = this.xrayManager.resolveBinaryPath();
    const pinnedSet = new Set(this.vaultState.pinnedIds);
    const sortedPublic = this.vaultState.servers
      .map((s) => this.toPublicServer(s))
      .sort((a, b) => {
        const aPin = pinnedSet.has(a.id) ? 0 : 1;
        const bPin = pinnedSet.has(b.id) ? 0 : 1;
        if (aPin !== bPin) return aPin - bPin;
        return 0;
      });

    return {
      connectionState: this.connectionState,
      connectionMode: this.connectionMode,
      activeServerId: this.activeServerId,
      selectedServerId: this.vaultState.selectedServerId,
      hasSubscriptionUrl: Boolean(this.vaultState.subscriptionUrl),
      maskedSubscriptionUrl: maskUrlForDisplay(this.vaultState.subscriptionUrl),
      servers: sortedPublic,
      userInfo: this.vaultState.userInfo,
      quotaAlert: this.quotaAlert,
      traffic: { ...this.traffic, history: [...this.traffic.history] },
      settings: { ...this.vaultState.settings },
      updateStatus: this.updater.getStatus(),
      errorMessage: this.errorMessage,
      xrayAvailable: Boolean(xrayInfo.binPath),
      xrayVersion: xrayInfo.version,
      connectedSince: this.connectedSince,
    };
  }

  getDecryptedSubscriptionUrl(): string {
    return this.vaultState.subscriptionUrl;
  }

  getSafeLogs() {
    return this.logger.getEntries();
  }

  clearLogs(): void {
    this.logger.clear();
  }

  private emitSnapshot(): void {
    const snap = this.getSnapshot();
    this.callbacks.onSnapshotChanged(snap);
    this.callbacks.onTrayStateChanged(this.connectionState, Boolean(this.quotaAlert?.shouldAlert));
  }

  private emitToast(level: AppToast['level'], titleFa: string, titleEn: string, msgFa: string, msgEn: string): void {
    const isFa = this.vaultState.settings.language === 'fa';
    this.callbacks.onToast({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      level,
      title: isFa ? titleFa : titleEn,
      message: isFa ? msgFa : msgEn,
    });
  }

  private recomputeQuotaAlert(notifyUser: boolean): void {
    const alert = evaluateQuotaAlert(this.vaultState.userInfo);
    this.quotaAlert = alert;

    if (!alert || !alert.shouldAlert) {
      this.lastNotifiedAlertKey = null;
      return;
    }

    if (notifyUser) {
      const alertKey = `${alert.isOver80Percent ? '80' : ''}-${alert.isExpired ? 'exp' : alert.isExpiringSoon ? 'soon' : ''}-${Math.floor(alert.percentUsed ?? 0)}`;
      if (this.lastNotifiedAlertKey !== alertKey) {
        this.lastNotifiedAlertKey = alertKey;
        this.callbacks.onQuotaNotification(alert);

        const pctText = alert.percentUsed !== null ? `${Math.round(alert.percentUsed)}%` : '';
        const daysText =
          alert.daysRemaining !== null ? `${Math.max(0, Math.ceil(alert.daysRemaining))}` : '';

        if (alert.isExpired) {
          this.emitToast(
            'warning',
            'هشدار انقضای اشتراک',
            'Subscription Expired',
            'اعتبار زمانی اشتراک شما به پایان رسیده است.',
            'Your subscription validity has expired.',
          );
        } else if (alert.isOver80Percent && alert.isExpiringSoon) {
          this.emitToast(
            'warning',
            'هشدار حجم و زمان اشتراک',
            'Quota & Expiry Alert',
            `مصرف به ${pctText} رسیده و کمتر از ${daysText} روز به پایان باقی مانده است.`,
            `Data usage reached ${pctText} with less than ${daysText} day(s) remaining.`,
          );
        } else if (alert.isOver80Percent) {
          this.emitToast(
            'warning',
            'هشدار مصرف بیش از ۸۰٪',
            'Data Usage Over 80%',
            `${pctText} از حجم اشتراک شما مصرف شده است.`,
            `You have used ${pctText} of your subscription quota.`,
          );
        } else if (alert.isExpiringSoon) {
          this.emitToast(
            'warning',
            'هشدار نزدیک شدن به انقضا',
            'Expiring Soon',
            `کمتر از ${daysText} روز تا انقضای اشتراک باقی مانده است.`,
            `Less than ${daysText} day(s) remaining before subscription expires.`,
          );
        }
      }
    }
  }

  async updateSubscription(url?: string, password?: string): Promise<SubscriptionImportResult> {
    const targetUrl = (url !== undefined ? url : this.vaultState.subscriptionUrl).trim();
    if (!targetUrl) {
      return { ok: false, error: 'SUBSCRIPTION_URL_EMPTY' };
    }

    registerSecret(targetUrl);
    const result = await fetchSubscriptionFromUrl(targetUrl, password);

    if (result.status === 'needs_password') {
      return { ok: false, needsPassword: true };
    }
    if (result.status === 'invalid_password') {
      return { ok: false, invalidPassword: true, error: 'INVALID_PASSWORD' };
    }
    if (result.status !== 'ok') {
      this.errorMessage = this.localizeError(result.errorMessage || 'SUBSCRIPTION_NETWORK_ERROR');
      this.emitSnapshot();
      return { ok: false, error: this.errorMessage };
    }

    const validIds = new Set(result.servers.map((s) => s.id));
    this.vaultState.subscriptionUrl = targetUrl;
    this.vaultState.servers = result.servers;
    this.vaultState.pinnedIds = this.vaultState.pinnedIds.filter((id) => validIds.has(id));
    if (this.vaultState.selectedServerId && !validIds.has(this.vaultState.selectedServerId)) {
      this.vaultState.selectedServerId = result.servers[0]?.id ?? null;
    } else if (!this.vaultState.selectedServerId) {
      this.vaultState.selectedServerId = result.servers[0]?.id ?? null;
    }
    if (result.userInfo) {
      this.vaultState.userInfo = result.userInfo;
    }
    this.errorMessage = null;
    this.store.save(this.vaultState);
    this.recomputeQuotaAlert(true);
    this.emitSnapshot();

    void this.probeAllLatencies();
    return { ok: true, serverCount: result.servers.length };
  }

  async importFileOrPayload(
    rawInput: Buffer | string,
    password?: string,
    merge = false,
  ): Promise<SubscriptionImportResult> {
    const decoded = decodeNpvsOrSubscriptionPayload(rawInput, password);
    if (decoded.status === 'needs_password') {
      return { ok: false, needsPassword: true };
    }
    if (decoded.status === 'invalid_password') {
      return { ok: false, invalidPassword: true, error: 'INVALID_PASSWORD' };
    }
    if (decoded.status !== 'ok' || decoded.servers.length === 0) {
      return { ok: false, error: this.localizeError(decoded.errorCode || 'NO_VLESS_FOUND') };
    }

    registerSecretsFromServers(decoded.servers);

    if (merge && this.vaultState.servers.length > 0) {
      const existingById = new Map(this.vaultState.servers.map((s) => [s.id, s]));
      for (const srv of decoded.servers) {
        existingById.set(srv.id, srv);
      }
      this.vaultState.servers = Array.from(existingById.values());
    } else {
      this.vaultState.servers = decoded.servers;
    }

    if (!this.vaultState.selectedServerId || !this.vaultState.servers.some((s) => s.id === this.vaultState.selectedServerId)) {
      this.vaultState.selectedServerId = this.vaultState.servers[0]?.id ?? null;
    }

    this.errorMessage = null;
    this.store.save(this.vaultState);
    this.emitSnapshot();
    void this.probeAllLatencies();
    return { ok: true, serverCount: decoded.servers.length };
  }

  exportServersAsNpvs(targetFilePath: string, password?: string): boolean {
    if (this.vaultState.servers.length === 0) return false;
    const payload = exportNpvsPayload(this.vaultState.servers, password || undefined);
    fs.writeFileSync(targetFilePath, payload, 'utf8');
    return true;
  }

  selectServer(serverId: string | null, mode?: ConnectionMode): void {
    if (mode) {
      this.connectionMode = mode;
      this.vaultState.settings.autoBestServer = mode === 'auto';
    }
    if (serverId !== null) {
      this.vaultState.selectedServerId = serverId;
    }
    this.store.save(this.vaultState);
    this.emitSnapshot();
  }

  togglePinServer(serverId: string): void {
    const idx = this.vaultState.pinnedIds.indexOf(serverId);
    if (idx >= 0) {
      this.vaultState.pinnedIds.splice(idx, 1);
    } else {
      this.vaultState.pinnedIds.push(serverId);
    }
    this.store.save(this.vaultState);
    this.emitSnapshot();
  }

  async connect(modeOverride?: ConnectionMode, serverIdOverride?: string): Promise<{ ok: boolean; error?: string }> {
    if (this.isConnectingOrSwitching) {
      return { ok: false, error: 'CONNECT_IN_PROGRESS' };
    }
    if (this.vaultState.servers.length === 0) {
      const msg = this.localizeError('NO_SERVERS');
      this.errorMessage = msg;
      this.emitSnapshot();
      return { ok: false, error: msg };
    }

    this.isConnectingOrSwitching = true;
    this.failedServersInCycle.clear();
    this.fallbackTracker.reset();
    this.errorMessage = null;

    if (modeOverride) {
      this.connectionMode = modeOverride;
      this.vaultState.settings.autoBestServer = modeOverride === 'auto';
    }

    try {
      this.connectionState = 'connecting';
      this.emitSnapshot();

      let target: ServerSecretRecord | null = null;
      if (this.connectionMode === 'auto') {
        // Quick probe if we have no latency measurements yet
        const hasAnyMeasured = this.vaultState.servers.some((s) => this.metrics.get(s.id)?.lastCheckedAt);
        if (!hasAnyMeasured) {
          await this.probeAllLatencies();
        }
        target = selectBestServer(
          this.vaultState.servers,
          this.metrics,
          new Set(this.vaultState.pinnedIds),
        );
      } else {
        const chosenId = serverIdOverride || this.vaultState.selectedServerId;
        target =
          this.vaultState.servers.find((s) => s.id === chosenId) ?? this.vaultState.servers[0] ?? null;
      }

      if (!target) {
        throw new Error('NO_SERVERS');
      }

      this.vaultState.selectedServerId = target.id;
      this.store.save(this.vaultState);

      await this.startTunnelForServer(target);
      return { ok: true };
    } catch (err) {
      const cleanErr = this.localizeError(sanitizeLogMessage(err));
      this.connectionState = 'error';
      this.activeServerId = null;
      this.connectedSince = null;
      this.errorMessage = cleanErr;
      await this.systemProxy.disable();
      this.emitSnapshot();
      return { ok: false, error: cleanErr };
    } finally {
      this.isConnectingOrSwitching = false;
    }
  }

  private async startTunnelForServer(server: ServerSecretRecord): Promise<void> {
    this.stopStatsAndHealthLoops();

    await this.xrayManager.start(server, {
      socksPort: this.vaultState.settings.socksPort,
      httpPort: this.vaultState.settings.httpPort,
      bypassLan: this.vaultState.settings.bypassLan,
    });

    if (this.vaultState.settings.enableSystemProxy) {
      await this.systemProxy.enable(this.vaultState.settings.httpPort);
    } else {
      await this.systemProxy.disable();
    }

    this.activeServerId = server.id;
    this.connectionState = 'connected';
    this.connectedSince = Date.now();
    this.errorMessage = null;
    this.traffic = emptyTraffic();
    this.lastSampleTime = Date.now();
    this.lastUpTotal = 0;
    this.lastDownTotal = 0;
    this.fallbackTracker.reset();

    this.startStatsAndHealthLoops();
    this.emitSnapshot();
  }

  async disconnect(): Promise<void> {
    this.stopStatsAndHealthLoops();
    this.statsClient.close();
    await this.xrayManager.stop();
    await this.systemProxy.disable();

    this.connectionState = 'disconnected';
    this.activeServerId = null;
    this.connectedSince = null;
    this.fallbackTracker.reset();
    this.traffic = {
      ...this.traffic,
      uploadBps: 0,
      downloadBps: 0,
    };
    this.emitSnapshot();
  }

  private async handleUnexpectedXrayExit(reason: string): Promise<void> {
    if (this.connectionState !== 'connected' && this.connectionState !== 'reconnecting') return;
    this.stopStatsAndHealthLoops();

    if (this.connectionMode === 'auto' && this.vaultState.servers.length > 1 && this.activeServerId) {
      this.failedServersInCycle.add(this.activeServerId);
      const switched = await this.performSmartFallback();
      if (switched) return;
    }

    await this.systemProxy.disable();
    this.connectionState = 'error';
    this.activeServerId = null;
    this.connectedSince = null;
    this.errorMessage = this.localizeError(reason);
    this.emitSnapshot();
  }

  private startStatsAndHealthLoops(): void {
    this.statsTimer = setInterval(() => {
      void this.sampleTrafficStats();
    }, 1000);

    const healthMs = Math.max(5, this.vaultState.settings.healthCheckIntervalSec) * 1000;
    this.healthTimer = setInterval(() => {
      void this.runConnectionHealthCheck();
    }, healthMs);
  }

  private stopStatsAndHealthLoops(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async sampleTrafficStats(): Promise<void> {
    if (this.connectionState !== 'connected') return;
    const apiPort = this.xrayManager.getApiPort();
    if (!apiPort) return;

    const res = await this.statsClient.queryOutboundTraffic(apiPort, 'proxy');
    if (!res) return;

    const now = Date.now();
    const dtSec = Math.max(0.2, (now - this.lastSampleTime) / 1000);
    const deltaUp = Math.max(0, res.uplinkBytes - this.lastUpTotal);
    const deltaDown = Math.max(0, res.downlinkBytes - this.lastDownTotal);

    const uploadBps = Math.round(deltaUp / dtSec);
    const downloadBps = Math.round(deltaDown / dtSec);

    this.lastSampleTime = now;
    this.lastUpTotal = res.uplinkBytes;
    this.lastDownTotal = res.downlinkBytes;

    const nextHistory = [
      ...this.traffic.history,
      { ts: now, uploadBps, downloadBps },
    ].slice(-60);

    this.traffic = {
      uploadBps,
      downloadBps,
      peakUploadBps: Math.max(this.traffic.peakUploadBps, uploadBps),
      peakDownloadBps: Math.max(this.traffic.peakDownloadBps, downloadBps),
      sessionUploadBytes: res.uplinkBytes,
      sessionDownloadBytes: res.downlinkBytes,
      history: nextHistory,
    };

    this.emitSnapshot();
  }

  private async runConnectionHealthCheck(): Promise<void> {
    if (this.connectionState !== 'connected' || this.isConnectingOrSwitching) return;
    if (!this.activeServerId) return;

    const rtt = await probeThroughHttpProxy(this.vaultState.settings.httpPort);
    const currentMetrics = this.metrics.get(this.activeServerId) || {
      latencyMs: null,
      healthy: true,
      lastCheckedAt: null,
      consecutiveFailures: 0,
    };

    if (rtt !== null) {
      this.fallbackTracker.recordSuccess();
      this.metrics.set(this.activeServerId, {
        latencyMs: rtt,
        healthy: true,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
      });
      this.emitSnapshot();
      return;
    }

    const { count, shouldSwitch } = this.fallbackTracker.recordFailure();
    this.metrics.set(this.activeServerId, {
      ...currentMetrics,
      healthy: !shouldSwitch,
      lastCheckedAt: Date.now(),
      consecutiveFailures: count,
    });

    this.logger.warn(`Active connection health check failed (${count}/${this.vaultState.settings.fallbackFailureThreshold})`);

    if (shouldSwitch && this.vaultState.servers.length > 1) {
      this.failedServersInCycle.add(this.activeServerId);
      await this.performSmartFallback();
    } else {
      this.emitSnapshot();
    }
  }

  private async performSmartFallback(): Promise<boolean> {
    if (this.isConnectingOrSwitching) return false;
    this.isConnectingOrSwitching = true;

    try {
      this.connectionState = 'reconnecting';
      this.emitSnapshot();

      await this.probeAllLatencies();

      if (this.failedServersInCycle.size >= this.vaultState.servers.length) {
        this.failedServersInCycle.clear();
        if (this.activeServerId) this.failedServersInCycle.add(this.activeServerId);
      }

      const nextBest = selectBestServer(
        this.vaultState.servers,
        this.metrics,
        new Set(this.vaultState.pinnedIds),
        this.failedServersInCycle,
      );

      if (!nextBest) return false;

      await this.startTunnelForServer(nextBest);
      this.emitToast(
        'info',
        'سوئیچ هوشمند به سرور سریع‌تر',
        'Smart Auto-Fallback',
        `اتصال خودکار به «${nextBest.remark}» برقرار شد.`,
        `Automatically switched to "${nextBest.remark}".`,
      );
      return true;
    } catch (err) {
      this.logger.error('Smart fallback switch failed', err);
      return false;
    } finally {
      this.isConnectingOrSwitching = false;
    }
  }

  private startBackgroundLatencyLoop(): void {
    if (this.latencyTimer) clearInterval(this.latencyTimer);
    const intervalMs = Math.max(15, this.vaultState.settings.latencyCheckIntervalSec) * 1000;
    this.latencyTimer = setInterval(() => {
      if (this.vaultState.servers.length > 0) {
        void this.probeAllLatencies();
      }
    }, intervalMs);
  }

  async probeAllLatencies(): Promise<void> {
    if (this.latencyProbeRunning || this.vaultState.servers.length === 0) return;
    this.latencyProbeRunning = true;

    try {
      const results = await measureAllServersLatency(this.vaultState.servers, 8, measureTcpLatency);
      for (const [id, info] of results.entries()) {
        const prev = this.metrics.get(id);
        this.metrics.set(id, {
          latencyMs: info.latencyMs,
          healthy: info.healthy,
          lastCheckedAt: info.checkedAt,
          consecutiveFailures: info.healthy ? 0 : (prev?.consecutiveFailures ?? 0),
        });
      }
      this.emitSnapshot();
    } finally {
      this.latencyProbeRunning = false;
    }
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSnapshot> {
    const prev = this.vaultState.settings;
    const next: AppSettings = { ...prev, ...patch };
    this.vaultState.settings = next;
    this.connectionMode = next.autoBestServer ? 'auto' : 'manual';
    this.fallbackTracker.setThreshold(next.fallbackFailureThreshold);
    this.updater.setAutoInstallOnLaunch(next.autoInstallUpdateOnLaunch);

    this.store.save(this.vaultState);

    if (prev.latencyCheckIntervalSec !== next.latencyCheckIntervalSec) {
      this.startBackgroundLatencyLoop();
    }

    // Reconfigure active tunnel if proxy ports / bypassLan / systemProxy changed while connected
    const proxyRelevantChanged =
      prev.socksPort !== next.socksPort ||
      prev.httpPort !== next.httpPort ||
      prev.bypassLan !== next.bypassLan ||
      prev.enableSystemProxy !== next.enableSystemProxy;

    if (proxyRelevantChanged && this.connectionState === 'connected' && this.activeServerId) {
      const srv = this.vaultState.servers.find((s) => s.id === this.activeServerId);
      if (srv) {
        await this.startTunnelForServer(srv);
      }
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async checkForUpdatesNow(): Promise<UpdateStatus> {
    return this.updater.checkForUpdates(false);
  }

  async installUpdateNow(): Promise<void> {
    await this.updater.installAndRelaunch();
  }

  clearSubscriptionData(): void {
    this.vaultState.subscriptionUrl = '';
    this.vaultState.servers = [];
    this.vaultState.pinnedIds = [];
    this.vaultState.selectedServerId = null;
    this.vaultState.userInfo = null;
    this.quotaAlert = null;
    this.metrics.clear();
    this.store.save(this.vaultState);
    this.emitSnapshot();
  }

  private localizeError(codeOrMsg: string): string {
    const isFa = this.vaultState.settings.language === 'fa';
    const table: Record<string, { fa: string; en: string }> = {
      SUBSCRIPTION_URL_EMPTY: {
        fa: 'لطفاً لینک اشتراک را وارد کنید.',
        en: 'Please enter a subscription URL.',
      },
      SUBSCRIPTION_URL_INVALID_SCHEME: {
        fa: 'لینک اشتراک باید با http یا https شروع شود.',
        en: 'Subscription URL must start with http:// or https://.',
      },
      SUBSCRIPTION_URL_INVALID: {
        fa: 'فرمت لینک اشتراک معتبر نیست.',
        en: 'Invalid subscription URL format.',
      },
      SUBSCRIPTION_TIMEOUT: {
        fa: 'زمان دریافت اشتراک به پایان رسید. اتصال اینترنت را بررسی کنید.',
        en: 'Subscription request timed out. Please check your internet connection.',
      },
      SUBSCRIPTION_NETWORK_ERROR: {
        fa: 'خطا در برقراری ارتباط برای دریافت اشتراک.',
        en: 'Network error while fetching subscription.',
      },
      INVALID_PASSWORD: {
        fa: 'رمز عبور وارد شده اشتباه است.',
        en: 'Incorrect password.',
      },
      NO_VLESS_FOUND: {
        fa: 'هیچ کانفیگ معتبر VLESS در محتوای دریافتی پیدا نشد.',
        en: 'No valid VLESS configurations were found.',
      },
      NO_SERVERS: {
        fa: 'هیچ سروری در فهرست موجود نیست. ابتدا اشتراک یا فایل npvs را وارد کنید.',
        en: 'No servers available. Import a subscription URL or .npvs file first.',
      },
      XRAY_BINARY_MISSING: {
        fa: 'فایل هسته Xray در مسیر برنامه یافت نشد.',
        en: 'Xray core binary was not found in app resources.',
      },
      XRAY_STARTUP_TIMEOUT: {
        fa: 'اجرای پروکسی محلی Xray با خطا یا تأخیر مواجه شد.',
        en: 'Xray local proxy failed to start in time.',
      },
    };

    if (codeOrMsg.startsWith('SUBSCRIPTION_HTTP_')) {
      const code = codeOrMsg.replace('SUBSCRIPTION_HTTP_', '');
      return isFa
        ? `سرور اشتراک کد خطای ${code} برگرداند.`
        : `Subscription server returned HTTP ${code}.`;
    }

    const mapped = table[codeOrMsg];
    if (mapped) return isFa ? mapped.fa : mapped.en;
    return sanitizeLogMessage(codeOrMsg);
  }

  async shutdown(): Promise<void> {
    if (this.latencyTimer) {
      clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }
    this.stopStatsAndHealthLoops();
    this.statsClient.close();
    await this.xrayManager.stop();
    await this.systemProxy.disable();
  }
}

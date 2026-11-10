import type { SpongeTunBridge } from '../electron/preload';
import type {
  AppSettings,
  AppSnapshot,
  AppToast,
  ConnectionMode,
  SafeLogEntry,
  SubscriptionImportResult,
  UpdateStatus,
  WindowControlsState,
} from '../electron/types';

declare global {
  interface Window {
    spongeTun?: SpongeTunBridge;
  }
}

const DEFAULT_PREVIEW_SETTINGS: AppSettings = {
  language: 'fa',
  theme: 'obsidian',
  socksPort: 10808,
  httpPort: 10809,
  enableSystemProxy: true,
  bypassLan: true,
  autoBestServer: true,
  latencyCheckIntervalSec: 45,
  healthCheckIntervalSec: 15,
  fallbackFailureThreshold: 3,
  autoUpdateOnLaunch: true,
  autoInstallUpdateOnLaunch: true,
  minimizeToTrayOnClose: true,
  customSpongeMascotDataUrl: null,
  customCrabMascotDataUrl: null,
};

function createPreviewBridge(): SpongeTunBridge {
  let state: AppSnapshot = {
    connectionState: 'disconnected',
    connectionMode: 'auto',
    activeServerId: null,
    selectedServerId: 'srv-de-1',
    hasSubscriptionUrl: false,
    maskedSubscriptionUrl: '',
    servers: [
      {
        id: 'srv-de-1',
        remark: '🇩🇪 Frankfurt Reality VIP',
        countryCode: 'DE',
        countryNameFa: 'آلمان',
        countryNameEn: 'Germany',
        network: 'tcp',
        security: 'reality',
        isPinned: true,
        latencyMs: 68,
        healthy: true,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
      },
      {
        id: 'srv-tr-1',
        remark: '🇹🇷 Istanbul WS Fast',
        countryCode: 'TR',
        countryNameFa: 'ترکیه',
        countryNameEn: 'Turkey',
        network: 'ws',
        security: 'tls',
        isPinned: false,
        latencyMs: 54,
        healthy: true,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
      },
      {
        id: 'srv-nl-1',
        remark: '🇳🇱 Amsterdam gRPC',
        countryCode: 'NL',
        countryNameFa: 'هلند',
        countryNameEn: 'Netherlands',
        network: 'grpc',
        security: 'reality',
        isPinned: false,
        latencyMs: 92,
        healthy: true,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
      },
      {
        id: 'srv-fi-1',
        remark: '🇫🇮 Helsinki Node 01',
        countryCode: 'FI',
        countryNameFa: 'فنلاند',
        countryNameEn: 'Finland',
        network: 'tcp',
        security: 'reality',
        isPinned: false,
        latencyMs: 112,
        healthy: true,
        lastCheckedAt: Date.now(),
        consecutiveFailures: 0,
      },
    ],
    userInfo: {
      uploadBytes: 12 * 1024 ** 3,
      downloadBytes: 72 * 1024 ** 3,
      totalBytes: 100 * 1024 ** 3,
      expireTimestampSec: Math.floor(Date.now() / 1000) + 2 * 86400,
      profileTitle: 'Bikini Bottom VIP',
      updatedAt: Date.now(),
    },
    quotaAlert: {
      shouldAlert: true,
      percentUsed: 84,
      daysRemaining: 2,
      isExpired: false,
      isOver80Percent: true,
      isExpiringSoon: true,
      usedBytes: 84 * 1024 ** 3,
      totalBytes: 100 * 1024 ** 3,
    },
    traffic: {
      uploadBps: 0,
      downloadBps: 0,
      peakUploadBps: 0,
      peakDownloadBps: 0,
      sessionUploadBytes: 0,
      sessionDownloadBytes: 0,
      history: [],
    },
    settings: { ...DEFAULT_PREVIEW_SETTINGS },
    updateStatus: {
      stage: 'up-to-date',
      currentVersion: '1.0.0',
      releaseUrl: 'https://github.com/Manixpcshot/Sponge-Bob-TUN/releases',
    },
    errorMessage: null,
    xrayAvailable: true,
    xrayVersion: 'v26.11.9',
    connectedSince: null,
  };

  const listeners = new Set<(s: AppSnapshot) => void>();
  const toastListeners = new Set<(t: AppToast) => void>();
  let simTimer: number | null = null;

  const emit = () => listeners.forEach((cb) => cb({ ...state }));

  return {
    getSnapshot: async () => state,
    getSubscriptionUrl: async () => '',
    updateSubscription: async (url): Promise<SubscriptionImportResult> => {
      if (!url) return { ok: true, serverCount: state.servers.length };
      state = { ...state, hasSubscriptionUrl: true, maskedSubscriptionUrl: 'https://••••••••••/••••' };
      emit();
      return { ok: true, serverCount: state.servers.length };
    },
    importFileDialog: async () => ({ ok: false, canceled: true }),
    importRawPayload: async () => ({ ok: true, serverCount: state.servers.length }),
    exportNpvsDialog: async () => ({ ok: false, canceled: true }),
    clearSubscription: async () => {
      state = { ...state, hasSubscriptionUrl: false, maskedSubscriptionUrl: '', servers: [] };
      emit();
      return state;
    },
    selectServer: async (serverId, mode) => {
      state = {
        ...state,
        selectedServerId: serverId ?? state.selectedServerId,
        connectionMode: mode ?? state.connectionMode,
      };
      emit();
      return state;
    },
    togglePinServer: async (serverId) => {
      state = {
        ...state,
        servers: state.servers.map((s) => (s.id === serverId ? { ...s, isPinned: !s.isPinned } : s)),
      };
      emit();
      return state;
    },
    probeLatencies: async () => {
      emit();
    },
    connect: async (mode?: ConnectionMode, serverId?: string) => {
      if (simTimer) window.clearInterval(simTimer);
      const targetId = serverId || state.selectedServerId || state.servers[0]?.id || null;
      state = {
        ...state,
        connectionMode: mode ?? state.connectionMode,
        connectionState: 'connected',
        activeServerId: targetId,
        connectedSince: Date.now(),
      };
      simTimer = window.setInterval(() => {
        const down = Math.round(350_000 + Math.random() * 1_600_000);
        const up = Math.round(70_000 + Math.random() * 320_000);
        state = {
          ...state,
          traffic: {
            uploadBps: up,
            downloadBps: down,
            peakUploadBps: Math.max(state.traffic.peakUploadBps, up),
            peakDownloadBps: Math.max(state.traffic.peakDownloadBps, down),
            sessionUploadBytes: state.traffic.sessionUploadBytes + up,
            sessionDownloadBytes: state.traffic.sessionDownloadBytes + down,
            history: [...state.traffic.history, { ts: Date.now(), uploadBps: up, downloadBps: down }].slice(-60),
          },
        };
        emit();
      }, 1000);
      emit();
      return { ok: true };
    },
    disconnect: async () => {
      if (simTimer) window.clearInterval(simTimer);
      state = {
        ...state,
        connectionState: 'disconnected',
        activeServerId: null,
        connectedSince: null,
        traffic: { ...state.traffic, uploadBps: 0, downloadBps: 0 },
      };
      emit();
    },
    updateSettings: async (patch) => {
      state = {
        ...state,
        settings: { ...state.settings, ...patch },
        connectionMode:
          patch.autoBestServer !== undefined ? (patch.autoBestServer ? 'auto' : 'manual') : state.connectionMode,
      };
      emit();
      return state;
    },
    pickMascotImage: async () => ({ ok: false }),
    getLogs: async (): Promise<SafeLogEntry[]> => [
      { ts: Date.now(), level: 'info', message: 'Sponge bob tun initialized securely (preview mode)' },
    ],
    clearLogs: async () => {},
    checkUpdates: async (): Promise<UpdateStatus> => state.updateStatus,
    installUpdate: async () => {},
    openGithubRepo: async () => {
      window.open('https://github.com/Manixpcshot/Sponge-Bob-TUN', '_blank');
    },
    windowMinimize: async () => {},
    windowToggleMaximize: async (): Promise<WindowControlsState> => ({ isMaximized: false, isFullScreen: false }),
    windowToggleFullscreen: async (): Promise<WindowControlsState> => ({ isMaximized: false, isFullScreen: false }),
    windowClose: async () => {},
    windowGetState: async (): Promise<WindowControlsState> => ({ isMaximized: false, isFullScreen: false }),
    onSnapshot: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onToast: (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    onWindowState: () => () => {},
  };
}

let cachedBridge: SpongeTunBridge | null = null;

export function getSpongeBridge(): SpongeTunBridge {
  if (window.spongeTun) return window.spongeTun;
  if (!cachedBridge) cachedBridge = createPreviewBridge();
  return cachedBridge;
}

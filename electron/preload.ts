import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  AppSnapshot,
  AppToast,
  ConnectionMode,
  SafeLogEntry,
  SubscriptionImportResult,
  UpdateStatus,
  WindowControlsState,
} from './types';

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke('app:get-snapshot'),
  getSubscriptionUrl: (): Promise<string> => ipcRenderer.invoke('sub:get-url'),
  updateSubscription: (url?: string, password?: string): Promise<SubscriptionImportResult> =>
    ipcRenderer.invoke('sub:update', { url, password }),
  importFileDialog: (password?: string): Promise<SubscriptionImportResult & { canceled?: boolean }> =>
    ipcRenderer.invoke('sub:import-file-dialog', { password }),
  importRawPayload: (
    base64OrText: string,
    isBase64Bytes: boolean,
    password?: string,
  ): Promise<SubscriptionImportResult> =>
    ipcRenderer.invoke('sub:import-raw', { base64OrText, isBase64Bytes, password }),
  exportNpvsDialog: (password?: string): Promise<{ ok: boolean; canceled?: boolean }> =>
    ipcRenderer.invoke('sub:export-npvs-dialog', { password }),
  clearSubscription: (): Promise<AppSnapshot> => ipcRenderer.invoke('sub:clear'),

  selectServer: (serverId: string | null, mode?: ConnectionMode): Promise<AppSnapshot> =>
    ipcRenderer.invoke('server:select', { serverId, mode }),
  togglePinServer: (serverId: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke('server:toggle-pin', { serverId }),
  probeLatencies: (): Promise<void> => ipcRenderer.invoke('server:probe-latencies'),

  connect: (mode?: ConnectionMode, serverId?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('vpn:connect', { mode, serverId }),
  disconnect: (): Promise<void> => ipcRenderer.invoke('vpn:disconnect'),

  updateSettings: (patch: Partial<AppSettings>): Promise<AppSnapshot> =>
    ipcRenderer.invoke('settings:update', patch),
  pickMascotImage: (target: 'sponge' | 'crab'): Promise<{ ok: boolean; dataUrl?: string }> =>
    ipcRenderer.invoke('settings:pick-mascot', { target }),

  getLogs: (): Promise<SafeLogEntry[]> => ipcRenderer.invoke('logs:get'),
  clearLogs: (): Promise<void> => ipcRenderer.invoke('logs:clear'),

  checkUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  openGithubRepo: (subpath?: string): Promise<void> => ipcRenderer.invoke('app:open-github', subpath),

  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: (): Promise<WindowControlsState> => ipcRenderer.invoke('window:toggle-maximize'),
  windowToggleFullscreen: (): Promise<WindowControlsState> => ipcRenderer.invoke('window:toggle-fullscreen'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowGetState: (): Promise<WindowControlsState> => ipcRenderer.invoke('window:get-state'),

  onSnapshot: (listener: (snapshot: AppSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snap: AppSnapshot) => listener(snap);
    ipcRenderer.on('app:snapshot', handler);
    return () => ipcRenderer.removeListener('app:snapshot', handler);
  },
  onToast: (listener: (toast: AppToast) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, toast: AppToast) => listener(toast);
    ipcRenderer.on('app:toast', handler);
    return () => ipcRenderer.removeListener('app:toast', handler);
  },
  onWindowState: (listener: (state: WindowControlsState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowControlsState) => listener(state);
    ipcRenderer.on('window:state-changed', handler);
    return () => ipcRenderer.removeListener('window:state-changed', handler);
  },
};

contextBridge.exposeInMainWorld('spongeTun', api);

export type SpongeTunBridge = typeof api;

import type { UpdateStatus } from '../types';
import { SafeLogger, sanitizeLogMessage } from './logSanitizer';

const GITHUB_OWNER = 'Manixpcshot';
const GITHUB_REPO = 'Sponge-Bob-TUN';
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

export function compareSemver(a: string, b: string): number {
  const cleanA = a.replace(/^v/i, '').split('-')[0].split('.').map(Number);
  const cleanB = b.replace(/^v/i, '').split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = cleanA[i] || 0;
    const vb = cleanB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export class UpdaterService {
  private status: UpdateStatus;
  private autoInstallOnDownload = true;
  private isPackaged = false;
  private readonly logger: SafeLogger;
  private readonly onStatusChange: (status: UpdateStatus) => void;
  private readonly beforeQuitCleanup: () => Promise<void>;
  private autoUpdaterInstance: typeof import('electron-updater').autoUpdater | null = null;
  private initialized = false;

  constructor(options: {
    currentVersion: string;
    isPackaged: boolean;
    logger: SafeLogger;
    onStatusChange: (status: UpdateStatus) => void;
    beforeQuitCleanup: () => Promise<void>;
  }) {
    this.isPackaged = options.isPackaged;
    this.logger = options.logger;
    this.onStatusChange = options.onStatusChange;
    this.beforeQuitCleanup = options.beforeQuitCleanup;
    this.status = {
      stage: 'idle',
      currentVersion: options.currentVersion,
      releaseUrl: RELEASES_URL,
    };
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  setAutoInstallOnLaunch(enabled: boolean): void {
    this.autoInstallOnDownload = enabled;
  }

  private emit(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.onStatusChange(this.getStatus());
  }

  private initElectronUpdater(): void {
    if (this.initialized || !this.isPackaged) return;
    this.initialized = true;

    try {
      // Dynamic require so tests in plain Node don't fail loading Electron's app object
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
      this.autoUpdaterInstance = autoUpdater;

      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowPrerelease = false;
      autoUpdater.logger = {
        info: (msg: unknown) => this.logger.info(`updater: ${sanitizeLogMessage(msg)}`),
        warn: (msg: unknown) => this.logger.warn(`updater: ${sanitizeLogMessage(msg)}`),
        error: (msg: unknown) => this.logger.error('updater', msg),
      };

      autoUpdater.on('checking-for-update', () => {
        this.emit({ stage: 'checking', message: undefined });
      });

      autoUpdater.on('update-available', (info) => {
        this.emit({
          stage: 'available',
          latestVersion: info.version,
          percent: 0,
          releaseUrl: `${RELEASES_URL}/tag/v${info.version}`,
        });
      });

      autoUpdater.on('download-progress', (progress) => {
        this.emit({
          stage: 'downloading',
          percent: Math.round(progress.percent || 0),
        });
      });

      autoUpdater.on('update-downloaded', async (info) => {
        this.emit({
          stage: 'downloaded',
          latestVersion: info.version,
          percent: 100,
          releaseUrl: `${RELEASES_URL}/tag/v${info.version}`,
        });

        if (this.autoInstallOnDownload) {
          this.logger.info(`Update v${info.version} downloaded — preparing clean quit & relaunch`);
          setTimeout(async () => {
            await this.installAndRelaunch();
          }, 1200);
        }
      });

      autoUpdater.on('update-not-available', () => {
        this.emit({ stage: 'up-to-date', percent: undefined });
      });

      autoUpdater.on('error', (err) => {
        this.emit({
          stage: 'error',
          message: sanitizeLogMessage(err),
        });
      });
    } catch (err) {
      this.logger.error('Failed to initialize electron-updater', err);
    }
  }

  async checkForUpdates(isAutoLaunchCheck = false): Promise<UpdateStatus> {
    this.emit({ stage: 'checking', message: undefined });

    if (this.isPackaged) {
      this.initElectronUpdater();
      if (this.autoUpdaterInstance) {
        try {
          await this.autoUpdaterInstance.checkForUpdates();
        } catch (err) {
          this.emit({
            stage: 'error',
            message: isAutoLaunchCheck ? undefined : sanitizeLogMessage(err),
          });
        }
        return this.getStatus();
      }
    }

    // Fallback / dev-mode read-only GitHub Releases API check
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': `SpongeBobTUN/${this.status.currentVersion}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );
      clearTimeout(timer);

      if (res.status === 404) {
        this.emit({ stage: 'up-to-date' });
        return this.getStatus();
      }
      if (!res.ok) {
        throw new Error(`GitHub check status ${res.status}`);
      }
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (data.tag_name || '').replace(/^v/i, '');
      if (latest && compareSemver(latest, this.status.currentVersion) > 0) {
        this.emit({
          stage: 'available',
          latestVersion: latest,
          releaseUrl: data.html_url || RELEASES_URL,
        });
      } else {
        this.emit({ stage: 'up-to-date' });
      }
    } catch (err) {
      this.emit({
        stage: isAutoLaunchCheck ? 'idle' : 'error',
        message: isAutoLaunchCheck ? undefined : sanitizeLogMessage(err),
      });
    }

    return this.getStatus();
  }

  async installAndRelaunch(): Promise<void> {
    try {
      await this.beforeQuitCleanup();
    } catch {
      // proceed anyway
    }
    if (this.autoUpdaterInstance) {
      // silent = true, isForceRunAfter = true -> closes, installs, relaunches once automatically
      this.autoUpdaterInstance.quitAndInstall(true, true);
    }
  }
}

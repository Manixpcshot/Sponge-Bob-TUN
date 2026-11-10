import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubReleaseResponse {
  tag_name?: string;
  html_url?: string;
  assets?: GithubReleaseAsset[];
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
  private pendingPortableAsset: { version: string; url: string; downloadedPath?: string } | null = null;

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

  private isPortableBuild(): boolean {
    if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) {
      return true;
    }
    if (process.execPath && fs.existsSync(path.join(path.dirname(process.execPath), 'PORTABLE_MODE.txt'))) {
      return true;
    }
    if (this.isPackaged && process.resourcesPath) {
      const appUpdateYml = path.join(process.resourcesPath, 'app-update.yml');
      return !fs.existsSync(appUpdateYml);
    }
    return false;
  }

  private canUseElectronUpdater(): boolean {
    return this.isPackaged && !this.isPortableBuild();
  }

  private initElectronUpdater(): void {
    if (this.initialized || !this.canUseElectronUpdater()) return;
    this.initialized = true;

    try {
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

  private async downloadPortableUpdate(version: string, assetUrl: string): Promise<void> {
    const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
    if (!portableExe || process.platform !== 'win32') return;

    try {
      this.emit({ stage: 'downloading', latestVersion: version, percent: 15 });
      const res = await fetch(assetUrl, {
        headers: { 'User-Agent': `SpongeBobTUN/${this.status.currentVersion}` },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`Download HTTP ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      // Validate Windows PE ("MZ") signature and reasonable size (>1MB)
      if (buf.length < 1_000_000 || buf[0] !== 0x4d || buf[1] !== 0x5a) {
        throw new Error('Downloaded update failed PE integrity check');
      }

      const stagePath = path.join(os.tmpdir(), `sponge-bob-tun-portable-${version}.exe`);
      fs.writeFileSync(stagePath, buf);
      this.pendingPortableAsset = { version, url: assetUrl, downloadedPath: stagePath };
      this.emit({
        stage: 'downloaded',
        latestVersion: version,
        percent: 100,
        releaseUrl: `${RELEASES_URL}/tag/v${version}`,
      });

      if (this.autoInstallOnDownload) {
        setTimeout(() => {
          void this.installAndRelaunch();
        }, 1200);
      }
    } catch (err) {
      this.logger.warn(`Portable auto-update download skipped: ${sanitizeLogMessage(err)}`);
    }
  }

  async checkForUpdates(isAutoLaunchCheck = false): Promise<UpdateStatus> {
    this.emit({ stage: 'checking', message: undefined });

    if (this.canUseElectronUpdater()) {
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

    // Portable mode OR dev mode: query GitHub Releases API safely without app-update.yml
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
      const data = (await res.json()) as GithubReleaseResponse;
      const latest = (data.tag_name || '').replace(/^v/i, '');
      if (latest && compareSemver(latest, this.status.currentVersion) > 0) {
        this.emit({
          stage: 'available',
          latestVersion: latest,
          releaseUrl: data.html_url || RELEASES_URL,
        });

        // If running inside single-file Windows Portable .exe, auto-download new Portable .exe
        if (this.isPortableBuild() && process.env.PORTABLE_EXECUTABLE_FILE && Array.isArray(data.assets)) {
          const portableAsset = data.assets.find((a) =>
            /Electron-Portable-.*\.exe$/i.test(a.name),
          );
          if (portableAsset) {
            this.pendingPortableAsset = {
              version: latest,
              url: portableAsset.browser_download_url,
            };
            await this.downloadPortableUpdate(latest, portableAsset.browser_download_url);
          }
        }
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
      this.autoUpdaterInstance.quitAndInstall(true, true);
      return;
    }

    const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
    const downloadedPath = this.pendingPortableAsset?.downloadedPath;
    if (process.platform === 'win32' && portableExe && downloadedPath && fs.existsSync(downloadedPath)) {
      const escapedSrc = downloadedPath.replace(/'/g, "''");
      const escapedDst = portableExe.replace(/'/g, "''");
      const psCmd = `Start-Sleep -Milliseconds 1200; Copy-Item -LiteralPath '${escapedSrc}' -Destination '${escapedDst}' -Force; Remove-Item -LiteralPath '${escapedSrc}' -Force -ErrorAction SilentlyContinue; Start-Process -FilePath '${escapedDst}'`;
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psCmd],
        { detached: true, stdio: 'ignore', windowsHide: true },
      );
      child.unref();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron');
      app.exit(0);
    }
  }
}

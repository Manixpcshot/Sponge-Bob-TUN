import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { SafeLogger } from './logSanitizer';

const execFileAsync = promisify(execFile);

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const BYPASS_LIST = 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>';

interface SavedProxySnapshot {
  proxyEnable: number;
  proxyServer: string | null;
  proxyOverride: string | null;
}

export class SystemProxyManager {
  private readonly snapshotPath: string;
  private readonly logger: SafeLogger;
  private isEnabledByUs = false;

  constructor(userDataDir: string, logger: SafeLogger) {
    this.snapshotPath = path.join(userDataDir, 'proxy-backup.json');
    this.logger = logger;
  }

  private async queryRegValue(name: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', REG_KEY, '/v', name], {
        windowsHide: true,
      });
      const match = stdout.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`, 'i'));
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }

  private async setRegValue(name: string, type: 'REG_DWORD' | 'REG_SZ', value: string): Promise<void> {
    await execFileAsync(
      'reg.exe',
      ['add', REG_KEY, '/v', name, '/t', type, '/d', value, '/f'],
      { windowsHide: true },
    );
  }

  private async deleteRegValue(name: string): Promise<void> {
    try {
      await execFileAsync('reg.exe', ['delete', REG_KEY, '/v', name, '/f'], {
        windowsHide: true,
      });
    } catch {
      // Ignore if already absent
    }
  }

  private async refreshWinInet(): Promise<void> {
    if (process.platform !== 'win32') return;
    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinInet {
  [DllImport("wininet.dll", SetLastError = true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@
[WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
[WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
`.trim();

    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 5000 },
      );
    } catch {
      // Non-fatal; registry values are already updated
    }
  }

  async enable(httpPort: number): Promise<void> {
    if (process.platform !== 'win32') {
      this.isEnabledByUs = true;
      this.logger.info(`Local HTTP/SOCKS proxy ready (system proxy hook skipped on ${process.platform})`);
      return;
    }

    try {
      if (!fs.existsSync(this.snapshotPath)) {
        const enableRaw = await this.queryRegValue('ProxyEnable');
        const proxyEnable = enableRaw && enableRaw.includes('0x1') ? 1 : 0;
        const proxyServer = await this.queryRegValue('ProxyServer');
        const proxyOverride = await this.queryRegValue('ProxyOverride');
        const snapshot: SavedProxySnapshot = { proxyEnable, proxyServer, proxyOverride };
        fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshot), { mode: 0o600 });
      }

      await this.setRegValue('ProxyEnable', 'REG_DWORD', '1');
      await this.setRegValue('ProxyServer', 'REG_SZ', `127.0.0.1:${httpPort}`);
      await this.setRegValue('ProxyOverride', 'REG_SZ', BYPASS_LIST);
      await this.refreshWinInet();
      this.isEnabledByUs = true;
      this.logger.info(`Windows system proxy enabled on 127.0.0.1:${httpPort}`);
    } catch (err) {
      this.logger.error('Failed to enable Windows system proxy', err);
      throw err;
    }
  }

  async disable(): Promise<void> {
    if (process.platform !== 'win32') {
      this.isEnabledByUs = false;
      return;
    }

    try {
      if (fs.existsSync(this.snapshotPath)) {
        const raw = fs.readFileSync(this.snapshotPath, 'utf8');
        const snapshot = JSON.parse(raw) as SavedProxySnapshot;
        await this.setRegValue('ProxyEnable', 'REG_DWORD', String(snapshot.proxyEnable ? 1 : 0));
        if (snapshot.proxyServer) {
          await this.setRegValue('ProxyServer', 'REG_SZ', snapshot.proxyServer);
        } else {
          await this.deleteRegValue('ProxyServer');
        }
        if (snapshot.proxyOverride) {
          await this.setRegValue('ProxyOverride', 'REG_SZ', snapshot.proxyOverride);
        } else {
          await this.deleteRegValue('ProxyOverride');
        }
        fs.unlinkSync(this.snapshotPath);
      } else if (this.isEnabledByUs) {
        await this.setRegValue('ProxyEnable', 'REG_DWORD', '0');
      }
      await this.refreshWinInet();
      this.isEnabledByUs = false;
      this.logger.info('Windows system proxy restored');
    } catch (err) {
      this.logger.error('Failed to restore Windows system proxy', err);
    }
  }

  /**
   * Restores proxy state on app startup if a previous run terminated abruptly with backup present.
   */
  async recoverStaleProxyIfNeeded(): Promise<void> {
    if (process.platform === 'win32' && fs.existsSync(this.snapshotPath)) {
      this.logger.warn('Detected stale system proxy snapshot from previous run; restoring...');
      await this.disable();
    }
  }
}

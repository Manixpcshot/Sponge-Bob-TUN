import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { AppSettings, ServerSecretRecord } from '../types';
import { SafeLogger, sanitizeLogMessage } from './logSanitizer';
import { buildXrayLocalProxyConfig } from './xrayConfigBuilder';

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not allocate free port')));
      }
    });
  });
}

function checkTcpListening(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForPort(port: number, isProcessAlive: () => boolean, timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive()) return false;
    if (await checkTcpListening(port, 250)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export class XrayManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private apiPort: number | null = null;
  private stopping = false;
  private readonly appRoot: string;
  private readonly resourcesPath: string | undefined;
  private readonly logger: SafeLogger;
  private onUnexpectedExit?: (reason: string) => void;

  constructor(options: {
    appRoot: string;
    resourcesPath?: string;
    logger: SafeLogger;
    onUnexpectedExit?: (reason: string) => void;
  }) {
    this.appRoot = options.appRoot;
    this.resourcesPath = options.resourcesPath;
    this.logger = options.logger;
    this.onUnexpectedExit = options.onUnexpectedExit;
  }

  resolveBinaryPath(): { binPath: string | null; version: string | null } {
    const binName = process.platform === 'win32' ? 'xray.exe' : 'xray';
    const candidates: string[] = [];

    if (this.resourcesPath) {
      candidates.push(path.join(this.resourcesPath, 'bin', process.platform, binName));
      candidates.push(path.join(this.resourcesPath, 'bin', binName));
    }
    candidates.push(path.join(this.appRoot, 'resources', 'bin', process.platform, binName));
    candidates.push(path.join(this.appRoot, 'resources', 'bin', binName));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        let version: string | null = null;
        try {
          const metaPath = path.join(path.dirname(candidate), 'xray-version.json');
          if (fs.existsSync(metaPath)) {
            const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { version?: string };
            version = parsed.version ?? null;
          }
        } catch {
          // ignore metadata read error
        }
        return { binPath: candidate, version };
      }
    }

    // Fallback: check system PATH
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const out = execFileSync(cmd, [binName], { encoding: 'utf8', windowsHide: true }).trim();
      const first = out.split(/\r?\n/)[0]?.trim();
      if (first && fs.existsSync(first)) {
        return { binPath: first, version: null };
      }
    } catch {
      // Not in PATH
    }

    return { binPath: null, version: null };
  }

  getApiPort(): number | null {
    return this.apiPort;
  }

  isRunning(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null;
  }

  async start(
    server: ServerSecretRecord,
    settings: Pick<AppSettings, 'socksPort' | 'httpPort' | 'bypassLan'>,
  ): Promise<{ apiPort: number }> {
    await this.stop();

    const { binPath } = this.resolveBinaryPath();
    if (!binPath) {
      throw new Error('XRAY_BINARY_MISSING');
    }

    const apiPort = await findFreePort();
    const config = buildXrayLocalProxyConfig({ server, settings, apiPort });
    const configJson = JSON.stringify(config);

    this.stopping = false;
    this.apiPort = apiPort;

    const child = spawn(binPath, ['run', '-c', 'stdin:', '-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    let lastSanitizedStderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = sanitizeLogMessage(chunk.toString('utf8')).trim();
      if (text && /failed|error|panic/i.test(text)) {
        this.logger.warn(`xray: ${text}`);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = sanitizeLogMessage(chunk.toString('utf8')).trim();
      if (text) {
        lastSanitizedStderr = text;
        this.logger.warn(`xray stderr: ${text}`);
      }
    });

    child.on('exit', (code, signal) => {
      const wasStopping = this.stopping;
      if (this.child === child) {
        this.child = null;
        this.apiPort = null;
      }
      if (!wasStopping && code !== 0) {
        const msg = lastSanitizedStderr || `Xray exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'})`;
        this.logger.error(msg);
        this.onUnexpectedExit?.(msg);
      }
    });

    // Write config securely over stdin only (zero config files written to disk)
    child.stdin.write(configJson, 'utf8');
    child.stdin.end();

    const socksReady = await waitForPort(settings.socksPort, () => this.child === child && child.exitCode === null);
    if (!socksReady) {
      const errReason = lastSanitizedStderr || 'XRAY_STARTUP_TIMEOUT';
      await this.stop();
      throw new Error(sanitizeLogMessage(errReason));
    }

    this.logger.info(`Xray local proxy started (SOCKS5 127.0.0.1:${settings.socksPort}, HTTP 127.0.0.1:${settings.httpPort})`);
    return { apiPort };
  }

  async stop(): Promise<void> {
    const active = this.child;
    if (!active) return;

    this.stopping = true;
    this.child = null;
    this.apiPort = null;

    await new Promise<void>((resolve) => {
      if (active.exitCode !== null || active.killed) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        try {
          if (process.platform === 'win32' && active.pid) {
            execFileSync('taskkill', ['/PID', String(active.pid), '/T', '/F'], {
              windowsHide: true,
              stdio: 'ignore',
            });
          } else {
            active.kill('SIGKILL');
          }
        } catch {
          // ignore
        }
        resolve();
      }, 2000);

      active.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        active.kill('SIGTERM');
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

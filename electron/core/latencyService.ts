import http from 'node:http';
import net from 'node:net';
import type { ServerSecretRecord } from '../types';

export interface ServerRuntimeMetrics {
  latencyMs: number | null;
  healthy: boolean;
  lastCheckedAt: number | null;
  consecutiveFailures: number;
}

export function measureTcpLatency(host: string, port: number, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (latency: number | null) => {
      if (done) return;
      done = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(latency);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      const rtt = Math.max(1, Math.round(performance.now() - start));
      finish(rtt);
    });
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));

    try {
      socket.connect(port, host);
    } catch {
      finish(null);
    }
  });
}

/**
 * Tests end-to-end connectivity through Xray's local HTTP proxy without touching system proxy.
 */
export function probeThroughHttpProxy(
  httpProxyPort: number,
  targetUrl = 'http://cp.cloudflare.com/generate_204',
  timeoutMs = 4500,
): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;

    const finish = (rtt: number | null) => {
      if (done) return;
      done = true;
      resolve(rtt);
    };

    const req = http.request(
      {
        host: '127.0.0.1',
        port: httpProxyPort,
        method: 'GET',
        path: targetUrl,
        headers: {
          Host: new URL(targetUrl).host,
          Connection: 'close',
        },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          finish(Math.max(1, Math.round(performance.now() - start)));
        } else {
          finish(null);
        }
      },
    );

    req.on('timeout', () => {
      req.destroy();
      finish(null);
    });
    req.on('error', () => finish(null));
    req.end();
  });
}

export async function measureAllServersLatency(
  servers: ServerSecretRecord[],
  concurrency = 8,
  probeFn: (host: string, port: number) => Promise<number | null> = measureTcpLatency,
): Promise<Map<string, { latencyMs: number | null; healthy: boolean; checkedAt: number }>> {
  const results = new Map<string, { latencyMs: number | null; healthy: boolean; checkedAt: number }>();
  if (servers.length === 0) return results;

  let idx = 0;
  const workerCount = Math.min(concurrency, servers.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (idx < servers.length) {
      const current = servers[idx++];
      const latency = await probeFn(current.address, current.port);
      results.set(current.id, {
        latencyMs: latency,
        healthy: latency !== null,
        checkedAt: Date.now(),
      });
    }
  });

  await Promise.all(workers);
  return results;
}

export function selectBestServer(
  servers: ServerSecretRecord[],
  metrics: Map<string, ServerRuntimeMetrics>,
  pinnedIds: Set<string>,
  excludeIds: Set<string> = new Set(),
): ServerSecretRecord | null {
  const candidates = servers.filter((s) => !excludeIds.has(s.id));
  if (candidates.length === 0) {
    // If all excluded, fall back to full list
    if (servers.length === 0) return null;
  }
  const pool = candidates.length > 0 ? candidates : servers;

  const scored = pool.map((s, originalIndex) => {
    const m = metrics.get(s.id);
    const healthy = m ? m.healthy : true;
    const latency = m?.latencyMs ?? null;
    const failures = m?.consecutiveFailures ?? 0;
    const pinnedBonus = pinnedIds.has(s.id) ? -15 : 0; // slight preference for pinned servers with similar speed

    // Rank: healthy with known latency first, then untested, then failed
    let rankTier = 1;
    if (healthy && latency !== null && failures === 0) rankTier = 0;
    else if (!healthy || failures > 0) rankTier = 2;

    const effectiveLatency = latency !== null ? latency + pinnedBonus : 999999;
    return { server: s, rankTier, effectiveLatency, failures, originalIndex };
  });

  scored.sort((a, b) => {
    if (a.rankTier !== b.rankTier) return a.rankTier - b.rankTier;
    if (a.failures !== b.failures) return a.failures - b.failures;
    if (a.effectiveLatency !== b.effectiveLatency) return a.effectiveLatency - b.effectiveLatency;
    return a.originalIndex - b.originalIndex;
  });

  return scored[0]?.server ?? null;
}

export class SmartFallbackTracker {
  private failures = 0;

  constructor(private threshold = 3) {}

  setThreshold(n: number): void {
    this.threshold = Math.max(1, Math.min(10, Math.round(n)));
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  /**
   * Records one failed health probe and returns true when threshold is reached.
   */
  recordFailure(): { count: number; shouldSwitch: boolean } {
    this.failures += 1;
    return {
      count: this.failures,
      shouldSwitch: this.failures >= this.threshold,
    };
  }

  reset(): void {
    this.failures = 0;
  }

  getFailureCount(): number {
    return this.failures;
  }
}

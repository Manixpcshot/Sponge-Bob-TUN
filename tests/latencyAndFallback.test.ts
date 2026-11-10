import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  measureAllServersLatency,
  probeThroughHttpProxy,
  selectBestServer,
  ServerRuntimeMetrics,
  SmartFallbackTracker,
} from '../electron/core/latencyService';
import { createDefaultVaultState, SecureVaultStore } from '../electron/core/secureStore';
import { parseVlessUri } from '../electron/core/vlessParser';

describe('SecureVaultStore, latency probing & smart fallback', () => {
  it('stores vault data encrypted on disk with zero plaintext secrets', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbt-vault-'));
    try {
      const store = new SecureVaultStore(tmpDir);
      const state = createDefaultVaultState();
      state.subscriptionUrl = 'https://secret-panel.example.org/sub/my-secret-token';
      const srv = parseVlessUri(
        'vless://11111111-2222-4333-8444-555555555555@198.51.100.88:443?type=tcp&security=none#TopSecretNode',
      )!;
      state.servers = [srv];
      store.save(state);

      const rawFile = fs.readFileSync(path.join(tmpDir, 'vault.sbx'), 'utf8');
      expect(rawFile).not.toContain('secret-panel.example.org');
      expect(rawFile).not.toContain('198.51.100.88');
      expect(rawFile).not.toContain('11111111-2222-4333-8444-555555555555');

      const reloaded = store.load();
      expect(reloaded.subscriptionUrl).toBe(state.subscriptionUrl);
      expect(reloaded.servers[0].uuid).toBe(srv.uuid);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('measures real TCP latency, selects fastest healthy server, and triggers fallback after N failures', async () => {
    const tcpServer = net.createServer((sock) => sock.end());
    await new Promise<void>((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
    const livePort = (tcpServer.address() as { port: number }).port;

    const s1 = parseVlessUri(`vless://11111111-1111-4111-8111-111111111111@127.0.0.1:${livePort}#FastLive`)!;
    const s2 = parseVlessUri('vless://22222222-2222-4222-8222-222222222222@127.0.0.1:65432#DeadNode')!;

    const results = await measureAllServersLatency([s1, s2], 2);
    expect(results.get(s1.id)?.healthy).toBe(true);
    expect(results.get(s1.id)?.latencyMs).not.toBeNull();
    expect(results.get(s2.id)?.healthy).toBe(false);

    const metrics = new Map<string, ServerRuntimeMetrics>([
      [s1.id, { latencyMs: 42, healthy: true, lastCheckedAt: Date.now(), consecutiveFailures: 0 }],
      [s2.id, { latencyMs: null, healthy: false, lastCheckedAt: Date.now(), consecutiveFailures: 2 }],
    ]);

    const best = selectBestServer([s2, s1], metrics, new Set());
    expect(best?.id).toBe(s1.id);

    const excludedBest = selectBestServer([s2, s1], metrics, new Set(), new Set([s1.id]));
    expect(excludedBest?.id).toBe(s2.id);

    const tracker = new SmartFallbackTracker(3);
    expect(tracker.recordFailure()).toEqual({ count: 1, shouldSwitch: false });
    expect(tracker.recordFailure()).toEqual({ count: 2, shouldSwitch: false });
    expect(tracker.recordFailure()).toEqual({ count: 3, shouldSwitch: true });
    tracker.recordSuccess();
    expect(tracker.getFailureCount()).toBe(0);

    await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
  });

  it('probes end-to-end health through local HTTP proxy port', async () => {
    const proxyMock = http.createServer((_req, res) => {
      res.writeHead(204);
      res.end();
    });
    await new Promise<void>((resolve) => proxyMock.listen(0, '127.0.0.1', resolve));
    const port = (proxyMock.address() as { port: number }).port;

    const rtt = await probeThroughHttpProxy(port, 'http://cp.cloudflare.com/generate_204');
    expect(rtt).not.toBeNull();
    expect(rtt!).toBeGreaterThanOrEqual(1);

    await new Promise<void>((resolve) => proxyMock.close(() => resolve()));
  });
});

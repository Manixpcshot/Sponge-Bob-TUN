import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppController } from '../electron/core/appController';
import {
  evaluateQuotaAlert,
  parseSubscriptionUserInfo,
} from '../electron/core/subscriptionService';

describe('Quota alerts & AppController subscription flow', () => {
  it('triggers quota alerts at >= 80% usage or < 3 days remaining', () => {
    const now = Date.now();
    const info = parseSubscriptionUserInfo(
      `upload=100; download=750; total=1000; expire=${Math.floor((now + 2 * 86400_000) / 1000)}`,
    );
    const alert = evaluateQuotaAlert(info, now);
    expect(alert?.shouldAlert).toBe(true);
    expect(alert?.isOver80Percent).toBe(true);
    expect(alert?.isExpiringSoon).toBe(true);
    expect(alert?.isExpired).toBe(false);

    const healthyInfo = parseSubscriptionUserInfo(
      `upload=100; download=100; total=1000; expire=${Math.floor((now + 20 * 86400_000) / 1000)}`,
    );
    const okAlert = evaluateQuotaAlert(healthyInfo, now);
    expect(okAlert?.shouldAlert).toBe(false);
  });

  it('fetches subscription, decodes Base64, evaluates quota alert, pins servers, and never leaks URLs in logs', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const vlessList = [
      'vless://11111111-1111-4111-8111-111111111111@198.51.100.11:443?type=tcp&security=none#%F0%9F%87%A9%F0%9F%87%AA%20Germany',
      'vless://22222222-2222-4222-8222-222222222222@198.51.100.22:443?type=ws&security=tls#%F0%9F%87%B9%F0%9F%87%B7%20Turkey',
    ].join('\n');

    const subServer = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'subscription-userinfo': `upload=100; download=820; total=1000; expire=${nowSec + 86400 * 2}`,
        'profile-title': `base64:${Buffer.from('Bikini VIP', 'utf8').toString('base64')}`,
      });
      res.end(Buffer.from(vlessList, 'utf8').toString('base64'));
    });

    await new Promise<void>((resolve) => subServer.listen(0, '127.0.0.1', resolve));
    const port = (subServer.address() as { port: number }).port;
    const subUrl = `http://127.0.0.1:${port}/very-secret-sub-endpoint`;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbt-ctrl-'));
    let quotaNotified = 0;

    try {
      const ctrl = new AppController({
        userDataDir: tmpDir,
        appRoot: process.cwd(),
        appVersion: '1.0.0',
        isPackaged: false,
        callbacks: {
          onSnapshotChanged: () => {},
          onToast: () => {},
          onQuotaNotification: () => {
            quotaNotified++;
          },
          onTrayStateChanged: () => {},
        },
      });

      const res = await ctrl.updateSubscription(subUrl);
      expect(res.ok).toBe(true);
      expect(res.serverCount).toBe(2);
      expect(quotaNotified).toBe(1);

      const snap = ctrl.getSnapshot();
      expect(snap.servers).toHaveLength(2);
      expect(snap.userInfo?.profileTitle).toBe('Bikini VIP');
      expect(snap.quotaAlert?.shouldAlert).toBe(true);

      // Pin second server and ensure it moves to top
      const secondId = snap.servers[1].id;
      ctrl.togglePinServer(secondId);
      const afterPin = ctrl.getSnapshot();
      expect(afterPin.servers[0].id).toBe(secondId);
      expect(afterPin.servers[0].isPinned).toBe(true);

      // Ensure zero secrets in logs
      const logsText = JSON.stringify(ctrl.getSafeLogs());
      expect(logsText).not.toContain('very-secret-sub-endpoint');
      expect(logsText).not.toContain('198.51.100.11');
      expect(logsText).not.toContain('11111111-1111-4111-8111-111111111111');

      await ctrl.shutdown();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      await new Promise<void>((resolve) => subServer.close(() => resolve()));
    }
  });
});

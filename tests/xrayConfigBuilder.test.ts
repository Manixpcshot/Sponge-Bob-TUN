import http2 from 'node:http2';
import { describe, expect, it } from 'vitest';
import { parseVlessUri } from '../electron/core/vlessParser';
import { buildXrayLocalProxyConfig } from '../electron/core/xrayConfigBuilder';
import {
  decodeQueryStatsResponse,
  encodeQueryStatsRequest,
  XrayStatsClient,
} from '../electron/core/xrayStatsClient';

function encodeVarint(n: bigint): Buffer {
  const bytes: number[] = [];
  let v = n;
  while (v >= 0x80n) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

function buildMockQueryStatsGrpcResponse(items: Array<{ name: string; value: number }>): Buffer {
  const statMsgs = items.map((item) => {
    const nameBuf = Buffer.from(item.name, 'utf8');
    const statBody = Buffer.concat([
      Buffer.from([0x0a]),
      encodeVarint(BigInt(nameBuf.length)),
      nameBuf,
      Buffer.from([0x10]),
      encodeVarint(BigInt(item.value)),
    ]);
    return Buffer.concat([Buffer.from([0x0a]), encodeVarint(BigInt(statBody.length)), statBody]);
  });
  const msg = Buffer.concat(statMsgs);
  const frame = Buffer.alloc(5 + msg.length);
  frame[0] = 0;
  frame.writeUInt32BE(msg.length, 1);
  msg.copy(frame, 5);
  return frame;
}

describe('xrayConfigBuilder and XrayStatsClient', () => {
  it('builds strictly local SOCKS5/HTTP proxy config with Stats API and zero TUN/Wintun', () => {
    const server = parseVlessUri(
      'vless://11111111-2222-4333-8444-555555555555@198.51.100.12:443?type=tcp&security=reality&pbk=pk&sid=12&sni=sni.com&flow=xtls-rprx-vision#DE',
    )!;

    const cfg = buildXrayLocalProxyConfig({
      server,
      settings: { socksPort: 10808, httpPort: 10809, bypassLan: true },
      apiPort: 19001,
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(cfg).toLowerCase();
    expect(serialized).not.toContain('"tun"');
    expect(serialized).not.toContain('wintun');

    const inbounds = cfg.inbounds as Array<{ protocol: string; listen: string; port: number }>;
    expect(inbounds.map((i) => i.protocol)).toEqual(['socks', 'http', 'dokodemo-door']);
    expect(inbounds.every((i) => i.listen === '127.0.0.1')).toBe(true);
    expect(cfg.stats).toEqual({});
    expect((cfg.api as { services: string[] }).services).toContain('StatsService');
  });

  it('encodes & decodes gRPC StatsService over real HTTP/2', async () => {
    const reqBuf = encodeQueryStatsRequest('outbound>>>proxy>>>traffic>>>', false);
    expect(reqBuf[0]).toBe(0);

    const mockPayload = buildMockQueryStatsGrpcResponse([
      { name: 'outbound>>>proxy>>>traffic>>>uplink', value: 123456 },
      { name: 'outbound>>>proxy>>>traffic>>>downlink', value: 9876543 },
    ]);
    const decoded = decodeQueryStatsResponse(mockPayload);
    expect(decoded).toHaveLength(2);
    expect(decoded[0].value).toBe(123456);
    expect(decoded[1].value).toBe(9876543);

    // Live HTTP/2 mock server test
    const server = http2.createServer();
    server.on('stream', (stream, headers) => {
      expect(headers[':path']).toBe('/xray.app.stats.command.StatsService/QueryStats');
      stream.respond({ ':status': 200, 'content-type': 'application/grpc' });
      stream.end(mockPayload);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    const client = new XrayStatsClient();
    const res = await client.queryOutboundTraffic(port, 'proxy');
    expect(res).toEqual({ uplinkBytes: 123456, downlinkBytes: 9876543 });

    client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

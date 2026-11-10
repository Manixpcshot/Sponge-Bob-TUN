import type { AppSettings, ServerSecretRecord } from '../types';

export interface XrayBuildOptions {
  server: ServerSecretRecord;
  settings: Pick<AppSettings, 'socksPort' | 'httpPort' | 'bypassLan'>;
  apiPort: number;
}

export function buildXrayLocalProxyConfig({ server, settings, apiPort }: XrayBuildOptions): Record<string, unknown> {
  const streamSettings: Record<string, unknown> = {
    network: server.network === 'h2' ? 'http' : server.network === 'splithttp' ? 'xhttp' : server.network,
    security: server.security,
  };

  if (server.security === 'tls') {
    streamSettings.tlsSettings = {
      serverName: server.sni || server.hostHeader || server.address,
      allowInsecure: Boolean(server.allowInsecure),
      ...(server.fp ? { fingerprint: server.fp } : {}),
      ...(server.alpn?.length ? { alpn: server.alpn } : {}),
    };
  } else if (server.security === 'reality') {
    streamSettings.realitySettings = {
      show: false,
      fingerprint: server.fp || 'chrome',
      serverName: server.sni || '',
      publicKey: server.pbk || '',
      shortId: server.sid || '',
      spiderX: server.spx || '/',
    };
  }

  const net = streamSettings.network as string;
  if (net === 'tcp' && server.headerType === 'http') {
    streamSettings.tcpSettings = {
      header: {
        type: 'http',
        request: {
          version: '1.1',
          method: 'GET',
          path: [server.path || '/'],
          headers: {
            Host: server.hostHeader ? [server.hostHeader] : [server.sni || server.address],
            'User-Agent': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
            Connection: ['keep-alive'],
            Pragma: 'no-cache',
          },
        },
      },
    };
  } else if (net === 'ws') {
    const wsHeaders: Record<string, string> = {};
    if (server.hostHeader || server.sni) {
      wsHeaders.Host = server.hostHeader || server.sni || '';
    }
    streamSettings.wsSettings = {
      path: server.path || '/',
      ...(Object.keys(wsHeaders).length > 0 ? { headers: wsHeaders } : {}),
    };
  } else if (net === 'grpc') {
    streamSettings.grpcSettings = {
      serviceName: server.serviceName || '',
      multiMode: server.grpcMode === 'multi',
      ...(server.authority ? { authority: server.authority } : {}),
    };
  } else if (net === 'httpupgrade') {
    streamSettings.httpupgradeSettings = {
      path: server.path || '/',
      ...(server.hostHeader || server.sni ? { host: server.hostHeader || server.sni } : {}),
    };
  } else if (net === 'xhttp') {
    streamSettings.xhttpSettings = {
      path: server.path || '/',
      ...(server.hostHeader || server.sni ? { host: server.hostHeader || server.sni } : {}),
      ...(server.grpcMode ? { mode: server.grpcMode } : {}),
      ...(server.extra ? { extra: server.extra } : {}),
    };
  } else if (net === 'http') {
    streamSettings.httpSettings = {
      path: server.path || '/',
      ...(server.hostHeader || server.sni ? { host: [server.hostHeader || server.sni] } : {}),
    };
  } else if (net === 'kcp') {
    streamSettings.kcpSettings = {
      ...(server.seed ? { seed: server.seed } : {}),
      header: { type: server.headerType || 'none' },
    };
  }

  const userObj: Record<string, unknown> = {
    id: server.uuid,
    encryption: server.encryption || 'none',
    level: 0,
  };
  if (server.flow) {
    userObj.flow = server.flow;
  }

  const rules: Array<Record<string, unknown>> = [
    {
      type: 'field',
      inboundTag: ['api-in'],
      outboundTag: 'api',
    },
  ];

  if (settings.bypassLan) {
    rules.push({
      type: 'field',
      ip: [
        '127.0.0.0/8',
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        '169.254.0.0/16',
        '::1/128',
        'fc00::/7',
        'fe80::/10',
      ],
      outboundTag: 'direct',
    });
  }

  rules.push({
    type: 'field',
    inboundTag: ['socks-in', 'http-in'],
    outboundTag: 'proxy',
  });

  return {
    log: {
      loglevel: 'warning',
    },
    stats: {},
    api: {
      tag: 'api',
      services: ['StatsService'],
    },
    policy: {
      system: {
        statsOutboundUplink: true,
        statsOutboundDownlink: true,
      },
    },
    inbounds: [
      {
        tag: 'socks-in',
        listen: '127.0.0.1',
        port: settings.socksPort,
        protocol: 'socks',
        settings: {
          auth: 'noauth',
          udp: true,
        },
        sniffing: {
          enabled: true,
          destOverride: ['http', 'tls', 'quic'],
        },
      },
      {
        tag: 'http-in',
        listen: '127.0.0.1',
        port: settings.httpPort,
        protocol: 'http',
        settings: {
          allowTransparent: false,
        },
        sniffing: {
          enabled: true,
          destOverride: ['http', 'tls', 'quic'],
        },
      },
      {
        tag: 'api-in',
        listen: '127.0.0.1',
        port: apiPort,
        protocol: 'dokodemo-door',
        settings: {
          address: '127.0.0.1',
        },
      },
    ],
    outbounds: [
      {
        tag: 'proxy',
        protocol: 'vless',
        settings: {
          vnext: [
            {
              address: server.address,
              port: server.port,
              users: [userObj],
            },
          ],
        },
        streamSettings,
      },
      {
        tag: 'direct',
        protocol: 'freedom',
      },
      {
        tag: 'block',
        protocol: 'blackhole',
      },
    ],
    routing: {
      domainStrategy: 'AsIs',
      rules,
    },
  };
}

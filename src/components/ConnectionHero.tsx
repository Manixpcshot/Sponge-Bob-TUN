import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Power,
  Shield,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  ConnectionMode,
  ConnectionState,
  PublicServerInfo,
} from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';
import { CountryFlag } from './CountryFlag';
import { SpongeMascot, pineappleHouseImg } from './Mascots';

interface ConnectionHeroProps {
  t: TranslationKeys;
  isFa: boolean;
  connectionState: ConnectionState;
  connectionMode: ConnectionMode;
  activeServer: PublicServerInfo | null;
  selectedServer: PublicServerInfo | null;
  hasServers: boolean;
  settings: AppSettings;
  connectedSince: number | null;
  errorMessage: string | null;
  xrayAvailable: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onGoToConfigs: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export const ConnectionHero: React.FC<ConnectionHeroProps> = ({
  t,
  isFa,
  connectionState,
  connectionMode,
  activeServer,
  selectedServer,
  hasServers,
  settings,
  connectedSince,
  errorMessage,
  xrayAvailable,
  onConnect,
  onDisconnect,
  onGoToConfigs,
}) => {
  const [elapsed, setElapsed] = useState('00:00:00');
  const [copiedProxy, setCopiedProxy] = useState(false);

  const handleCopyProxy = async () => {
    try {
      await navigator.clipboard.writeText(`127.0.0.1:${settings.socksPort}`);
      setCopiedProxy(true);
      setTimeout(() => setCopiedProxy(false), 1600);
    } catch {
      // Clipboard may be blocked in non-secure previews
    }
  };

  useEffect(() => {
    if (connectionState !== 'connected' || !connectedSince) {
      setElapsed('00:00:00');
      return;
    }
    const tick = () => setElapsed(formatDuration(Date.now() - connectedSince));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [connectionState, connectedSince]);

  const isConnected = connectionState === 'connected';
  const isBusy = connectionState === 'connecting' || connectionState === 'reconnecting';
  const displayServer = isConnected || isBusy ? activeServer || selectedServer : selectedServer;

  const statusText =
    connectionState === 'connected'
      ? t.connection.connected
      : connectionState === 'connecting'
        ? t.connection.connecting
        : connectionState === 'reconnecting'
          ? t.connection.reconnecting
          : connectionState === 'error'
            ? t.connection.error
            : t.connection.disconnected;

  const statusColor =
    connectionState === 'connected'
      ? '#22C55E'
      : isBusy
        ? '#FACC15'
        : connectionState === 'error'
          ? '#F43F5E'
          : '#94A3B8';

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4 md:p-5 border backdrop-blur-xl transition-all shrink-0"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: isConnected ? 'var(--border-strong)' : 'var(--border-subtle)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* SpongeBob's Pineapple House subtle atmospheric artwork backdrop */}
      <img
        src={pineappleHouseImg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-y-0 end-0 w-96 h-full object-cover transition-opacity duration-500"
        style={{
          opacity: isConnected ? 0.32 : 0.2,
          maskImage: 'linear-gradient(to left, rgba(0,0,0,0.92), transparent)',
          WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.92), transparent)',
        }}
      />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Start side: SpongeBob Animated Mascot + Status */}
        <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-start">
          <SpongeMascot
            connectionState={connectionState}
            customImageUrl={settings.customSpongeMascotDataUrl}
          />

          <div className="space-y-2.5">
            {/* Status pill */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: `${statusColor}20`,
                  color: statusColor,
                  border: `1px solid ${statusColor}55`,
                }}
              >
                <span
                  className={`w-2 h-2 rounded-full ${isConnected || isBusy ? 'animate-ping' : ''}`}
                  style={{ backgroundColor: statusColor }}
                />
                {statusText}
              </span>

              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--accent-purple-soft)',
                  color: 'var(--accent-purple)',
                }}
              >
                <Shield className="w-3 h-3" />
                {t.proxyModeBadge}
              </span>
            </div>

            {/* Active / Selected Server summary */}
            <div className="flex items-center justify-center sm:justify-start gap-2.5">
              {displayServer ? (
                <>
                  <CountryFlag code={displayServer.countryCode} size={26} />
                  <div className="text-start">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-base sm:text-lg" style={{ color: 'var(--text-primary)' }}>
                        {displayServer.remark}
                      </span>
                      {connectionMode === 'auto' && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                          style={{
                            backgroundColor: 'var(--accent-yellow-soft)',
                            color: 'var(--accent-yellow)',
                          }}
                        >
                          <Sparkles className="w-3 h-3" />
                          {t.servers.autoActiveBadge}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      <span>{isFa ? displayServer.countryNameFa : displayServer.countryNameEn}</span>
                      <span>•</span>
                      <span className="uppercase font-mono text-[11px]">
                        VLESS / {displayServer.network} / {displayServer.security}
                      </span>
                      {displayServer.latencyMs !== null && (
                        <>
                          <span>•</span>
                          <span className="font-mono font-bold text-emerald-400">
                            {displayServer.latencyMs} ms
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                    {connectionMode === 'auto' && hasServers
                      ? t.connection.autoModeTitle
                      : t.connection.noServerSelected}
                  </span>
                  {!hasServers && (
                    <button
                      type="button"
                      onClick={onGoToConfigs}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition hover:scale-105"
                      style={{
                        backgroundColor: 'var(--accent-yellow-soft)',
                        color: 'var(--accent-yellow)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <span>{t.connection.addFirstConfigBtn}</span>
                      <ArrowRight className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Local proxy endpoints + session uptime */}
            <div
              className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-[11px] pt-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <button
                type="button"
                onClick={() => void handleCopyProxy()}
                title={t.connection.copyProxyTitle}
                className="inline-flex items-center gap-1.5 font-mono px-2 py-0.5 rounded-md border hover:bg-white/10 transition cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                dir="ltr"
              >
                <Wifi className="w-3.5 h-3.5" style={{ color: 'var(--accent-yellow)' }} />
                <span>
                  SOCKS5 127.0.0.1:{settings.socksPort} • HTTP :{settings.httpPort}
                </span>
                {copiedProxy ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 opacity-65" />
                )}
              </button>
              <span
                className="px-2 py-0.5 rounded-md font-semibold"
                style={{
                  backgroundColor: settings.enableSystemProxy
                    ? 'rgba(34, 197, 94, 0.14)'
                    : 'var(--bg-elevated)',
                  color: settings.enableSystemProxy ? '#4ADE80' : 'var(--text-secondary)',
                }}
              >
                {settings.enableSystemProxy
                  ? t.connection.systemProxyOn
                  : t.connection.systemProxyOff}
              </span>
              {isConnected && (
                <span className="font-mono font-semibold" style={{ color: 'var(--accent-yellow)' }}>
                  {t.connection.uptime}: {elapsed}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* End side: Big Interactive Connect / Disconnect Power Button */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            disabled={isBusy}
            onClick={() => (isConnected ? void onDisconnect() : void onConnect())}
            className="relative group w-48 h-14 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-60"
            style={{
              background: isConnected
                ? 'linear-gradient(135deg, #e11d48, #be123c)'
                : 'linear-gradient(135deg, var(--accent-yellow), #a855f7)',
              color: isConnected ? '#ffffff' : '#0b0b12',
              boxShadow: isConnected
                ? '0 10px 28px rgba(225, 29, 72, 0.35)'
                : '0 10px 30px rgba(168, 85, 247, 0.35)',
            }}
          >
            {isBusy ? (
              <Zap className="w-5 h-5 animate-bounce" />
            ) : (
              <Power className="w-5 h-5" />
            )}
            <span>
              {isBusy
                ? t.connection.connectingBtn
                : isConnected
                  ? t.connection.disconnectBtn
                  : t.connection.connectBtn}
            </span>
          </motion.button>
        </div>
      </div>

      {/* Warning if Xray core missing or connection error */}
      {!xrayAvailable && (
        <div className="relative z-10 mt-3 rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t.connection.xrayMissingWarning}</span>
        </div>
      )}

      {errorMessage && (
        <div className="relative z-10 mt-3 rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 bg-rose-500/15 text-rose-300 border border-rose-500/35">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </section>
  );
};

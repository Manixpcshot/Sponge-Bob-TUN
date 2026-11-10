import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Gauge,
  Pin,
  PinOff,
  Play,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import type { ConnectionMode, ConnectionState, PublicServerInfo } from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';
import { CountryFlag } from './CountryFlag';
import { PatrickMascot } from './Mascots';

interface ServerListProps {
  t: TranslationKeys;
  isFa: boolean;
  servers: PublicServerInfo[];
  connectionMode: ConnectionMode;
  connectionState: ConnectionState;
  activeServerId: string | null;
  selectedServerId: string | null;
  onSelectAutoMode: () => Promise<void>;
  onSelectServer: (serverId: string) => Promise<void>;
  onConnectServer: (serverId: string) => Promise<void>;
  onTogglePin: (serverId: string) => Promise<void>;
  onProbeLatencies: () => Promise<void>;
}

function getLatencyColor(ms: number | null, healthy: boolean): string {
  if (!healthy || ms === null) return '#F43F5E';
  if (ms < 160) return '#22C55E';
  if (ms < 380) return '#FACC15';
  return '#FB923C';
}

export const ServerList: React.FC<ServerListProps> = ({
  t,
  isFa,
  servers,
  connectionMode,
  connectionState,
  activeServerId,
  selectedServerId,
  onSelectAutoMode,
  onSelectServer,
  onConnectServer,
  onTogglePin,
  onProbeLatencies,
}) => {
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTestingPing, setIsTestingPing] = useState(false);

  const countryChips = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const s of servers) {
      const prev = map.get(s.countryCode);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(s.countryCode, {
          code: s.countryCode,
          name: isFa ? s.countryNameFa : s.countryNameEn,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [servers, isFa]);

  const filteredServers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return servers.filter((s) => {
      if (countryFilter !== 'ALL' && s.countryCode !== countryFilter) return false;
      if (!q) return true;
      return (
        s.remark.toLowerCase().includes(q) ||
        s.countryNameFa.toLowerCase().includes(q) ||
        s.countryNameEn.toLowerCase().includes(q) ||
        s.countryCode.toLowerCase().includes(q)
      );
    });
  }, [servers, countryFilter, searchQuery]);

  // Keep pinned servers strictly on top, then sort rest by latency when available
  const sortedServers = useMemo(() => {
    return [...filteredServers].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const latA = a.latencyMs ?? 999999;
      const latB = b.latencyMs ?? 999999;
      if (latA !== latB) return latA - latB;
      return a.remark.localeCompare(b.remark);
    });
  }, [filteredServers]);

  const handleTestAll = async () => {
    setIsTestingPing(true);
    try {
      await onProbeLatencies();
    } finally {
      setIsTestingPing(false);
    }
  };

  return (
    <section
      className="rounded-2xl p-4 border backdrop-blur-xl flex flex-col min-h-0 flex-1"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {t.servers.title}
          </h3>
          <span
            className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: 'var(--accent-purple-soft)',
              color: 'var(--accent-purple)',
            }}
          >
            {servers.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative flex items-center">
            <Search
              className="w-3.5 h-3.5 absolute start-3 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.servers.searchPlaceholder}
              className="h-8 ps-8 pe-3 rounded-xl text-xs border outline-none w-44 sm:w-52 transition"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <button
            type="button"
            disabled={servers.length === 0 || isTestingPing}
            onClick={handleTestAll}
            className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition hover:scale-[1.02] disabled:opacity-45 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-yellow-soft)',
              color: 'var(--accent-yellow)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Gauge className={`w-3.5 h-3.5 ${isTestingPing ? 'animate-spin' : ''}`} />
            <span>{isTestingPing ? t.servers.testingPing : t.servers.testAllPing}</span>
          </button>
        </div>
      </div>

      {/* Country Flag Filter Chips */}
      {countryChips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 shrink-0">
          <button
            type="button"
            onClick={() => setCountryFilter('ALL')}
            className="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer"
            style={{
              backgroundColor:
                countryFilter === 'ALL' ? 'var(--accent-yellow)' : 'var(--bg-elevated)',
              color: countryFilter === 'ALL' ? '#0f172a' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {t.servers.allCountries} ({servers.length})
          </button>

          {countryChips.map((chip) => {
            const active = countryFilter === chip.code;
            return (
              <button
                key={chip.code}
                type="button"
                onClick={() => setCountryFilter(active ? 'ALL' : chip.code)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent-purple)' : 'var(--bg-elevated)',
                  color: active ? '#ffffff' : 'var(--text-secondary)',
                  border: active
                    ? '1px solid var(--accent-yellow)'
                    : '1px solid var(--border-subtle)',
                }}
              >
                <CountryFlag code={chip.code} size={16} />
                <span>{chip.name}</span>
                <span className="opacity-70 font-mono text-[10px]">{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Server Items Scroll Container */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pe-1">
        {/* Auto / Best Server Pinned Hero Row */}
        {servers.length > 0 && (
          <motion.div
            whileHover={{ scale: 1.005 }}
            onClick={() => void onSelectAutoMode()}
            className="rounded-xl p-3 border cursor-pointer transition flex items-center justify-between gap-3"
            style={{
              background:
                connectionMode === 'auto'
                  ? 'linear-gradient(135deg, rgba(250,204,21,0.16), rgba(168,85,247,0.22))'
                  : 'var(--bg-elevated)',
              borderColor:
                connectionMode === 'auto' ? 'var(--accent-yellow)' : 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-yellow), var(--accent-purple))',
                  color: '#0b0b12',
                }}
              >
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs sm:text-sm" style={{ color: 'var(--text-primary)' }}>
                    {t.servers.autoTitle}
                  </span>
                  {connectionMode === 'auto' && (
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent-yellow)', color: '#0f172a' }}
                    >
                      ON
                    </span>
                  )}
                </div>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                  {t.servers.autoSubtitle}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty / No match states */}
        {servers.length === 0 ? (
          <div className="py-10 px-4 flex flex-col items-center justify-center text-center gap-3">
            <PatrickMascot size="lg" />
            <div className="text-sm font-extrabold" style={{ color: 'var(--accent-yellow)' }}>
              {t.subscription.patrickEmptyTitle}
            </div>
            <div className="text-xs max-w-md" style={{ color: 'var(--text-muted)' }}>
              {t.subscription.patrickEmptyDesc}
            </div>
          </div>
        ) : sortedServers.length === 0 ? (
          <div
            className="py-10 text-center text-xs sm:text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {t.servers.noMatch}
          </div>
        ) : (
          sortedServers.map((server) => {
            const isActive =
              connectionState === 'connected' && activeServerId === server.id;
            const isSelected =
              connectionMode === 'manual' && selectedServerId === server.id;

            return (
              <div
                key={server.id}
                onClick={() => void onSelectServer(server.id)}
                className="group rounded-xl px-3 py-2.5 border transition flex items-center justify-between gap-3 cursor-pointer hover:brightness-110"
                style={{
                  backgroundColor: isActive
                    ? 'rgba(34, 197, 94, 0.12)'
                    : isSelected
                      ? 'var(--accent-purple-soft)'
                      : 'var(--bg-elevated)',
                  borderColor: isActive
                    ? '#22C55E'
                    : isSelected
                      ? 'var(--accent-purple)'
                      : server.isPinned
                        ? 'rgba(250, 204, 21, 0.3)'
                        : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CountryFlag code={server.countryCode} size={24} />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {server.isPinned && (
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
                      )}
                      <span
                        className="font-semibold text-xs sm:text-sm truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {server.remark}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span>{isFa ? server.countryNameFa : server.countryNameEn}</span>
                      <span>•</span>
                      <span className="uppercase font-mono text-[10px]">
                        {server.network} / {server.security}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right actions: Latency, Pin/Star, Quick Connect */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    dir="ltr"
                    className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.28)',
                      color: getLatencyColor(server.latencyMs, server.healthy),
                    }}
                  >
                    {server.latencyMs !== null ? `${server.latencyMs} ms` : server.healthy ? '—' : '✕'}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onTogglePin(server.id);
                    }}
                    title={server.isPinned ? t.servers.unpinTooltip : t.servers.pinTooltip}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                    style={{
                      color: server.isPinned ? '#FACC15' : 'var(--text-muted)',
                    }}
                  >
                    {server.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onConnectServer(server.id);
                    }}
                    className="p-1.5 rounded-lg transition hover:scale-110 cursor-pointer"
                    style={{
                      backgroundColor: isActive
                        ? '#22C55E'
                        : 'var(--accent-yellow-soft)',
                      color: isActive ? '#052e16' : 'var(--accent-yellow)',
                    }}
                    title={t.connection.connectBtn}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

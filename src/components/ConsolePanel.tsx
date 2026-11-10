import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import type {
  AppSettings,
  ConnectionState,
  SafeLogEntry,
} from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';
import { SquidwardMascot, squidwardMascotImg } from './Mascots';

interface ConsolePanelProps {
  t: TranslationKeys;
  logs: SafeLogEntry[];
  connectionState: ConnectionState;
  xrayAvailable: boolean;
  xrayVersion: string | null;
  settings: AppSettings;
  onRefreshLogs: () => Promise<void>;
  onClearLogs: () => Promise<void>;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  t,
  logs,
  connectionState,
  xrayAvailable,
  xrayVersion,
  settings,
  onRefreshLogs,
  onClearLogs,
}) => {
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(() => {
    let info = 0;
    let warn = 0;
    let error = 0;
    for (const item of logs) {
      if (item.level === 'error') error += 1;
      else if (item.level === 'warn') warn += 1;
      else info += 1;
    }
    return { all: logs.length, info, warn, error };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (!q) return true;
      return entry.message.toLowerCase().includes(q);
    });
  }, [logs, levelFilter, search]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  const handleCopy = async () => {
    const text = filteredLogs
      .map(
        (entry) =>
          `[${new Date(entry.ts).toISOString()}] [${entry.level.toUpperCase()}] ${entry.message}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be blocked in headless environments
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {/* Squidward Control Room Header Banner */}
      <section
        className="relative overflow-hidden rounded-2xl p-4 border backdrop-blur-xl shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <img
          src={squidwardMascotImg}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-y-0 end-0 w-64 h-full object-cover opacity-20"
          style={{
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0.85), transparent)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.85), transparent)',
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <SquidwardMascot size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-yellow)' }} />
                <h2 className="font-extrabold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>
                  {t.console.title}
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t.console.subtitle}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold ${
                    xrayAvailable
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {xrayAvailable ? `${t.console.xrayReady}${xrayVersion ? ` (${xrayVersion})` : ''}` : t.console.xrayMissing}
                </span>

                <span
                  dir="ltr"
                  className="px-2.5 py-0.5 rounded-full font-mono font-semibold"
                  style={{
                    backgroundColor: 'var(--accent-purple-soft)',
                    color: 'var(--accent-purple)',
                  }}
                >
                  {t.console.portsLabel}: SOCKS5 :{settings.socksPort} • HTTP :{settings.httpPort}
                </span>

                <span
                  className="px-2.5 py-0.5 rounded-full font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: connectionState === 'connected' ? '#4ADE80' : 'var(--text-secondary)',
                  }}
                >
                  {connectionState === 'connected'
                    ? t.connection.connected
                    : connectionState === 'error'
                      ? t.connection.error
                      : t.connection.disconnected}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Console Terminal Card */}
      <section
        className="flex-1 min-h-0 rounded-2xl p-4 border backdrop-blur-xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3 shrink-0">
          {/* Level filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', t.console.filterAll, counts.all],
                ['info', t.console.filterInfo, counts.info],
                ['warn', t.console.filterWarn, counts.warn],
                ['error', t.console.filterError, counts.error],
              ] as const
            ).map(([level, label, count]) => {
              const active = levelFilter === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setLevelFilter(level)}
                  className="px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border"
                  style={{
                    backgroundColor: active ? 'var(--accent-purple)' : 'var(--bg-elevated)',
                    color: active ? '#ffffff' : 'var(--text-secondary)',
                    borderColor: active ? 'var(--accent-yellow)' : 'var(--border-subtle)',
                  }}
                >
                  <span>{label}</span>
                  <span className="font-mono text-[10px] opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search
                className="w-3.5 h-3.5 absolute start-3 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.console.searchPlaceholder}
                className="h-8 ps-8 pe-3 rounded-xl text-xs border outline-none w-44 transition"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <label
              className="h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-yellow-400 cursor-pointer"
              />
              <span>{t.console.autoScroll}</span>
            </label>

            <button
              type="button"
              onClick={() => void onRefreshLogs()}
              className="h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 border hover:bg-white/10 transition cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              title={t.console.refreshBtn}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={() => void handleCopy()}
              className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 border hover:bg-white/10 transition cursor-pointer disabled:opacity-45"
              style={{
                backgroundColor: 'var(--accent-yellow-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--accent-yellow)',
              }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.console.copiedBtn : t.console.copyBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => void onClearLogs()}
              className="h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 text-rose-400 hover:bg-rose-500/15 border transition cursor-pointer"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.console.clearBtn}</span>
            </button>
          </div>
        </div>

        {/* Monospace Log Stream */}
        <div
          ref={scrollRef}
          dir="ltr"
          className="flex-1 min-h-0 rounded-xl p-3.5 border font-mono text-xs overflow-y-auto space-y-1.5 select-text"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs opacity-60">
              {t.console.empty}
            </div>
          ) : (
            filteredLogs.map((entry, idx) => (
              <div
                key={`${entry.ts}-${idx}`}
                className="leading-relaxed break-all px-2 py-1 rounded-lg hover:bg-white/5 transition"
              >
                <span className="opacity-50">
                  [{new Date(entry.ts).toLocaleTimeString()}]
                </span>{' '}
                <span
                  className={
                    entry.level === 'error'
                      ? 'text-rose-400 font-bold'
                      : entry.level === 'warn'
                        ? 'text-amber-300 font-bold'
                        : 'text-emerald-300 font-bold'
                  }
                >
                  [{entry.level.toUpperCase()}]
                </span>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

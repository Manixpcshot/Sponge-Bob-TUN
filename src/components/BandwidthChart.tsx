import React, { useMemo } from 'react';
import { Activity, ArrowDown, ArrowUp, TrendingUp } from 'lucide-react';
import type { BandwidthPoint, ConnectionState, TrafficStatsSnapshot } from '../../electron/types';
import { formatBytes, formatSpeed } from '../i18n';
import type { TranslationKeys } from '../i18n/fa';

interface BandwidthChartProps {
  t: TranslationKeys;
  isFa: boolean;
  traffic: TrafficStatsSnapshot;
  connectionState: ConnectionState;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    d += ` C ${midX.toFixed(1)},${prev.y.toFixed(1)} ${midX.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  return d;
}

export const BandwidthChart: React.FC<BandwidthChartProps> = ({
  t,
  isFa,
  traffic,
  connectionState,
}) => {
  const width = 680;
  const height = 210;
  const padY = 14;

  const { downLine, downArea, upLine, upArea } = useMemo(() => {
    const raw: BandwidthPoint[] =
      traffic.history.length >= 2
        ? traffic.history
        : [
            { ts: 0, uploadBps: 0, downloadBps: 0 },
            { ts: 1, uploadBps: 0, downloadBps: 0 },
          ];

    const maxVal = Math.max(
      1024,
      ...raw.map((p) => Math.max(p.downloadBps, p.uploadBps)),
    );

    const mapPoints = (pick: (p: BandwidthPoint) => number) =>
      raw.map((p, idx) => {
        const x = (idx / (raw.length - 1)) * width;
        const norm = Math.min(1, pick(p) / maxVal);
        const y = height - padY - norm * (height - padY * 2);
        return { x, y };
      });

    const dPts = mapPoints((p) => p.downloadBps);
    const uPts = mapPoints((p) => p.uploadBps);

    const dPath = buildSmoothPath(dPts);
    const uPath = buildSmoothPath(uPts);

    return {
      downLine: dPath,
      downArea: dPath ? `${dPath} L ${width},${height} L 0,${height} Z` : '',
      upLine: uPath,
      upArea: uPath ? `${uPath} L ${width},${height} L 0,${height} Z` : '',
    };
  }, [traffic.history]);

  const sessionTotal = traffic.sessionDownloadBytes + traffic.sessionUploadBytes;

  return (
    <section
      className="flex-1 min-h-0 rounded-2xl p-5 border backdrop-blur-xl flex flex-col justify-between gap-4 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header with Live Speed Readouts */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--accent-purple-soft)',
              color: 'var(--accent-purple)',
            }}
          >
            <Activity className="w-4.5 h-4.5" />
          </div>
          <h3 className="text-sm sm:text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {t.bandwidth.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-mono" dir="ltr">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              borderColor: 'rgba(168, 85, 247, 0.35)',
            }}
          >
            <ArrowDown className="w-4 h-4 text-purple-400" />
            <span className="font-extrabold text-purple-200">
              {formatSpeed(traffic.downloadBps, isFa)}
            </span>
          </div>

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
            style={{
              backgroundColor: 'var(--accent-yellow-soft)',
              borderColor: 'rgba(250, 204, 21, 0.35)',
            }}
          >
            <ArrowUp className="w-4 h-4" style={{ color: 'var(--accent-yellow)' }} />
            <span className="font-extrabold" style={{ color: 'var(--accent-yellow)' }}>
              {formatSpeed(traffic.uploadBps, isFa)}
            </span>
          </div>
        </div>
      </div>

      {/* Live SVG Area Chart */}
      <div
        className="relative flex-1 min-h-[150px] rounded-2xl overflow-hidden border px-1 pt-2 flex items-end"
        style={{
          backgroundColor: 'var(--bg-input)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full block">
          <defs>
            <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FACC15" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#FACC15" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={0}
              x2={width}
              y1={height * ratio}
              y2={height * ratio}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="4 4"
            />
          ))}

          {downArea && <path d={downArea} fill="url(#downFill)" />}
          {upArea && <path d={upArea} fill="url(#upFill)" />}
          {downLine && (
            <path d={downLine} fill="none" stroke="#C084FC" strokeWidth="2.6" strokeLinecap="round" />
          )}
          {upLine && (
            <path d={upLine} fill="none" stroke="#FACC15" strokeWidth="2.2" strokeLinecap="round" />
          )}
        </svg>

        {connectionState !== 'connected' && traffic.history.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-medium pointer-events-none px-4 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            {t.bandwidth.waiting}
          </div>
        )}
      </div>

      {/* Session & Peak Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
        <div
          className="rounded-xl px-3 py-2.5 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t.bandwidth.sessionDown}
          </div>
          <div className="text-sm font-mono font-extrabold text-purple-300 mt-0.5" dir="ltr">
            {formatBytes(traffic.sessionDownloadBytes, isFa)}
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-2.5 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t.bandwidth.sessionUp}
          </div>
          <div className="text-sm font-mono font-extrabold mt-0.5" style={{ color: 'var(--accent-yellow)' }} dir="ltr">
            {formatBytes(traffic.sessionUploadBytes, isFa)}
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-2.5 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t.bandwidth.sessionTotal}
          </div>
          <div className="text-sm font-mono font-extrabold mt-0.5" style={{ color: 'var(--text-primary)' }} dir="ltr">
            {formatBytes(sessionTotal, isFa)}
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-2.5 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <TrendingUp className="w-3 h-3 text-purple-400" />
            <span>{t.bandwidth.peakDown}</span>
          </div>
          <div className="text-sm font-mono font-extrabold text-purple-200 mt-0.5" dir="ltr">
            {formatSpeed(traffic.peakDownloadBps, isFa)}
          </div>
        </div>

        <div
          className="col-span-2 sm:col-span-1 rounded-xl px-3 py-2.5 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <TrendingUp className="w-3 h-3" style={{ color: 'var(--accent-yellow)' }} />
            <span>{t.bandwidth.peakUp}</span>
          </div>
          <div className="text-sm font-mono font-extrabold mt-0.5" style={{ color: 'var(--accent-yellow)' }} dir="ltr">
            {formatSpeed(traffic.peakUploadBps, isFa)}
          </div>
        </div>
      </div>
    </section>
  );
};

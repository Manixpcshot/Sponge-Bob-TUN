import React, { useMemo } from 'react';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
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
  const width = 460;
  const height = 112;
  const padY = 10;

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
      className="rounded-2xl p-4 border backdrop-blur-xl flex flex-col justify-between"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--accent-purple-soft)',
              color: 'var(--accent-purple)',
            }}
          >
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {t.bandwidth.title}
          </h3>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono" dir="ltr">
          <span className="inline-flex items-center gap-1 font-bold text-purple-300">
            <ArrowDown className="w-3.5 h-3.5 text-purple-400" />
            {formatSpeed(traffic.downloadBps, isFa)}
          </span>
          <span className="inline-flex items-center gap-1 font-bold" style={{ color: 'var(--accent-yellow)' }}>
            <ArrowUp className="w-3.5 h-3.5" />
            {formatSpeed(traffic.uploadBps, isFa)}
          </span>
        </div>
      </div>

      {/* Live SVG Area Chart */}
      <div
        className="relative rounded-xl overflow-hidden border px-1 pt-1"
        style={{
          backgroundColor: 'var(--bg-input)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 block">
          <defs>
            <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.48" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FACC15" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#FACC15" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Subtle grid lines */}
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
            <path d={downLine} fill="none" stroke="#C084FC" strokeWidth="2.4" strokeLinecap="round" />
          )}
          {upLine && (
            <path d={upLine} fill="none" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>

        {connectionState !== 'connected' && traffic.history.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs font-medium pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {t.bandwidth.waiting}
          </div>
        )}
      </div>

      {/* Session byte counters */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div
          className="rounded-xl px-2.5 py-2 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {t.bandwidth.sessionDown}
          </div>
          <div className="text-xs font-mono font-bold text-purple-300 mt-0.5" dir="ltr">
            {formatBytes(traffic.sessionDownloadBytes, isFa)}
          </div>
        </div>

        <div
          className="rounded-xl px-2.5 py-2 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {t.bandwidth.sessionUp}
          </div>
          <div className="text-xs font-mono font-bold mt-0.5" style={{ color: 'var(--accent-yellow)' }} dir="ltr">
            {formatBytes(traffic.sessionUploadBytes, isFa)}
          </div>
        </div>

        <div
          className="rounded-xl px-2.5 py-2 border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {t.bandwidth.sessionTotal}
          </div>
          <div className="text-xs font-mono font-bold mt-0.5" style={{ color: 'var(--text-primary)' }} dir="ltr">
            {formatBytes(sessionTotal, isFa)}
          </div>
        </div>
      </div>
    </section>
  );
};

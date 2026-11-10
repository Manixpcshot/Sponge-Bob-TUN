import React from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Radio,
  Server,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wifi,
} from 'lucide-react';
import type {
  AppSettings,
  ConnectionState,
  QuotaAlertState,
  TrafficStatsSnapshot,
  UpdateStatus,
} from '../../electron/types';
import { formatSpeed } from '../i18n';
import type { TranslationKeys } from '../i18n/fa';
import {
  bikiniBottomDayImg,
  bikiniBottomSceneImg,
  jellyfishFieldsImg,
  krustyKrabImg,
  pineappleHouseImg,
  squidwardMascotImg,
} from './Mascots';

export type AppSection = 'connection' | 'configs' | 'console' | 'bikinibottom' | 'settings';

interface SideNavProps {
  t: TranslationKeys;
  isFa: boolean;
  activeSection: AppSection;
  collapsed: boolean;
  connectionState: ConnectionState;
  serverCount: number;
  quotaAlert: QuotaAlertState | null;
  traffic: TrafficStatsSnapshot;
  settings: AppSettings;
  updateStatus: UpdateStatus;
  xrayAvailable: boolean;
  xrayVersion: string | null;
  logErrorCount: number;
  onSelectSection: (section: AppSection) => void;
  onToggleCollapse: () => void;
}

export const SideNav: React.FC<SideNavProps> = ({
  t,
  isFa,
  activeSection,
  collapsed,
  connectionState,
  serverCount,
  quotaAlert,
  traffic,
  settings,
  updateStatus,
  xrayAvailable,
  xrayVersion,
  logErrorCount,
  onSelectSection,
  onToggleCollapse,
}) => {
  const isConnected = connectionState === 'connected';
  const isBusy = connectionState === 'connecting' || connectionState === 'reconnecting';
  const isDay = settings.theme === 'bikinibottom';
  const hasUpdate =
    updateStatus.stage === 'available' ||
    updateStatus.stage === 'downloading' ||
    updateStatus.stage === 'downloaded';

  const navItems: Array<{
    id: AppSection;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
    subtext?: string;
  }> = [
    {
      id: 'connection',
      label: t.nav.connection,
      shortLabel: t.nav.connectionShort,
      icon: <Radio className={`w-4 h-4 ${isConnected ? 'text-emerald-400' : ''}`} />,
      badge: (
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isConnected || isBusy ? 'animate-pulse' : ''
          }`}
          style={{
            backgroundColor: isConnected
              ? '#22C55E'
              : isBusy
                ? '#FACC15'
                : connectionState === 'error'
                  ? '#F43F5E'
                  : 'rgba(148, 163, 184, 0.45)',
          }}
        />
      ),
      subtext: isConnected
        ? `↓ ${formatSpeed(traffic.downloadBps, isFa)}`
        : isBusy
          ? t.connection.connectingBtn
          : t.connection.disconnected,
    },
    {
      id: 'configs',
      label: t.nav.configs,
      shortLabel: t.nav.configsShort,
      icon: <Server className="w-4 h-4" />,
      badge: (
        <div className="flex items-center gap-1">
          {quotaAlert?.shouldAlert && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
          <span
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{
              backgroundColor: 'var(--accent-purple-soft)',
              color: 'var(--accent-purple)',
            }}
          >
            {serverCount}
          </span>
        </div>
      ),
    },
    {
      id: 'console',
      label: t.nav.console,
      shortLabel: t.nav.consoleShort,
      icon: <Terminal className="w-4 h-4" />,
      badge:
        logErrorCount > 0 ? (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300">
            {logErrorCount}
          </span>
        ) : undefined,
    },
    {
      id: 'bikinibottom',
      label: t.nav.bikinibottom,
      shortLabel: t.nav.bikinibottomShort,
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: t.nav.settings,
      shortLabel: t.nav.settingsShort,
      icon: <SlidersHorizontal className="w-4 h-4" />,
      badge: hasUpdate ? (
        <span
          className="w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--accent-yellow)' }}
        />
      ) : undefined,
    },
  ];

  const scenePreview = (() => {
    switch (activeSection) {
      case 'connection':
        return { img: pineappleHouseImg, caption: t.gallery.pineappleTitle };
      case 'configs':
        return { img: krustyKrabImg, caption: t.gallery.krustyTitle };
      case 'console':
        return { img: squidwardMascotImg, caption: t.gallery.squidwardTitle };
      case 'bikinibottom':
        return { img: jellyfishFieldsImg, caption: t.gallery.jellyfishTitle };
      case 'settings':
        return {
          img: isDay ? bikiniBottomDayImg : bikiniBottomSceneImg,
          caption: isDay ? t.gallery.dayPanoramaTitle : t.gallery.panoramaTitle,
        };
    }
  })();

  const CollapseChevron = isFa
    ? collapsed
      ? ChevronLeft
      : ChevronRight
    : collapsed
      ? ChevronRight
      : ChevronLeft;

  return (
    <aside
      data-testid="side-nav"
      className={`relative z-20 shrink-0 h-full flex flex-col justify-between border-e backdrop-blur-xl transition-all duration-200 overflow-y-auto ${
        collapsed ? 'w-[74px] px-2 py-3' : 'w-56 px-3 py-3'
      }`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Top nav header & collapse button */}
      <div className="space-y-2">
        <div
          className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between px-1'} mb-1`}
        >
          {!collapsed && (
            <span
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.appSubtitle}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? t.nav.expand : t.nav.collapse}
            aria-label={collapsed ? t.nav.expand : t.nav.collapse}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-white/10 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <CollapseChevron className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Section Buttons */}
        <nav className="space-y-1.5" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-section={item.id}
                onClick={() => onSelectSection(item.id)}
                title={item.label}
                className={`relative w-full rounded-xl transition flex items-center cursor-pointer border ${
                  collapsed
                    ? 'flex-col justify-center gap-1 py-2.5 px-1'
                    : 'justify-between gap-2.5 px-3 py-2 text-start'
                }`}
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(250,204,21,0.18), rgba(168,85,247,0.24))'
                    : 'transparent',
                  borderColor: isActive ? 'var(--accent-yellow)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidenav-active-pill"
                    className="absolute inset-y-2 start-0 w-1 rounded-full"
                    style={{ backgroundColor: 'var(--accent-yellow)' }}
                  />
                )}

                <div
                  className={`flex items-center min-w-0 ${
                    collapsed ? 'flex-col gap-1' : 'gap-2.5'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--accent-yellow-soft)'
                        : 'var(--bg-elevated)',
                      color: isActive ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                    }}
                  >
                    {item.icon}
                  </div>

                  {collapsed ? (
                    <span className="text-[10px] font-bold truncate max-w-[60px]">
                      {item.shortLabel}
                    </span>
                  ) : (
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.label}</div>
                      {item.subtext && (
                        <div
                          className="text-[10px] font-mono truncate mt-0.5"
                          style={{
                            color: isConnected ? '#4ADE80' : 'var(--text-muted)',
                          }}
                          dir="ltr"
                        >
                          {item.subtext}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!collapsed && item.badge}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Bikini Bottom Mini Showcase + Port Chip */}
      <div className="space-y-2 pt-2 shrink-0">
        {!collapsed ? (
          <button
            type="button"
            onClick={() => onSelectSection('bikinibottom')}
            className="w-full text-start rounded-2xl overflow-hidden border transition hover:brightness-110 cursor-pointer group"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="relative h-24 w-full overflow-hidden">
              <img
                src={scenePreview.img}
                alt={scenePreview.caption}
                className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute bottom-2 inset-x-2.5 flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-yellow-300 truncate">
                  {scenePreview.caption}
                </span>
              </div>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectSection('bikinibottom')}
            title={scenePreview.caption}
            className="w-12 h-12 mx-auto rounded-xl overflow-hidden border block cursor-pointer hover:scale-105 transition"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <img
              src={scenePreview.img}
              alt={scenePreview.caption}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </button>
        )}

        {!collapsed && (
          <div
            className="rounded-xl px-2.5 py-2 border text-[10px] space-y-1"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 font-semibold">
                <Wifi className="w-3 h-3" style={{ color: 'var(--accent-yellow)' }} />
                {t.nav.localProxy}
              </span>
              <span
                className={`font-bold ${xrayAvailable ? 'text-emerald-400' : 'text-amber-400'}`}
              >
                {xrayVersion || (xrayAvailable ? 'Xray' : 'No Xray')}
              </span>
            </div>
            <div className="font-mono text-[10px] text-center" dir="ltr">
              SOCKS5 :{settings.socksPort} • HTTP :{settings.httpPort}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

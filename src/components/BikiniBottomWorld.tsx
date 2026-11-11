import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  CheckCircle2,
  Flame,
  Gauge,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Utensils,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  AppTheme,
  ConnectionState,
  PublicServerInfo,
} from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';
import {
  bikiniBottomDayImg,
  bikiniBottomSceneImg,
  friendsJellyfishingImg,
  garySnailImg,
  jellyfishFieldsImg,
  krabbyPattyImg,
  krustyKrabImg,
  pineappleHouseImg,
  planktonChumbucketImg,
  sandyTreedomeImg,
  spongebobSkyImg,
  squidwardMascotImg,
} from './Mascots';
import type { AppSection } from './SideNav';

interface BikiniBottomWorldProps {
  t: TranslationKeys;
  connectionState: ConnectionState;
  servers: PublicServerInfo[];
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onProbeLatencies: () => Promise<void>;
  onNavigateSection: (section: AppSection) => void;
  onNotifyPreset: (message: string) => void;
}

interface JellyfishSprite {
  id: number;
  x: number;
  y: number;
  color: string;
  scale: number;
  speed: number;
}

const JELLY_COLORS = ['#F472B6', '#FDE047', '#22D3EE', '#C084FC', '#FB7185'];

function makeSwarm(seed = 1): JellyfishSprite[] {
  return Array.from({ length: 7 }, (_, idx) => ({
    id: seed * 100 + idx,
    x: 8 + ((idx * 13 + seed * 7) % 74),
    y: 12 + ((idx * 17 + seed * 11) % 58),
    color: JELLY_COLORS[(idx + seed) % JELLY_COLORS.length],
    scale: 0.85 + (idx % 3) * 0.16,
    speed: 2.8 + (idx % 4) * 0.7,
  }));
}

function readStoredCount(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export const BikiniBottomWorld: React.FC<BikiniBottomWorldProps> = ({
  t,
  connectionState,
  servers,
  settings,
  onUpdateSettings,
  onProbeLatencies,
  onNavigateSection,
  onNotifyPreset,
}) => {
  const [subTab, setSubTab] = useState<'jellyfish' | 'burgers' | 'houses'>('jellyfish');
  const [swarm, setSwarm] = useState<JellyfishSprite[]>(() => makeSwarm(1));
  const [jellyCaught, setJellyCaught] = useState<number>(() =>
    readStoredCount('sbt_jelly_caught'),
  );
  const [burgerCount, setBurgerCount] = useState<number>(() =>
    readStoredCount('sbt_krabby_patties'),
  );
  const [isProbing, setIsProbing] = useState(false);
  const [isGrilling, setIsGrilling] = useState(false);
  const grillTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (grillTimerRef.current !== null) {
        window.clearTimeout(grillTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('sbt_jelly_caught', String(jellyCaught));
    } catch {
      // ignore storage errors
    }
  }, [jellyCaught]);

  useEffect(() => {
    try {
      window.localStorage.setItem('sbt_krabby_patties', String(burgerCount));
    } catch {
      // ignore storage errors
    }
  }, [burgerCount]);

  const fastestNode = useMemo(() => {
    const valid = servers
      .filter((s) => s.healthy && s.latencyMs !== null)
      .sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999));
    return valid[0] ?? null;
  }, [servers]);

  const healthyCount = useMemo(
    () => servers.filter((s) => s.healthy).length,
    [servers],
  );

  const handleCatchJelly = (id: number) => {
    setJellyCaught((prev) => prev + 1);
    setSwarm((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              id: Date.now() + Math.floor(Math.random() * 10000),
              x: 8 + Math.floor(Math.random() * 74),
              y: 12 + Math.floor(Math.random() * 58),
              color: JELLY_COLORS[Math.floor(Math.random() * JELLY_COLORS.length)],
            }
          : j,
      ),
    );
  };

  const handleProbeMeadow = async () => {
    setIsProbing(true);
    try {
      await onProbeLatencies();
      setSwarm(makeSwarm(Math.floor(Math.random() * 50) + 2));
    } finally {
      setIsProbing(false);
    }
  };

  const handleGrillBurger = () => {
    if (grillTimerRef.current !== null) {
      window.clearTimeout(grillTimerRef.current);
    }
    setIsGrilling(true);
    setBurgerCount((prev) => prev + 1);
    grillTimerRef.current = window.setTimeout(() => {
      setIsGrilling(false);
      grillTimerRef.current = null;
    }, 380);
  };

  const applyPreset = async (patch: Partial<AppSettings>, label: string) => {
    await onUpdateSettings(patch);
    onNotifyPreset(`${label} — ${t.world.presetAppliedToast}`);
  };

  const fryRank =
    burgerCount >= 15
      ? t.world.burgerRankMaster
      : burgerCount >= 5
        ? t.world.burgerRankChef
        : t.world.burgerRankBeginner;

  const isDay = settings.theme === 'bikinibottom';

  const badges = [
    {
      id: 'neighbor',
      label: t.world.badgeNeighbor,
      unlocked: servers.length > 0,
    },
    {
      id: 'hunter',
      label: t.world.badgeHunter,
      unlocked: jellyCaught >= 5 || fastestNode !== null,
    },
    {
      id: 'tunnel',
      label: t.world.badgeTunnel,
      unlocked: connectionState === 'connected',
    },
    {
      id: 'frycook',
      label: t.world.badgeFryCook,
      unlocked: burgerCount >= 5,
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {/* Section Header + Sub-tabs */}
      <section
        className="rounded-2xl p-4 border backdrop-blur-xl shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-yellow)' }} />
            <h2 className="font-extrabold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>
              {t.world.title}
            </h2>
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            {t.world.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {(
            [
              ['jellyfish', t.world.tabJellyfish],
              ['burgers', t.world.tabBurgers],
              ['houses', t.world.tabHouses],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border"
              style={{
                backgroundColor: subTab === id ? 'var(--accent-purple)' : 'var(--bg-elevated)',
                color: subTab === id ? '#ffffff' : 'var(--text-secondary)',
                borderColor: subTab === id ? 'var(--accent-yellow)' : 'var(--border-subtle)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pe-0.5">
        {subTab === 'jellyfish' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Interactive Jellyfish Meadow Canvas */}
            <section
              className="lg:col-span-8 relative rounded-2xl overflow-hidden border min-h-[340px] flex flex-col justify-between"
              style={{
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <img
                src={isDay ? friendsJellyfishingImg : jellyfishFieldsImg}
                alt={t.world.jellyTitle}
                className="absolute inset-0 w-full h-full object-cover transition-all duration-700"
                draggable={false}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: isDay
                    ? 'linear-gradient(180deg, rgba(6,38,68,0.52) 0%, rgba(10,30,55,0.18) 55%, rgba(4,24,48,0.82) 100%)'
                    : 'linear-gradient(180deg, rgba(6,22,44,0.55) 0%, rgba(10,10,25,0.22) 55%, rgba(6,18,38,0.82) 100%)',
                }}
              />

              {/* Top Overlay */}
              <div className="relative z-10 p-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-yellow-300 drop-shadow">
                    {t.world.jellyTitle}
                  </h3>
                  <p className="text-xs text-cyan-100/90 max-w-lg mt-0.5 drop-shadow">
                    {t.world.jellyDesc}
                  </p>
                </div>

                <div
                  className="px-3.5 py-1.5 rounded-xl border backdrop-blur-md text-xs font-extrabold"
                  style={{
                    backgroundColor: 'rgba(10, 14, 30, 0.72)',
                    borderColor: 'var(--accent-yellow)',
                    color: 'var(--accent-yellow)',
                  }}
                >
                  {t.world.jellyScoreLabel}: <span className="font-mono text-sm">{jellyCaught}</span>
                </div>
              </div>

              {/* Interactive Catchable Jellyfish Sprites */}
              <div className="relative z-10 flex-1 min-h-[180px] overflow-hidden">
                {swarm.map((jelly) => (
                  <motion.button
                    key={jelly.id}
                    type="button"
                    aria-label="Catch Jellyfish"
                    onClick={() => handleCatchJelly(jelly.id)}
                    initial={{ scale: jelly.scale }}
                    whileHover={{ scale: jelly.scale * 1.25 }}
                    whileTap={{ scale: jelly.scale * 0.7 }}
                    animate={{
                      scale: jelly.scale,
                      y: [-8, 8, -8],
                      x: [-5, 5, -5],
                      rotate: [-6, 6, -6],
                    }}
                    transition={{
                      duration: jelly.speed,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute cursor-pointer p-1 rounded-full focus:outline-none"
                    style={{
                      left: `${jelly.x}%`,
                      top: `${jelly.y}%`,
                      filter: `drop-shadow(0 0 10px ${jelly.color})`,
                    }}
                  >
                    <svg width="42" height="48" viewBox="0 0 64 72">
                      <path
                        d="M12,30 C12,12 52,12 52,30 C52,36 44,35 40,33 C36,31 28,31 24,33 C20,35 12,36 12,30 Z"
                        fill={jelly.color}
                      />
                      <path
                        d="M20,33 Q17,48 22,60 M32,33 Q35,50 30,65 M44,33 Q47,48 42,60"
                        stroke="#FEF08A"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                  </motion.button>
                ))}
              </div>

              {/* Bottom Controls */}
              <div className="relative z-10 p-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={servers.length === 0 || isProbing}
                  onClick={() => void handleProbeMeadow()}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition hover:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-yellow), var(--accent-purple))',
                    color: '#0b0b12',
                  }}
                >
                  <Gauge className={`w-4 h-4 ${isProbing ? 'animate-spin' : ''}`} />
                  <span>{t.world.jellyProbeBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSwarm(makeSwarm(Math.floor(Math.random() * 90) + 3))}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border backdrop-blur-md cursor-pointer hover:bg-white/15 transition"
                  style={{
                    backgroundColor: 'rgba(10, 14, 30, 0.72)',
                    borderColor: 'var(--border-subtle)',
                    color: '#f8fafc',
                  }}
                >
                  {t.world.jellySpawnBtn}
                </button>
              </div>
            </section>

            {/* Telemetry & Achievements Side Column */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div
                className="rounded-2xl p-4 border backdrop-blur-xl space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                <div
                  className="rounded-xl p-3 border"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t.world.jellyFastestLabel}
                  </div>
                  <div className="text-sm font-extrabold mt-0.5 truncate" style={{ color: 'var(--accent-yellow)' }}>
                    {fastestNode ? `${fastestNode.remark} (${fastestNode.latencyMs} ms)` : '—'}
                  </div>
                </div>

                <div
                  className="rounded-xl p-3 border"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t.world.jellyHealthyRatio}
                  </div>
                  <div className="text-base font-mono font-extrabold text-emerald-400 mt-0.5">
                    {healthyCount} / {servers.length}
                  </div>
                </div>
              </div>

              <div
                className="rounded-2xl p-4 border backdrop-blur-xl space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <Award className="w-4 h-4" style={{ color: 'var(--accent-yellow)' }} />
                  <span>{t.world.achievementsTitle}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl px-3 py-2 border flex items-center justify-between text-xs font-semibold"
                      style={{
                        backgroundColor: b.unlocked ? 'rgba(34, 197, 94, 0.14)' : 'var(--bg-elevated)',
                        borderColor: b.unlocked ? '#22C55E' : 'var(--border-subtle)',
                        color: b.unlocked ? '#4ADE80' : 'var(--text-muted)',
                      }}
                    >
                      <span>{b.label}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'burgers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Krabby Patty Grill Card */}
            <section
              className="lg:col-span-5 relative overflow-hidden rounded-2xl p-5 border backdrop-blur-xl flex flex-col items-center justify-between text-center gap-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <img
                src={krustyKrabImg}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-20"
                draggable={false}
              />
              <div className="relative z-10 space-y-1">
                <h3 className="font-extrabold text-base" style={{ color: 'var(--accent-yellow)' }}>
                  {t.world.burgerTitle}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {fryRank}
                </p>
              </div>

              <motion.button
                type="button"
                onClick={handleGrillBurger}
                animate={isGrilling ? { scale: [1, 1.15, 0.94, 1], rotate: [-6, 6, 0] } : { y: [0, -4, 0] }}
                transition={{ duration: isGrilling ? 0.36 : 3, repeat: isGrilling ? 0 : Infinity }}
                className="relative z-10 w-44 h-44 rounded-3xl overflow-hidden border-2 shadow-2xl cursor-pointer"
                style={{ borderColor: 'var(--accent-yellow)' }}
                title={t.world.burgerGrillBtn}
              >
                <img
                  src={krabbyPattyImg}
                  alt="Krabby Patty"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </motion.button>

              <div className="relative z-10 w-full space-y-2.5">
                <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t.world.burgerCountLabel}:{' '}
                  <span className="font-mono text-base font-extrabold" style={{ color: 'var(--accent-yellow)' }}>
                    {burgerCount}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleGrillBurger}
                  className="w-full py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition hover:brightness-110"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-yellow), #f97316)',
                    color: '#0f172a',
                  }}
                >
                  <Utensils className="w-4 h-4" />
                  <span>{t.world.burgerGrillBtn}</span>
                </button>
              </div>
            </section>

            {/* Secret Formula One-Click Functional Xray Presets */}
            <section
              className="lg:col-span-7 rounded-2xl p-5 border backdrop-blur-xl space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div>
                <h3 className="font-extrabold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
                  {t.world.burgerDesc}
                </h3>
              </div>

              <div className="space-y-2.5">
                <div
                  className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-yellow-400/20 text-yellow-300">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm">{t.world.presetSpeedTitle}</div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {t.world.presetSpeedDesc}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void applyPreset(
                        {
                          autoBestServer: true,
                          latencyCheckIntervalSec: 20,
                          healthCheckIntervalSec: 10,
                          bypassLan: true,
                        },
                        t.world.presetSpeedTitle,
                      )
                    }
                    className="px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer shrink-0"
                    style={{ backgroundColor: 'var(--accent-yellow)', color: '#0f172a' }}
                  >
                    {t.world.presetApplyBtn}
                  </button>
                </div>

                <div
                  className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-purple-500/20 text-purple-300">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm">{t.world.presetShieldTitle}</div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {t.world.presetShieldDesc}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void applyPreset(
                        {
                          autoBestServer: true,
                          enableSystemProxy: true,
                          fallbackFailureThreshold: 2,
                          autoUpdateOnLaunch: true,
                          autoInstallUpdateOnLaunch: true,
                        },
                        t.world.presetShieldTitle,
                      )
                    }
                    className="px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer shrink-0"
                    style={{ backgroundColor: 'var(--accent-purple)', color: '#ffffff' }}
                  >
                    {t.world.presetApplyBtn}
                  </button>
                </div>

                <div
                  className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-cyan-500/20 text-cyan-300">
                      <Flame className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm">{t.world.presetStealthTitle}</div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {t.world.presetStealthDesc}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void applyPreset(
                        { enableSystemProxy: false },
                        t.world.presetStealthTitle,
                      )
                    }
                    className="px-4 py-2 rounded-xl text-xs font-extrabold border cursor-pointer shrink-0"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {t.world.presetApplyBtn}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {subTab === 'houses' && (
          <div className="space-y-3">
            {/* Day vs Night Houses Banner */}
            <section
              className="relative overflow-hidden rounded-2xl border p-5 flex flex-col md:flex-row md:items-end justify-between gap-4 min-h-[220px]"
              style={{
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <img
                src={isDay ? bikiniBottomDayImg : bikiniBottomSceneImg}
                alt={t.world.housesTitle}
                className="absolute inset-0 w-full h-full object-cover transition-all duration-700"
                draggable={false}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(6,16,32,0.28) 0%, rgba(5,12,24,0.88) 100%)',
                }}
              />

              <div className="relative z-10 max-w-xl">
                <h3 className="font-extrabold text-base sm:text-lg text-yellow-300 drop-shadow">
                  {t.world.housesTitle}
                </h3>
                <p className="text-xs text-slate-100 mt-1 drop-shadow">
                  {t.world.housesDesc}
                </p>
              </div>

              <div className="relative z-10 flex flex-wrap gap-2">
                {(
                  [
                    ['bikinibottom', t.world.switchToDay, Sun],
                    ['obsidian', t.world.switchToNight, Moon],
                  ] as Array<[AppTheme, string, typeof Sun]>
                ).map(([themeId, label, Icon]) => {
                  const active = settings.theme === themeId;
                  return (
                    <button
                      key={themeId}
                      type="button"
                      onClick={() => void onUpdateSettings({ theme: themeId })}
                      className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border cursor-pointer transition hover:scale-[1.03]"
                      style={{
                        backgroundColor: active
                          ? 'var(--accent-yellow)'
                          : 'rgba(12, 18, 36, 0.78)',
                        color: active ? '#0f172a' : '#f8fafc',
                        borderColor: active ? 'var(--accent-yellow)' : 'rgba(255,255,255,0.25)',
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Interactive Bikini Bottom Neighborhood Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {(
                [
                  {
                    key: 'pineapple',
                    section: 'connection' as AppSection,
                    img: pineappleHouseImg,
                    title: t.world.housePineapple,
                    desc: t.world.housePineappleDesc,
                  },
                  {
                    key: 'krusty',
                    section: 'configs' as AppSection,
                    img: krustyKrabImg,
                    title: t.world.houseKrusty,
                    desc: t.world.houseKrustyDesc,
                  },
                  {
                    key: 'squidward',
                    section: 'console' as AppSection,
                    img: squidwardMascotImg,
                    title: t.world.houseSquidward,
                    desc: t.world.houseSquidwardDesc,
                  },
                  {
                    key: 'sandy',
                    section: 'connection' as AppSection,
                    img: sandyTreedomeImg,
                    title: t.world.houseSandy,
                    desc: t.world.houseSandyDesc,
                  },
                  {
                    key: 'gary',
                    section: 'configs' as AppSection,
                    img: garySnailImg,
                    title: t.world.houseGary,
                    desc: t.world.houseGaryDesc,
                  },
                  {
                    key: 'plankton',
                    section: 'settings' as AppSection,
                    img: planktonChumbucketImg,
                    title: t.world.housePlankton,
                    desc: t.world.housePlanktonDesc,
                  },
                  {
                    key: 'sky',
                    section: 'settings' as AppSection,
                    img: spongebobSkyImg,
                    title: t.world.houseSky,
                    desc: t.world.houseSkyDesc,
                  },
                ] as const
              ).map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => onNavigateSection(card.section)}
                  className="group rounded-2xl overflow-hidden border text-start transition hover:scale-[1.02] cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    boxShadow: 'var(--card-shadow)',
                  }}
                >
                  <div className="h-28 w-full overflow-hidden">
                    <img
                      src={card.img}
                      alt={card.title}
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                      draggable={false}
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-extrabold" style={{ color: 'var(--accent-yellow)' }}>
                      {card.title}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {card.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

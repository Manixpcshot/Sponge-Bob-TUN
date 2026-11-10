import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ExternalLink,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import type { AppSettings, UpdateStatus } from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';
import { BIKINI_BOTTOM_ARTWORK, type BikiniBottomArtworkItem } from './Mascots';

interface SettingsPanelProps {
  t: TranslationKeys;
  settings: AppSettings;
  updateStatus: UpdateStatus;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onPickMascot: (target: 'sponge' | 'crab') => Promise<void>;
  onCheckUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onOpenGithubReleases: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  t,
  settings,
  updateStatus,
  onUpdateSettings,
  onPickMascot,
  onCheckUpdates,
  onInstallUpdate,
  onOpenGithubReleases,
}) => {
  const [tab, setTab] = useState<'general' | 'network' | 'update'>('general');
  const [lightboxItem, setLightboxItem] = useState<{
    src: string;
    title: string;
  } | null>(null);

  const getArtworkTitle = (id: BikiniBottomArtworkItem['id']): string => {
    switch (id) {
      case 'sponge':
        return t.gallery.spongeTitle;
      case 'pineapple':
        return t.gallery.pineappleTitle;
      case 'squidward':
        return t.gallery.squidwardTitle;
      case 'crab':
        return t.gallery.crabTitle;
      case 'krusty':
        return t.gallery.krustyTitle;
      case 'patrick':
        return t.gallery.patrickTitle;
      case 'panorama':
        return t.gallery.panoramaTitle;
    }
  };

  const updateStageLabel = (() => {
    switch (updateStatus.stage) {
      case 'checking':
        return t.updater.checking;
      case 'available':
        return `${t.updater.available}: v${updateStatus.latestVersion}`;
      case 'downloading':
        return `${t.updater.downloading} (${updateStatus.percent ?? 0}%)`;
      case 'downloaded':
        return t.updater.downloaded;
      case 'up-to-date':
        return t.updater.upToDate;
      case 'error':
        return `${t.updater.error}${updateStatus.message ? `: ${updateStatus.message}` : ''}`;
      default:
        return '';
    }
  })();

  return (
    <section
      className="flex-1 min-h-0 flex flex-col rounded-2xl border backdrop-blur-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header + Sub-tabs */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-input)' }}
      >
        <h2 className="font-extrabold text-sm sm:text-base" style={{ color: 'var(--accent-yellow)' }}>
          {t.settingsModal.title}
        </h2>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              ['general', t.settingsModal.tabGeneral],
              ['network', t.settingsModal.tabNetwork],
              ['update', t.settingsModal.tabUpdate],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border"
              style={{
                backgroundColor: tab === id ? 'var(--accent-purple)' : 'var(--bg-elevated)',
                color: tab === id ? '#ffffff' : 'var(--text-secondary)',
                borderColor: tab === id ? 'var(--accent-yellow)' : 'var(--border-subtle)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {tab === 'general' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                className="p-4 rounded-xl border"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="text-xs font-bold mb-2.5">{t.settingsModal.language}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ language: 'fa' })}
                    className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer border"
                    style={{
                      backgroundColor:
                        settings.language === 'fa' ? 'var(--accent-yellow)' : 'var(--bg-input)',
                      color: settings.language === 'fa' ? '#0f172a' : 'var(--text-primary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    فارسی (RTL)
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ language: 'en' })}
                    className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer border"
                    style={{
                      backgroundColor:
                        settings.language === 'en' ? 'var(--accent-yellow)' : 'var(--bg-input)',
                      color: settings.language === 'en' ? '#0f172a' : 'var(--text-primary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    English (LTR)
                  </button>
                </div>
              </div>

              <div
                className="p-4 rounded-xl border"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="text-xs font-bold mb-2.5">{t.settingsModal.theme}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ theme: 'obsidian' })}
                    className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer border"
                    style={{
                      backgroundColor:
                        settings.theme === 'obsidian' ? 'var(--accent-purple)' : 'var(--bg-input)',
                      color: settings.theme === 'obsidian' ? '#ffffff' : 'var(--text-primary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {t.themeObsidian}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateSettings({ theme: 'bikinibottom' })}
                    className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer border"
                    style={{
                      backgroundColor:
                        settings.theme === 'bikinibottom' ? 'var(--accent-yellow)' : 'var(--bg-input)',
                      color: settings.theme === 'bikinibottom' ? '#0f172a' : 'var(--text-primary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {t.themeBikini}
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Mascot Image Upload */}
            <div
              className="p-4 rounded-xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <div className="text-xs font-bold">{t.settingsModal.mascotTitle}</div>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.settingsModal.mascotHint}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onPickMascot('sponge')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer border"
                  style={{
                    backgroundColor: 'var(--accent-yellow-soft)',
                    color: 'var(--accent-yellow)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{t.settingsModal.uploadSponge}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void onPickMascot('crab')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer border"
                  style={{
                    backgroundColor: 'var(--accent-purple-soft)',
                    color: 'var(--accent-purple)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{t.settingsModal.uploadCrab}</span>
                </button>

                {(settings.customSpongeMascotDataUrl || settings.customCrabMascotDataUrl) && (
                  <button
                    type="button"
                    onClick={() =>
                      void onUpdateSettings({
                        customSpongeMascotDataUrl: null,
                        customCrabMascotDataUrl: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer hover:bg-white/10"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.settingsModal.resetMascots}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bikini Bottom Universe Artwork Gallery */}
            <div
              className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-yellow)' }} />
                <div>
                  <div className="text-xs sm:text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {t.gallery.title}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t.gallery.subtitle}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {BIKINI_BOTTOM_ARTWORK.map((art) => {
                  const title = getArtworkTitle(art.id);
                  return (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => setLightboxItem({ src: art.src, title })}
                      className="group relative rounded-xl overflow-hidden border text-start transition hover:scale-[1.02] cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="aspect-[16/10] w-full overflow-hidden">
                        <img
                          src={art.src}
                          alt={title}
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                          draggable={false}
                        />
                      </div>
                      <div className="px-2.5 py-2 text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {title}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === 'network' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className="p-3.5 rounded-xl border block"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-xs font-bold block mb-1.5">{t.settingsModal.socksPort}</span>
                <input
                  dir="ltr"
                  type="number"
                  min={1024}
                  max={65535}
                  value={settings.socksPort}
                  onChange={(e) =>
                    void onUpdateSettings({ socksPort: Number(e.target.value) || 10808 })
                  }
                  className="w-full h-9 rounded-lg px-3 text-xs font-mono border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label
                className="p-3.5 rounded-xl border block"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-xs font-bold block mb-1.5">{t.settingsModal.httpPort}</span>
                <input
                  dir="ltr"
                  type="number"
                  min={1024}
                  max={65535}
                  value={settings.httpPort}
                  onChange={(e) =>
                    void onUpdateSettings({ httpPort: Number(e.target.value) || 10809 })
                  }
                  className="w-full h-9 rounded-lg px-3 text-xs font-mono border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label
                className="p-3 rounded-xl border block"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-[11px] font-bold block mb-1">{t.settingsModal.latencyInterval}</span>
                <input
                  dir="ltr"
                  type="number"
                  min={15}
                  max={600}
                  value={settings.latencyCheckIntervalSec}
                  onChange={(e) =>
                    void onUpdateSettings({
                      latencyCheckIntervalSec: Math.max(15, Number(e.target.value) || 45),
                    })
                  }
                  className="w-full h-8 rounded-lg px-2.5 text-xs font-mono border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label
                className="p-3 rounded-xl border block"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-[11px] font-bold block mb-1">{t.settingsModal.healthInterval}</span>
                <input
                  dir="ltr"
                  type="number"
                  min={5}
                  max={120}
                  value={settings.healthCheckIntervalSec}
                  onChange={(e) =>
                    void onUpdateSettings({
                      healthCheckIntervalSec: Math.max(5, Number(e.target.value) || 15),
                    })
                  }
                  className="w-full h-8 rounded-lg px-2.5 text-xs font-mono border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label
                className="p-3 rounded-xl border block"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-[11px] font-bold block mb-1">{t.settingsModal.fallbackThreshold}</span>
                <input
                  dir="ltr"
                  type="number"
                  min={1}
                  max={10}
                  value={settings.fallbackFailureThreshold}
                  onChange={(e) =>
                    void onUpdateSettings({
                      fallbackFailureThreshold: Math.max(1, Math.min(10, Number(e.target.value) || 3)),
                    })
                  }
                  className="w-full h-8 rounded-lg px-2.5 text-xs font-mono border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </div>

            {(
              [
                ['enableSystemProxy', t.settingsModal.systemProxy, t.settingsModal.systemProxyHint],
                ['bypassLan', t.settingsModal.bypassLan, undefined],
                ['autoBestServer', t.settingsModal.autoBest, undefined],
                ['minimizeToTrayOnClose', t.settingsModal.minimizeTray, undefined],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl border cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="text-xs font-bold">{label}</div>
                  {hint && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {hint}
                    </div>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => void onUpdateSettings({ [key]: e.target.checked })}
                  className="w-4 h-4 accent-yellow-400 cursor-pointer"
                />
              </label>
            ))}
          </div>
        )}

        {tab === 'update' && (
          <div className="space-y-3">
            <div
              className="p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t.settingsModal.currentVersion}
                </div>
                <div className="text-base font-mono font-extrabold" style={{ color: 'var(--accent-yellow)' }}>
                  v{updateStatus.currentVersion}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onCheckUpdates()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-yellow), var(--accent-purple))',
                    color: '#0b0b12',
                  }}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${updateStatus.stage === 'checking' ? 'animate-spin' : ''}`}
                  />
                  <span>{t.settingsModal.checkNowBtn}</span>
                </button>

                {updateStatus.stage === 'downloaded' && (
                  <button
                    type="button"
                    onClick={() => void onInstallUpdate()}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-black cursor-pointer"
                  >
                    {t.settingsModal.installNowBtn}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenGithubReleases}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t.settingsModal.openReleases}</span>
                </button>
              </div>
            </div>

            {updateStageLabel && (
              <div
                className="p-3 rounded-xl text-xs font-semibold border"
                style={{
                  backgroundColor: 'var(--accent-purple-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {updateStageLabel}
              </div>
            )}

            <label
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl border cursor-pointer"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-xs font-bold">{t.settingsModal.autoUpdateLaunch}</span>
              <input
                type="checkbox"
                checked={settings.autoUpdateOnLaunch}
                onChange={(e) => void onUpdateSettings({ autoUpdateOnLaunch: e.target.checked })}
                className="w-4 h-4 accent-yellow-400 cursor-pointer"
              />
            </label>

            <label
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl border cursor-pointer"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-xs font-bold">{t.settingsModal.autoInstallLaunch}</span>
              <input
                type="checkbox"
                checked={settings.autoInstallUpdateOnLaunch}
                onChange={(e) =>
                  void onUpdateSettings({ autoInstallUpdateOnLaunch: e.target.checked })
                }
                className="w-4 h-4 accent-yellow-400 cursor-pointer"
              />
            </label>
          </div>
        )}
      </div>

      {/* Lightbox Modal for Gallery Preview */}
      <AnimatePresence>
        {lightboxItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxItem(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl w-full rounded-2xl overflow-hidden border shadow-2xl"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span className="font-bold text-sm" style={{ color: 'var(--accent-yellow)' }}>
                  {lightboxItem.title}
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxItem(null)}
                  className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <img
                src={lightboxItem.src}
                alt={lightboxItem.title}
                className="w-full max-h-[70vh] object-contain bg-black/50"
                draggable={false}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

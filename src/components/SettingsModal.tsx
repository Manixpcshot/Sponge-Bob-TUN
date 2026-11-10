import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ExternalLink,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { AppSettings, SafeLogEntry, UpdateStatus } from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';

interface SettingsModalProps {
  t: TranslationKeys;
  isOpen: boolean;
  settings: AppSettings;
  updateStatus: UpdateStatus;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onPickMascot: (target: 'sponge' | 'crab') => Promise<void>;
  onCheckUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onOpenGithubReleases: () => void;
  onLoadLogs: () => Promise<SafeLogEntry[]>;
  onClearLogs: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  t,
  isOpen,
  settings,
  updateStatus,
  onClose,
  onUpdateSettings,
  onPickMascot,
  onCheckUpdates,
  onInstallUpdate,
  onOpenGithubReleases,
  onLoadLogs,
  onClearLogs,
}) => {
  const [tab, setTab] = useState<'general' | 'network' | 'update' | 'logs'>('general');
  const [logs, setLogs] = useState<SafeLogEntry[]>([]);

  useEffect(() => {
    if (isOpen && tab === 'logs') {
      void onLoadLogs().then(setLogs);
    }
  }, [isOpen, tab, onLoadLogs]);

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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            className="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <h3 className="font-bold text-base" style={{ color: 'var(--accent-yellow)' }}>
                {t.settingsModal.title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div
              className="flex items-center gap-1.5 px-5 py-2.5 border-b overflow-x-auto"
              style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-input)' }}
            >
              {(
                [
                  ['general', t.settingsModal.tabGeneral],
                  ['network', t.settingsModal.tabNetwork],
                  ['update', t.settingsModal.tabUpdate],
                  ['logs', t.settingsModal.tabLogs],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer"
                  style={{
                    backgroundColor: tab === id ? 'var(--accent-purple)' : 'transparent',
                    color: tab === id ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {tab === 'general' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      className="p-3.5 rounded-xl border"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="text-xs font-bold mb-2">{t.settingsModal.language}</div>
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
                      className="p-3.5 rounded-xl border"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="text-xs font-bold mb-2">{t.settingsModal.theme}</div>
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

              {tab === 'logs' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <ShieldAlert className="w-4 h-4 text-emerald-400" />
                      <span>{t.settingsModal.logsTitle}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onClearLogs().then(() => setLogs([]))}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t.settingsModal.clearLogs}</span>
                    </button>
                  </div>

                  <div
                    dir="ltr"
                    className="rounded-xl p-3 border font-mono text-[11px] h-64 overflow-y-auto space-y-1"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {logs.length === 0 ? (
                      <div className="text-center py-10 opacity-60">{t.settingsModal.noLogs}</div>
                    ) : (
                      logs.map((entry, idx) => (
                        <div key={idx} className="leading-relaxed break-all">
                          <span className="opacity-50">
                            [{new Date(entry.ts).toLocaleTimeString()}]
                          </span>{' '}
                          <span
                            className={
                              entry.level === 'error'
                                ? 'text-rose-400'
                                : entry.level === 'warn'
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                            }
                          >
                            [{entry.level.toUpperCase()}]
                          </span>{' '}
                          <span>{entry.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              className="px-5 py-3 border-t flex justify-end"
              style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-input)' }}
            >
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{ backgroundColor: 'var(--accent-yellow)', color: '#0f172a' }}
              >
                {t.settingsModal.saveClose}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

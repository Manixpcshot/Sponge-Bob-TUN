import React from 'react';
import {
  Github,
  Minus,
  Palette,
  RefreshCw,
  Settings,
  Square,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  AppTheme,
  UpdateStatus,
  WindowControlsState,
} from '../../electron/types';
import type { TranslationKeys } from '../i18n/fa';
import appIconImg from '@/assets/app-icon.png';

interface TitleBarProps {
  t: TranslationKeys;
  language: AppLanguage;
  theme: AppTheme;
  windowState: WindowControlsState;
  updateStatus: UpdateStatus;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onOpenSettings: () => void;
  onOpenGithub: () => void;
  onInstallUpdate: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  t,
  language,
  theme,
  windowState,
  updateStatus,
  onToggleTheme,
  onToggleLanguage,
  onOpenSettings,
  onOpenGithub,
  onInstallUpdate,
  onMinimize,
  onToggleMaximize,
  onClose,
}) => {
  const showUpdatePill =
    updateStatus.stage === 'available' ||
    updateStatus.stage === 'downloading' ||
    updateStatus.stage === 'downloaded';

  return (
    <header
      dir="ltr"
      onDoubleClick={onToggleMaximize}
      className="drag-region relative z-40 flex items-center justify-between h-12 px-3 border-b backdrop-blur-xl select-none shrink-0"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Left side: Brand + Quick Action Pills */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div data-tauri-drag-region className="flex items-center gap-2 cursor-default">
          <img
            data-tauri-drag-region
            src={appIconImg}
            alt="Sponge bob tun"
            className="w-7 h-7 rounded-lg shadow-md"
            draggable={false}
          />
          <div data-tauri-drag-region className="flex items-baseline gap-2 truncate">
            <span
              data-tauri-drag-region
              className="font-extrabold text-sm tracking-tight"
              style={{ color: 'var(--accent-yellow)' }}
            >
              {t.appName}
            </span>
            <span
              data-tauri-drag-region
              className="hidden sm:inline text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--accent-purple-soft)',
                color: 'var(--accent-purple)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {t.appSubtitle}
            </span>
          </div>
        </div>

        <div className="no-drag flex items-center gap-1.5 ml-2 shrink-0">
          {/* Language switcher (FA / EN) */}
          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition hover:scale-105 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Switch Language / تغییر زبان"
          >
            {language === 'fa' ? 'EN | فارسی' : 'FA | English'}
          </button>

          {/* Theme switcher (Obsidian Dark vs SpongeBob Yellow/Purple) */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition hover:scale-105 cursor-pointer"
            style={{
              backgroundColor:
                theme === 'bikinibottom'
                  ? 'var(--accent-yellow-soft)'
                  : 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: theme === 'bikinibottom' ? 'var(--accent-yellow)' : 'var(--text-secondary)',
            }}
            title={theme === 'obsidian' ? t.themeBikini : t.themeObsidian}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {theme === 'obsidian' ? t.themeObsidian : t.themeBikini}
            </span>
          </button>

          {/* GitHub */}
          <button
            type="button"
            onClick={onOpenGithub}
            className="p-1.5 rounded-lg transition hover:scale-105 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title={t.github}
          >
            <Github className="w-3.5 h-3.5" />
          </button>

          {/* Settings shortcut */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition hover:scale-105 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title={t.settings}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.settings}</span>
          </button>

          {/* Live Auto-Update Status Badge */}
          {showUpdatePill && (
            <button
              type="button"
              onClick={updateStatus.stage === 'downloaded' ? onInstallUpdate : onOpenSettings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold animate-pulse cursor-pointer"
              style={{
                backgroundColor: 'var(--accent-yellow)',
                color: '#111827',
              }}
            >
              <RefreshCw className={`w-3 h-3 ${updateStatus.stage === 'downloading' ? 'animate-spin' : ''}`} />
              <span>
                {updateStatus.stage === 'downloading'
                  ? `${updateStatus.percent ?? 0}%`
                  : updateStatus.stage === 'downloaded'
                    ? t.settingsModal.installNowBtn
                    : `v${updateStatus.latestVersion}`}
              </span>
            </button>
          )}
        </div>

        <div data-tauri-drag-region className="flex-1 self-stretch min-w-[24px]" />
      </div>

      {/* RIGHT SIDE ALWAYS (even in RTL): Minimize, Maximize/Restore, Close (no fullscreen icon) */}
      <div
        dir="ltr"
        data-testid="window-controls-right"
        className="no-drag flex items-center gap-1 ml-auto pl-2"
      >
        <button
          type="button"
          onClick={onMinimize}
          aria-label={t.minimize}
          title={t.minimize}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-white/10 cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={t.maximize}
          title={t.maximize}
          data-maximized={windowState.isMaximized ? 'true' : 'false'}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-white/10 cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Square className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          title={t.close}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-rose-500 hover:text-white cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

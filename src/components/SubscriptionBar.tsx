import React, { useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  FileKey2,
  FolderOpen,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { TranslationKeys } from '../i18n/fa';

interface SubscriptionBarProps {
  t: TranslationKeys;
  hasSubscriptionUrl: boolean;
  maskedSubscriptionUrl: string;
  serverCount: number;
  isUpdating: boolean;
  onUpdateSubscription: (url?: string) => Promise<void>;
  onRevealUrl: () => Promise<string>;
  onImportFile: () => Promise<void>;
  onExportNpvs: () => void;
  onClear: () => Promise<void>;
}

export const SubscriptionBar: React.FC<SubscriptionBarProps> = ({
  t,
  hasSubscriptionUrl,
  maskedSubscriptionUrl,
  serverCount,
  isUpdating,
  onUpdateSubscription,
  onRevealUrl,
  onImportFile,
  onExportNpvs,
  onClear,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);

  const handleToggleReveal = async () => {
    if (isRevealed) {
      setIsRevealed(false);
      setUrlInput('');
      return;
    }
    const real = await onRevealUrl();
    if (real) setUrlInput(real);
    setIsRevealed(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (trimmed) {
      await onUpdateSubscription(trimmed);
      if (!isRevealed) setUrlInput('');
    } else if (hasSubscriptionUrl) {
      await onUpdateSubscription(undefined);
    }
  };

  const showPlaceholder =
    hasSubscriptionUrl && !urlInput && !isRevealed
      ? maskedSubscriptionUrl
      : t.subscription.placeholder;

  return (
    <section
      className="rounded-2xl p-4 backdrop-blur-xl border transition-all"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--accent-yellow-soft)',
              color: 'var(--accent-yellow)',
            }}
          >
            <Link2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {t.subscription.title}
            </h2>
            <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{t.subscription.vaultNotice}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onImportFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition hover:scale-[1.02] cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-purple-soft)',
              color: 'var(--accent-purple)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{t.subscription.importFileBtn}</span>
          </button>

          <button
            type="button"
            disabled={serverCount === 0}
            onClick={onExportNpvs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition hover:scale-[1.02] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <FileKey2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-yellow)' }} />
            <span>{t.subscription.exportNpvsBtn}</span>
          </button>

          {(hasSubscriptionUrl || serverCount > 0) && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
              title={t.subscription.clearBtn}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 flex items-center">
          <input
            dir="ltr"
            type={isRevealed ? 'text' : 'password'}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={showPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="w-full h-11 rounded-xl px-4 pr-11 text-xs sm:text-sm outline-none transition border focus:ring-2"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          {hasSubscriptionUrl && (
            <button
              type="button"
              onClick={handleToggleReveal}
              className="absolute right-2.5 p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              title={isRevealed ? t.subscription.hideUrl : t.subscription.revealUrl}
            >
              {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isUpdating || (!urlInput.trim() && !hasSubscriptionUrl)}
          className="h-11 px-5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--accent-yellow), #eab308)',
            color: '#0f172a',
            boxShadow: '0 6px 20px rgba(250, 204, 21, 0.25)',
          }}
        >
          {isUpdating ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{isUpdating ? t.subscription.updatingBtn : t.subscription.fetchBtn}</span>
        </button>
      </form>
    </section>
  );
};

import React from 'react';
import { AlertCircle, Clock, HardDrive } from 'lucide-react';
import type { AppSettings, QuotaAlertState, SubscriptionUserInfo } from '../../electron/types';
import { formatBytes } from '../i18n';
import type { TranslationKeys } from '../i18n/fa';
import { CrabMascot, krustyKrabImg } from './Mascots';

interface QuotaCardProps {
  t: TranslationKeys;
  isFa: boolean;
  userInfo: SubscriptionUserInfo | null;
  quotaAlert: QuotaAlertState | null;
  settings: AppSettings;
}

export const QuotaCard: React.FC<QuotaCardProps> = ({
  t,
  isFa,
  userInfo,
  quotaAlert,
  settings,
}) => {
  const isAlert = Boolean(quotaAlert?.shouldAlert);
  const percent = quotaAlert?.percentUsed ?? 0;
  const usedBytes = quotaAlert?.usedBytes ?? 0;
  const totalBytes = quotaAlert?.totalBytes ?? 0;
  const days = quotaAlert?.daysRemaining ?? null;

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4 border backdrop-blur-xl flex flex-col justify-between transition-all"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: isAlert ? '#F59E0B' : 'var(--border-subtle)',
        boxShadow: isAlert ? '0 0 28px rgba(245, 158, 11, 0.2)' : 'var(--card-shadow)',
      }}
    >
      {/* Subtle Krusty Krab Restaurant backdrop */}
      <img
        src={krustyKrabImg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-20"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(16,16,27,0.72) 0%, rgba(16,16,27,0.92) 100%)',
        }}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CrabMascot
            isAlert={isAlert}
            customImageUrl={settings.customCrabMascotDataUrl}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {t.quota.title}
            </h3>
            <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t.quota.krustySubtitle}
            </p>
            {userInfo?.profileTitle && (
              <p className="text-xs font-semibold truncate mt-0.5" style={{ color: 'var(--accent-yellow)' }}>
                {userInfo.profileTitle}
              </p>
            )}
            <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-purple)' }} />
              {days === null ? (
                <span>{userInfo ? t.quota.unlimited : t.quota.noData}</span>
              ) : days <= 0 ? (
                <span className="text-rose-400 font-bold">{t.quota.expired}</span>
              ) : (
                <span className={days < 3 ? 'text-amber-300 font-bold' : ''}>
                  {Math.ceil(days)} {t.quota.daysLeft}
                </span>
              )}
            </p>
          </div>
        </div>

        {quotaAlert?.percentUsed !== null && quotaAlert?.percentUsed !== undefined && (
          <div
            className="px-2.5 py-1 rounded-xl text-xs font-mono font-extrabold shrink-0"
            style={{
              backgroundColor: quotaAlert.isOver80Percent
                ? 'rgba(245, 158, 11, 0.2)'
                : 'var(--accent-purple-soft)',
              color: quotaAlert.isOver80Percent ? '#FBBF24' : 'var(--accent-purple)',
            }}
          >
            {Math.round(percent)}%
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-4">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <HardDrive className="w-3.5 h-3.5" />
            {t.quota.used}:{' '}
            <strong className="font-mono" dir="ltr" style={{ color: 'var(--text-primary)' }}>
              {formatBytes(usedBytes, isFa)}
            </strong>
          </span>
          <span className="font-mono" dir="ltr" style={{ color: 'var(--text-muted)' }}>
            {totalBytes > 0 ? formatBytes(totalBytes, isFa) : t.quota.unlimited}
          </span>
        </div>

        <div className="w-full h-2.5 rounded-full overflow-hidden bg-black/40 border border-white/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${totalBytes > 0 ? Math.max(3, Math.min(100, percent)) : 0}%`,
              background: isAlert
                ? 'linear-gradient(90deg, #F59E0B, #EF4444)'
                : 'linear-gradient(90deg, var(--accent-purple), var(--accent-yellow))',
            }}
          />
        </div>
      </div>

      {/* Alert notice when >= 80% or < 3 days */}
      {isAlert && (
        <div className="relative z-10 mt-3 rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2 bg-amber-500/15 text-amber-200 border border-amber-500/35">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {quotaAlert?.isExpired
              ? t.quota.alertExpired
              : quotaAlert?.isOver80Percent
                ? t.quota.alert80
                : t.quota.alertExpiring}
          </span>
        </div>
      )}
    </section>
  );
};

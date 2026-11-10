import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountryFlag } from '../src/components/CountryFlag';
import { TitleBar } from '../src/components/TitleBar';
import { QuotaCard } from '../src/components/QuotaCard';
import { DEFAULT_SETTINGS } from '../electron/core/secureStore';
import { getTranslations } from '../src/i18n';

describe('UI Components SSR Verification', () => {
  it('renders TitleBar with window controls strictly pinned on the right in both FA and EN', () => {
    for (const lang of ['fa', 'en'] as const) {
      const t = getTranslations(lang);
      const html = renderToStaticMarkup(
        <TitleBar
          t={t}
          language={lang}
          theme="obsidian"
          windowState={{ isMaximized: false, isFullScreen: false }}
          updateStatus={{ stage: 'up-to-date', currentVersion: '1.0.0' }}
          onToggleTheme={() => {}}
          onToggleLanguage={() => {}}
          onOpenSettings={() => {}}
          onOpenGithub={() => {}}
          onInstallUpdate={() => {}}
          onMinimize={() => {}}
          onToggleMaximize={() => {}}
          onToggleFullscreen={() => {}}
          onClose={() => {}}
        />,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain('data-testid="window-controls-right"');
      expect(html).toContain('Sponge bob tun');
    }
  });

  it('renders crisp SVG flags for countries and Mr. Krabs QuotaCard alert state', () => {
    const flagHtml = renderToStaticMarkup(
      <>
        <CountryFlag code="DE" />
        <CountryFlag code="TR" />
        <CountryFlag code="NL" />
        <CountryFlag code="FI" />
      </>,
    );
    expect(flagHtml.match(/<svg/g)?.length).toBe(4);

    const t = getTranslations('fa');
    const quotaHtml = renderToStaticMarkup(
      <QuotaCard
        t={t}
        isFa={true}
        userInfo={{
          uploadBytes: 100,
          downloadBytes: 850,
          totalBytes: 1000,
          expireTimestampSec: Math.floor(Date.now() / 1000) + 86400,
          profileTitle: 'Bikini VIP',
          updatedAt: Date.now(),
        }}
        quotaAlert={{
          shouldAlert: true,
          percentUsed: 95,
          daysRemaining: 1,
          isExpired: false,
          isOver80Percent: true,
          isExpiringSoon: true,
          usedBytes: 950,
          totalBytes: 1000,
        }}
        settings={DEFAULT_SETTINGS}
      />,
    );
    expect(quotaHtml).toContain('95%');
    expect(quotaHtml).toContain(t.quota.alert80);
  });
});

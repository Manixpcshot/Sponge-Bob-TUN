import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../electron/core/secureStore';
import { BandwidthChart } from '../src/components/BandwidthChart';
import { ConnectionHero } from '../src/components/ConnectionHero';
import { ConsolePanel } from '../src/components/ConsolePanel';
import { CountryFlag } from '../src/components/CountryFlag';
import { QuotaCard } from '../src/components/QuotaCard';
import { SettingsPanel } from '../src/components/SettingsPanel';
import { SideNav } from '../src/components/SideNav';
import { TitleBar } from '../src/components/TitleBar';
import { getTranslations } from '../src/i18n';

describe('UI Components SSR Verification', () => {
  it('renders TitleBar without fullscreen button and with controls pinned on the right in both FA and EN', () => {
    for (const lang of ['fa', 'en'] as const) {
      const t = getTranslations(lang);
      const html = renderToStaticMarkup(
        <TitleBar
          t={t}
          language={lang}
          theme="obsidian"
          windowState={{ isMaximized: false, isFullScreen: false }}
          updateStatus={{ stage: 'up-to-date', currentVersion: '1.1.0' }}
          onToggleTheme={() => {}}
          onToggleLanguage={() => {}}
          onOpenSettings={() => {}}
          onOpenGithub={() => {}}
          onInstallUpdate={() => {}}
          onMinimize={() => {}}
          onToggleMaximize={() => {}}
          onClose={() => {}}
        />,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain('data-testid="window-controls-right"');
      expect(html).toContain('Sponge bob tun');
      expect(html).not.toContain('تمام‌صفحه');
      expect(html).not.toContain('Fullscreen');
    }
  });

  it('renders SideNav with separate Connection, Configs, Console, and Settings sections', () => {
    for (const lang of ['fa', 'en'] as const) {
      const t = getTranslations(lang);
      const html = renderToStaticMarkup(
        <SideNav
          t={t}
          isFa={lang === 'fa'}
          activeSection="connection"
          collapsed={false}
          connectionState="disconnected"
          serverCount={4}
          quotaAlert={null}
          traffic={{
            uploadBps: 0,
            downloadBps: 0,
            peakUploadBps: 0,
            peakDownloadBps: 0,
            sessionUploadBytes: 0,
            sessionDownloadBytes: 0,
            history: [],
          }}
          settings={DEFAULT_SETTINGS}
          updateStatus={{ stage: 'up-to-date', currentVersion: '1.1.0' }}
          xrayAvailable={true}
          xrayVersion="v26.11.9"
          logErrorCount={0}
          onSelectSection={() => {}}
          onToggleCollapse={() => {}}
        />,
      );

      const normalizedHtml = html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
      expect(normalizedHtml).toContain('data-testid="side-nav"');
      expect(normalizedHtml).toContain('data-section="connection"');
      expect(normalizedHtml).toContain('data-section="configs"');
      expect(normalizedHtml).toContain('data-section="console"');
      expect(normalizedHtml).toContain('data-section="settings"');
      expect(normalizedHtml).toContain(t.nav.connection);
      expect(normalizedHtml).toContain(t.nav.configs);
      expect(normalizedHtml).toContain(t.nav.console);
      expect(normalizedHtml).toContain(t.nav.settings);
    }
  });

  it('renders dedicated ConsolePanel, ConnectionHero, BandwidthChart, and Bikini Bottom Gallery', () => {
    const t = getTranslations('fa');

    const consoleHtml = renderToStaticMarkup(
      <ConsolePanel
        t={t}
        logs={[
          { ts: 1700000000000, level: 'info', message: 'Xray core started safely' },
          { ts: 1700000001000, level: 'warn', message: 'Probe timeout on fallback candidate' },
        ]}
        connectionState="connected"
        xrayAvailable={true}
        xrayVersion="v26.11.9"
        settings={DEFAULT_SETTINGS}
        onRefreshLogs={async () => {}}
        onClearLogs={async () => {}}
      />,
    );
    expect(consoleHtml).toContain(t.console.title);
    expect(consoleHtml).toContain('Xray core started safely');

    const heroHtml = renderToStaticMarkup(
      <ConnectionHero
        t={t}
        isFa={true}
        connectionState="disconnected"
        connectionMode="auto"
        activeServer={null}
        selectedServer={null}
        hasServers={false}
        settings={DEFAULT_SETTINGS}
        connectedSince={null}
        errorMessage={null}
        xrayAvailable={true}
        onConnect={async () => {}}
        onDisconnect={async () => {}}
        onGoToConfigs={() => {}}
      />,
    );
    expect(heroHtml).toContain(t.connection.addFirstConfigBtn);

    const bwHtml = renderToStaticMarkup(
      <BandwidthChart
        t={t}
        isFa={true}
        traffic={{
          uploadBps: 1024,
          downloadBps: 2048,
          peakUploadBps: 4096,
          peakDownloadBps: 8192,
          sessionUploadBytes: 10000,
          sessionDownloadBytes: 20000,
          history: [],
        }}
        connectionState="connected"
      />,
    );
    expect(bwHtml).toContain(t.bandwidth.peakDown);
    expect(bwHtml).toContain(t.bandwidth.peakUp);

    const settingsHtml = renderToStaticMarkup(
      <SettingsPanel
        t={t}
        settings={DEFAULT_SETTINGS}
        updateStatus={{ stage: 'up-to-date', currentVersion: '1.1.0' }}
        onUpdateSettings={async () => {}}
        onPickMascot={async () => {}}
        onCheckUpdates={async () => {}}
        onInstallUpdate={async () => {}}
        onOpenGithubReleases={() => {}}
      />,
    );
    expect(settingsHtml).toContain(t.gallery.pineappleTitle);
    expect(settingsHtml).toContain(t.gallery.squidwardTitle);
    expect(settingsHtml).toContain(t.gallery.krustyTitle);
    expect(settingsHtml).toContain(t.gallery.patrickTitle);
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

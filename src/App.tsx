import React, { useCallback, useEffect, useState } from 'react';
import type {
  AppSettings,
  AppSnapshot,
  AppToast,
  SafeLogEntry,
  WindowControlsState,
} from '../electron/types';
import { getSpongeBridge } from './bridge';
import { BandwidthChart } from './components/BandwidthChart';
import { BubbleBackground } from './components/BubbleBackground';
import { ConnectionHero } from './components/ConnectionHero';
import { ConsolePanel } from './components/ConsolePanel';
import { PasswordModal } from './components/PasswordModal';
import { QuotaCard } from './components/QuotaCard';
import { ServerList } from './components/ServerList';
import { SettingsPanel } from './components/SettingsPanel';
import { type AppSection, SideNav } from './components/SideNav';
import { SubscriptionBar } from './components/SubscriptionBar';
import { TitleBar } from './components/TitleBar';
import { ToastStack } from './components/ToastStack';
import { getTranslations } from './i18n';

const bridge = getSpongeBridge();

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [windowState, setWindowState] = useState<WindowControlsState>({
    isMaximized: false,
    isFullScreen: false,
  });
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [isUpdatingSub, setIsUpdatingSub] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('connection');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logs, setLogs] = useState<SafeLogEntry[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Password modal state for encrypted .npvs / subscriptions / exports
  const [passwordModal, setPasswordModal] = useState<{
    open: boolean;
    mode: 'unlock' | 'export';
    wrongPassword: boolean;
    pendingAction:
      | { type: 'url'; url?: string }
      | { type: 'file-dialog' }
      | { type: 'drop'; base64Bytes: string }
      | { type: 'export' }
      | null;
  }>({
    open: false,
    mode: 'unlock',
    wrongPassword: false,
    pendingAction: null,
  });

  const pushToast = useCallback((toast: AppToast) => {
    setToasts((prev) => [...prev.slice(-3), toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, 6000);
  }, []);

  const refreshLogs = useCallback(async () => {
    const entries = await bridge.getLogs();
    setLogs(entries);
  }, []);

  useEffect(() => {
    void bridge.getSnapshot().then(setSnapshot);
    void bridge.windowGetState().then(setWindowState);
    void refreshLogs();

    const unsubSnap = bridge.onSnapshot(setSnapshot);
    const unsubToast = bridge.onToast(pushToast);
    const unsubWin = bridge.onWindowState(setWindowState);

    return () => {
      unsubSnap();
      unsubToast();
      unsubWin();
    };
  }, [pushToast, refreshLogs]);

  // Live poll console logs while Console section is active (and refresh on state changes)
  useEffect(() => {
    void refreshLogs();
    if (activeSection !== 'console') return;
    const timer = setInterval(() => {
      void refreshLogs();
    }, 1500);
    return () => clearInterval(timer);
  }, [activeSection, snapshot?.connectionState, snapshot?.activeServerId, refreshLogs]);

  // Sync HTML dir/lang & CSS data-theme attribute whenever settings change
  useEffect(() => {
    if (!snapshot) return;
    const lang = snapshot.settings.language;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('data-theme', snapshot.settings.theme);
  }, [snapshot?.settings.language, snapshot?.settings.theme]);

  if (!snapshot) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#07070d] text-yellow-400 font-bold">
        Sponge bob tun...
      </div>
    );
  }

  const { settings } = snapshot;
  const isFa = settings.language === 'fa';
  const t = getTranslations(settings.language);

  const activeServer =
    snapshot.servers.find((s) => s.id === snapshot.activeServerId) ?? null;
  const selectedServer =
    snapshot.servers.find((s) => s.id === snapshot.selectedServerId) ?? null;

  const logErrorCount = logs.filter((entry) => entry.level === 'error').length;

  const handleUpdateSubscription = async (url?: string, password?: string) => {
    setIsUpdatingSub(true);
    try {
      const res = await bridge.updateSubscription(url, password);
      if (res.needsPassword || res.invalidPassword) {
        setPasswordModal({
          open: true,
          mode: 'unlock',
          wrongPassword: Boolean(res.invalidPassword),
          pendingAction: { type: 'url', url },
        });
        return;
      }
      if (res.ok) {
        setPasswordModal((p) => ({ ...p, open: false, pendingAction: null }));
        pushToast({
          id: `${Date.now()}-sub`,
          level: 'success',
          title: isFa ? 'اشتراک به‌روز شد' : 'Subscription Updated',
          message: isFa
            ? `${res.serverCount ?? 0} سرور VLESS با موفقیت بارگذاری شد.`
            : `Loaded ${res.serverCount ?? 0} VLESS server(s).`,
        });
      } else if (res.error) {
        pushToast({
          id: `${Date.now()}-suberr`,
          level: 'error',
          title: t.connection.error,
          message: res.error,
        });
      }
    } finally {
      setIsUpdatingSub(false);
    }
  };

  const handleImportFile = async (password?: string) => {
    const res = await bridge.importFileDialog(password);
    if (res.canceled) return;
    if (res.needsPassword || res.invalidPassword) {
      setPasswordModal({
        open: true,
        mode: 'unlock',
        wrongPassword: Boolean(res.invalidPassword),
        pendingAction: { type: 'file-dialog' },
      });
      return;
    }
    if (res.ok) {
      setPasswordModal((p) => ({ ...p, open: false, pendingAction: null }));
      pushToast({
        id: `${Date.now()}-imp`,
        level: 'success',
        title: isFa ? 'فایل با موفقیت وارد شد' : 'File Imported',
        message: isFa
          ? `${res.serverCount ?? 0} سرور VLESS اضافه شد.`
          : `Imported ${res.serverCount ?? 0} VLESS server(s).`,
      });
    } else if (res.error) {
      pushToast({
        id: `${Date.now()}-imperr`,
        level: 'error',
        title: t.connection.error,
        message: res.error,
      });
    }
  };

  const handleDropFile = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Bytes = btoa(binary);

    const res = await bridge.importRawPayload(base64Bytes, true);
    if (res.needsPassword || res.invalidPassword) {
      setPasswordModal({
        open: true,
        mode: 'unlock',
        wrongPassword: Boolean(res.invalidPassword),
        pendingAction: { type: 'drop', base64Bytes },
      });
      return;
    }
    if (res.ok) {
      setActiveSection('configs');
      pushToast({
        id: `${Date.now()}-drop`,
        level: 'success',
        title: isFa ? 'فایل دریافت شد' : 'Config Imported',
        message: isFa
          ? `${res.serverCount ?? 0} سرور VLESS بارگذاری شد.`
          : `Loaded ${res.serverCount ?? 0} VLESS server(s).`,
      });
    } else if (res.error) {
      pushToast({
        id: `${Date.now()}-droperr`,
        level: 'error',
        title: t.connection.error,
        message: res.error,
      });
    }
  };

  const handlePasswordConfirm = async (password: string) => {
    const action = passwordModal.pendingAction;
    if (!action) return;

    if (action.type === 'url') {
      await handleUpdateSubscription(action.url, password);
    } else if (action.type === 'file-dialog') {
      await handleImportFile(password);
    } else if (action.type === 'drop') {
      const res = await bridge.importRawPayload(action.base64Bytes, true, password);
      if (res.invalidPassword) {
        setPasswordModal((p) => ({ ...p, wrongPassword: true }));
        return;
      }
      if (res.ok) {
        setPasswordModal((p) => ({ ...p, open: false, pendingAction: null }));
        setActiveSection('configs');
        pushToast({
          id: `${Date.now()}-dropok`,
          level: 'success',
          title: isFa ? 'رمزگشایی موفق' : 'Decrypted Successfully',
          message: isFa
            ? `${res.serverCount ?? 0} سرور اضافه شد.`
            : `Imported ${res.serverCount ?? 0} server(s).`,
        });
      }
    } else if (action.type === 'export') {
      setPasswordModal((p) => ({ ...p, open: false, pendingAction: null }));
      const out = await bridge.exportNpvsDialog(password || undefined);
      if (out.ok) {
        pushToast({
          id: `${Date.now()}-exp`,
          level: 'success',
          title: isFa ? 'فایل .npvs ذخیره شد' : '.npvs Saved',
          message: isFa
            ? 'کانفیگ‌ها با موفقیت ذخیره شدند.'
            : 'Servers exported cleanly.',
        });
      }
    }
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    const next = await bridge.updateSettings(patch);
    setSnapshot(next);
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => void handleDropFile(e)}
    >
      <BubbleBackground theme={settings.theme} connectionState={snapshot.connectionState} />

      <TitleBar
        t={t}
        language={settings.language}
        theme={settings.theme}
        windowState={windowState}
        updateStatus={snapshot.updateStatus}
        onToggleTheme={() =>
          void handleUpdateSettings({
            theme: settings.theme === 'obsidian' ? 'bikinibottom' : 'obsidian',
          })
        }
        onToggleLanguage={() =>
          void handleUpdateSettings({
            language: settings.language === 'fa' ? 'en' : 'fa',
          })
        }
        onOpenSettings={() => setActiveSection('settings')}
        onOpenGithub={() => void bridge.openGithubRepo()}
        onInstallUpdate={() => void bridge.installUpdate()}
        onMinimize={() => void bridge.windowMinimize()}
        onToggleMaximize={() => void bridge.windowToggleMaximize().then(setWindowState)}
        onClose={() => void bridge.windowClose()}
      />

      {/* Drag & drop overlay */}
      {dragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md border-4 border-dashed border-yellow-400 pointer-events-none">
          <div className="text-center space-y-2">
            <div className="text-2xl font-extrabold text-yellow-300">
              {t.subscription.importFileBtn}
            </div>
            <div className="text-sm text-purple-200">{t.subscription.dropHint}</div>
          </div>
        </div>
      )}

      {/* Workspace Body: Edge Sidebar + Active Section View */}
      <div className="relative z-10 flex-1 min-h-0 flex overflow-hidden">
        <SideNav
          t={t}
          isFa={isFa}
          activeSection={activeSection}
          collapsed={sidebarCollapsed}
          connectionState={snapshot.connectionState}
          serverCount={snapshot.servers.length}
          quotaAlert={snapshot.quotaAlert}
          traffic={snapshot.traffic}
          settings={settings}
          updateStatus={snapshot.updateStatus}
          xrayAvailable={snapshot.xrayAvailable}
          xrayVersion={snapshot.xrayVersion}
          logErrorCount={logErrorCount}
          onSelectSection={setActiveSection}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />

        <main className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 p-4 overflow-hidden">
          {activeSection === 'connection' && (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
              <ConnectionHero
                t={t}
                isFa={isFa}
                connectionState={snapshot.connectionState}
                connectionMode={snapshot.connectionMode}
                activeServer={activeServer}
                selectedServer={selectedServer}
                hasServers={snapshot.servers.length > 0}
                settings={settings}
                connectedSince={snapshot.connectedSince}
                errorMessage={snapshot.errorMessage}
                xrayAvailable={snapshot.xrayAvailable}
                onConnect={async () => {
                  await bridge.connect();
                }}
                onDisconnect={async () => {
                  await bridge.disconnect();
                }}
                onGoToConfigs={() => setActiveSection('configs')}
              />

              <BandwidthChart
                t={t}
                isFa={isFa}
                traffic={snapshot.traffic}
                connectionState={snapshot.connectionState}
              />
            </div>
          )}

          {activeSection === 'configs' && (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
              <SubscriptionBar
                t={t}
                hasSubscriptionUrl={snapshot.hasSubscriptionUrl}
                maskedSubscriptionUrl={snapshot.maskedSubscriptionUrl}
                serverCount={snapshot.servers.length}
                isUpdating={isUpdatingSub}
                onUpdateSubscription={(url) => handleUpdateSubscription(url)}
                onRevealUrl={() => bridge.getSubscriptionUrl()}
                onImportFile={() => handleImportFile()}
                onExportNpvs={() =>
                  setPasswordModal({
                    open: true,
                    mode: 'export',
                    wrongPassword: false,
                    pendingAction: { type: 'export' },
                  })
                }
                onClear={async () => {
                  await bridge.disconnect();
                  const next = await bridge.clearSubscription();
                  setSnapshot(next);
                }}
              />

              <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-3 overflow-y-auto md:overflow-hidden">
                <div className="md:col-span-5 lg:col-span-4 flex flex-col gap-3 min-h-0 md:overflow-y-auto">
                  <QuotaCard
                    t={t}
                    isFa={isFa}
                    userInfo={snapshot.userInfo}
                    quotaAlert={snapshot.quotaAlert}
                    settings={settings}
                  />

                  <div
                    className="rounded-2xl p-4 border backdrop-blur-xl space-y-2.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      boxShadow: 'var(--card-shadow)',
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className="rounded-xl px-3 py-2 border"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {t.servers.healthyCountLabel}
                        </div>
                        <div className="text-base font-mono font-extrabold text-emerald-400">
                          {snapshot.servers.filter((s) => s.healthy).length} / {snapshot.servers.length}
                        </div>
                      </div>

                      <div
                        className="rounded-xl px-3 py-2 border"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {t.servers.pinnedCountLabel}
                        </div>
                        <div
                          className="text-base font-mono font-extrabold"
                          style={{ color: 'var(--accent-yellow)' }}
                        >
                          {snapshot.servers.filter((s) => s.isPinned).length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-7 lg:col-span-8 flex flex-col min-h-[280px] md:min-h-0">
                  <ServerList
                    t={t}
                    isFa={isFa}
                    servers={snapshot.servers}
                    connectionMode={snapshot.connectionMode}
                    connectionState={snapshot.connectionState}
                    activeServerId={snapshot.activeServerId}
                    selectedServerId={snapshot.selectedServerId}
                    onSelectAutoMode={async () => {
                      const next = await bridge.selectServer(null, 'auto');
                      setSnapshot(next);
                      if (snapshot.connectionState === 'connected') {
                        await bridge.connect('auto');
                      }
                    }}
                    onSelectServer={async (id) => {
                      const next = await bridge.selectServer(id, 'manual');
                      setSnapshot(next);
                    }}
                    onConnectServer={async (id) => {
                      await bridge.connect('manual', id);
                    }}
                    onTogglePin={async (id) => {
                      const next = await bridge.togglePinServer(id);
                      setSnapshot(next);
                    }}
                    onProbeLatencies={() => bridge.probeLatencies()}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'console' && (
            <ConsolePanel
              t={t}
              logs={logs}
              connectionState={snapshot.connectionState}
              xrayAvailable={snapshot.xrayAvailable}
              xrayVersion={snapshot.xrayVersion}
              settings={settings}
              onRefreshLogs={refreshLogs}
              onClearLogs={async () => {
                await bridge.clearLogs();
                setLogs([]);
              }}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsPanel
              t={t}
              settings={settings}
              updateStatus={snapshot.updateStatus}
              onUpdateSettings={handleUpdateSettings}
              onPickMascot={async (target) => {
                const res = await bridge.pickMascotImage(target);
                if (res.ok) {
                  const next = await bridge.getSnapshot();
                  setSnapshot(next);
                }
              }}
              onCheckUpdates={async () => {
                await bridge.checkUpdates();
              }}
              onInstallUpdate={async () => {
                await bridge.installUpdate();
              }}
              onOpenGithubReleases={() => void bridge.openGithubRepo('releases')}
            />
          )}
        </main>
      </div>

      <PasswordModal
        t={t}
        isOpen={passwordModal.open}
        mode={passwordModal.mode}
        wrongPassword={passwordModal.wrongPassword}
        onConfirm={handlePasswordConfirm}
        onCancel={() =>
          setPasswordModal((p) => ({ ...p, open: false, wrongPassword: false, pendingAction: null }))
        }
      />

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
      />
    </div>
  );
}

export default App;

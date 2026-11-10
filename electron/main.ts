import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  safeStorage,
  shell,
  Tray,
} from 'electron';
import { AppController } from './core/appController';
import type { ConnectionState, QuotaAlertState, WindowControlsState } from './types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: AppController | null = null;
let isQuitting = false;
let lastImportedFileBuffer: Buffer | null = null;

const appRoot = path.resolve(__dirname, '..');

function resolveAssetPath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.join(appRoot, 'assets', ...segments);
}

function getWindowIconPath(): string {
  const winIco = resolveAssetPath('icons', 'icon.ico');
  const pngIcon = resolveAssetPath('icons', 'icon.png');
  if (process.platform === 'win32' && fs.existsSync(winIco)) return winIco;
  return pngIcon;
}

function getTrayIcon(state: ConnectionState, hasQuotaAlert: boolean): Electron.NativeImage {
  const filename =
    hasQuotaAlert && state !== 'connected'
      ? 'tray-alert.png'
      : state === 'connected'
        ? 'tray-connected.png'
        : 'tray-idle.png';
  const iconPath = resolveAssetPath('icons', filename);
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return nativeImage.createFromPath(resolveAssetPath('icons', 'icon.png'));
}

function getWindowState(win: BrowserWindow | null): WindowControlsState {
  if (!win || win.isDestroyed()) return { isMaximized: false, isFullScreen: false };
  return {
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
  };
}

function broadcastWindowState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:state-changed', getWindowState(mainWindow));
  }
}

function rebuildTrayMenu(state: ConnectionState, hasQuotaAlert: boolean): void {
  if (!tray || !controller) return;
  const snap = controller.getSnapshot();
  const isFa = snap.settings.language === 'fa';
  const isConnected = state === 'connected' || state === 'connecting' || state === 'reconnecting';

  tray.setImage(getTrayIcon(state, hasQuotaAlert));
  tray.setToolTip(
    `Sponge bob tun${hasQuotaAlert ? (isFa ? ' • هشدار سهمیه!' : ' • Quota Alert!') : ''}`,
  );

  const menu = Menu.buildFromTemplate([
    {
      label: isFa ? 'نمایش پنجره Sponge bob tun' : 'Show Sponge bob tun',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: isConnected
        ? isFa
          ? 'قطع اتصال'
          : 'Disconnect'
        : isFa
          ? 'اتصال هوشمند'
          : 'Connect',
      click: () => {
        if (!controller) return;
        if (isConnected) void controller.disconnect();
        else void controller.connect();
      },
    },
    {
      label: isFa ? 'به‌روزرسانی اشتراک' : 'Update Subscription',
      enabled: snap.hasSubscriptionUrl,
      click: () => {
        void controller?.updateSubscription();
      },
    },
    { type: 'separator' },
    {
      label: isFa ? 'خروج کامل' : 'Quit Sponge bob tun',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function showQuotaOsNotification(alert: QuotaAlertState): void {
  if (!Notification.isSupported() || !controller) return;
  const isFa = controller.getSnapshot().settings.language === 'fa';
  const pct = alert.percentUsed !== null ? Math.round(alert.percentUsed) : null;
  const days = alert.daysRemaining !== null ? Math.max(0, Math.ceil(alert.daysRemaining)) : null;

  let body = '';
  if (alert.isExpired) {
    body = isFa
      ? 'اعتبار زمانی اشتراک شما به پایان رسیده است.'
      : 'Your subscription validity has expired.';
  } else if (alert.isOver80Percent && alert.isExpiringSoon) {
    body = isFa
      ? `${pct ?? 80}% حجم مصرف شده و کمتر از ${days ?? 3} روز به پایان باقی مانده است.`
      : `${pct ?? 80}% data used and less than ${days ?? 3} day(s) remaining.`;
  } else if (alert.isOver80Percent) {
    body = isFa
      ? `${pct ?? 80}% از حجم اشتراک شما مصرف شده است.`
      : `${pct ?? 80}% of your subscription data quota has been used.`;
  } else if (alert.isExpiringSoon) {
    body = isFa
      ? `کمتر از ${days ?? 3} روز تا انقضای اشتراک باقی مانده است.`
      : `Less than ${days ?? 3} day(s) left before your subscription expires.`;
  }

  const notification = new Notification({
    title: isFa ? 'Sponge bob tun • هشدار سهمیه آقای خرچنگ' : 'Sponge bob tun • Mr. Krabs Quota Alert',
    body,
    icon: resolveAssetPath('icons', 'icon.png'),
  });
  notification.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notification.show();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 960,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: '#08080e',
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('maximize', broadcastWindowState);
  mainWindow.on('unmaximize', broadcastWindowState);
  mainWindow.on('enter-full-screen', broadcastWindowState);
  mainWindow.on('leave-full-screen', broadcastWindowState);

  mainWindow.on('close', (event) => {
    if (isQuitting || !controller) return;
    const snap = controller.getSnapshot();
    const shouldHideToTray =
      snap.settings.minimizeToTrayOnClose &&
      (snap.connectionState === 'connected' ||
        snap.connectionState === 'connecting' ||
        snap.connectionState === 'reconnecting');

    if (shouldHideToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const devUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://localhost:5173' : '');
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-snapshot', () => controller!.getSnapshot());
  ipcMain.handle('sub:get-url', () => controller!.getDecryptedSubscriptionUrl());
  ipcMain.handle('sub:update', (_e, args: { url?: string; password?: string }) =>
    controller!.updateSubscription(args?.url, args?.password),
  );

  ipcMain.handle('sub:import-file-dialog', async (_e, args: { password?: string }) => {
    if (!mainWindow) return { ok: false, canceled: true };

    if (args?.password && lastImportedFileBuffer) {
      const res = await controller!.importFileOrPayload(lastImportedFileBuffer, args.password, false);
      if (res.ok) lastImportedFileBuffer = null;
      return res;
    }

    const pick = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Config & Subscription Files', extensions: ['npvs', 'txt', 'json', 'conf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (pick.canceled || pick.filePaths.length === 0) {
      lastImportedFileBuffer = null;
      return { ok: false, canceled: true };
    }

    const buf = fs.readFileSync(pick.filePaths[0]);
    const res = await controller!.importFileOrPayload(buf, args?.password, false);
    if (res.needsPassword || res.invalidPassword) {
      lastImportedFileBuffer = buf;
    } else {
      lastImportedFileBuffer = null;
    }
    return res;
  });

  ipcMain.handle(
    'sub:import-raw',
    async (_e, args: { base64OrText: string; isBase64Bytes: boolean; password?: string }) => {
      const payload = args.isBase64Bytes
        ? Buffer.from(args.base64OrText, 'base64')
        : args.base64OrText;
      return controller!.importFileOrPayload(payload, args.password, false);
    },
  );

  ipcMain.handle('sub:export-npvs-dialog', async (_e, args: { password?: string }) => {
    if (!mainWindow) return { ok: false, canceled: true };
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'sponge-bob-tun-servers.npvs',
      filters: [{ name: 'NPVS Encrypted Config', extensions: ['npvs'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) {
      return { ok: false, canceled: true };
    }
    const ok = controller!.exportServersAsNpvs(saveRes.filePath, args?.password);
    return { ok };
  });

  ipcMain.handle('sub:clear', () => {
    controller!.clearSubscriptionData();
    return controller!.getSnapshot();
  });

  ipcMain.handle('server:select', (_e, args: { serverId: string | null; mode?: 'manual' | 'auto' }) => {
    controller!.selectServer(args.serverId, args.mode);
    return controller!.getSnapshot();
  });

  ipcMain.handle('server:toggle-pin', (_e, args: { serverId: string }) => {
    controller!.togglePinServer(args.serverId);
    return controller!.getSnapshot();
  });

  ipcMain.handle('server:probe-latencies', () => controller!.probeAllLatencies());

  ipcMain.handle('vpn:connect', (_e, args: { mode?: 'manual' | 'auto'; serverId?: string }) =>
    controller!.connect(args?.mode, args?.serverId),
  );
  ipcMain.handle('vpn:disconnect', () => controller!.disconnect());

  ipcMain.handle('settings:update', (_e, patch) => controller!.updateSettings(patch));
  ipcMain.handle('settings:pick-mascot', async (_e, args: { target: 'sponge' | 'crab' }) => {
    if (!mainWindow) return { ok: false };
    const pick = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (pick.canceled || pick.filePaths.length === 0) return { ok: false };
    const filePath = pick.filePaths[0];
    const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const data = fs.readFileSync(filePath);
    if (data.length > 4 * 1024 * 1024) {
      return { ok: false };
    }
    const dataUrl = `data:image/${mime};base64,${data.toString('base64')}`;
    const patch =
      args.target === 'sponge'
        ? { customSpongeMascotDataUrl: dataUrl }
        : { customCrabMascotDataUrl: dataUrl };
    await controller!.updateSettings(patch);
    return { ok: true, dataUrl };
  });

  ipcMain.handle('logs:get', () => controller!.getSafeLogs());
  ipcMain.handle('logs:clear', () => controller!.clearLogs());

  ipcMain.handle('updater:check', () => controller!.checkForUpdatesNow());
  ipcMain.handle('updater:install', () => controller!.installUpdateNow());
  ipcMain.handle('app:open-github', (_e, subpath?: string) => {
    const clean = typeof subpath === 'string' ? subpath.replace(/^\/+/, '') : '';
    const url = `https://github.com/Manixpcshot/Sponge-Bob-TUN${clean ? `/${clean}` : ''}`;
    if (url.startsWith('https://github.com/Manixpcshot/Sponge-Bob-TUN')) {
      return shell.openExternal(url);
    }
    return Promise.resolve();
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return { isMaximized: false, isFullScreen: false };
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    } else if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return getWindowState(mainWindow);
  });
  ipcMain.handle('window:toggle-fullscreen', () => {
    if (!mainWindow) return { isMaximized: false, isFullScreen: false };
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return getWindowState(mainWindow);
  });
  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('window:get-state', () => getWindowState(mainWindow));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.setAppUserModelId('io.github.manixpcshot.spongebobtun');

  void app.whenReady().then(async () => {
    controller = new AppController({
      userDataDir: app.getPath('userData'),
      appRoot,
      resourcesPath: app.isPackaged ? process.resourcesPath : undefined,
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      safeStorage,
      callbacks: {
        onSnapshotChanged: (snap) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:snapshot', snap);
          }
        },
        onToast: (toast) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:toast', toast);
          }
        },
        onQuotaNotification: (alert) => {
          showQuotaOsNotification(alert);
        },
        onTrayStateChanged: (state, hasQuotaAlert) => {
          rebuildTrayMenu(state, hasQuotaAlert);
        },
      },
    });

    tray = new Tray(getTrayIcon('disconnected', false));
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    registerIpcHandlers();
    createWindow();
    await controller.initialize();
    const initial = controller.getSnapshot();
    rebuildTrayMenu(initial.connectionState, Boolean(initial.quotaAlert?.shouldAlert));
  });

  let shutdownDone = false;
  app.on('before-quit', (event) => {
    isQuitting = true;
    if (!shutdownDone && controller) {
      event.preventDefault();
      shutdownDone = true;
      void controller.shutdown().finally(() => {
        app.quit();
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      isQuitting = true;
      app.quit();
    }
  });
}

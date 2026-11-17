import { app, BrowserWindow, dialog, Menu, protocol, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_SCHEME, registerAppProtocol } from './protocol';
import { SettingsService } from './services/settingsService';
import { PrinterService } from './services/printerService';
import { PrintService } from './services/printService';
import { LifecycleService } from './services/lifecycleService';
import { registerIpcHandlers } from './ipc/handlers';
import { createMainWindow, createPrintWindow } from './window';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test-only: let automation use an isolated settings directory. This must run
// before the single-instance lock, which is keyed to userData, so a test run
// neither reads the real settings nor collides with an open Label Maker.
// Packaged builds ignore the variable.
if (!app.isPackaged && process.env.LABELMAKER_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.LABELMAKER_USER_DATA_DIR));
}

// Register standard custom scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

interface AppServices {
  settings: SettingsService;
  printers: PrinterService;
  print: PrintService;
  lifecycle: LifecycleService;
}

let services: AppServices | null = null;
let mainWindow: BrowserWindow | null = null;
let printWindow: BrowserWindow | null = null;

function installApplicationMenu(): void {
  if (process.platform === 'darwin') {
    // macOS routes Cmd+C/V/X/A, Cmd+W and Cmd+Q through the application menu.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
    );
  } else {
    Menu.setApplicationMenu(null);
  }
}

/**
 * Closing discards the label (v1 cannot reopen text), so ask first whenever
 * there is text, and warn if a job is still being handed to the spooler.
 * Returns true when the window may close.
 */
async function confirmClose(win: BrowserWindow, svc: AppServices): Promise<boolean> {
  const printing = svc.print.isBusy();
  const hasText = svc.lifecycle.labelHasText();
  if (!printing && !hasText) return true;

  const details: string[] = [];
  if (printing) {
    details.push(
      'A label is still being sent to the printer. If you close now the outcome may be unknown; check the printer queue before printing again.'
    );
  }
  if (hasText) {
    details.push('Label Maker does not save label text, so it cannot be reopened. Jobs already queued will still print.');
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Label Maker',
    message: 'Discard label and close?',
    detail: details.join('\n\n'),
    buttons: ['Keep editing', 'Discard label and close'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

function guardClose(win: BrowserWindow, svc: AppServices): void {
  let approved = false;
  let asking = false;

  win.on('close', (event) => {
    if (approved) return;
    event.preventDefault();
    if (asking) return;
    asking = true;

    void (async () => {
      try {
        if (!(await confirmClose(win, svc))) return;
        await svc.settings.flush().catch((error) => {
          console.warn('Could not flush settings while closing:', error);
        });
        approved = true;
        if (!win.isDestroyed()) win.close();
      } finally {
        asking = false;
      }
    })();
  });
}

function openWindows(): void {
  if (!services) return;
  const svc = services;

  const win = createMainWindow();
  const printWin = createPrintWindow();
  mainWindow = win;
  printWindow = printWin;

  svc.printers.setMainWindow(win);
  svc.print.setWindows(win, printWin);
  guardClose(win, svc);

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    if (!printWin.isDestroyed()) printWin.destroy();
    if (printWindow === printWin) printWindow = null;
  });
}

// One-time setup. Windows are created separately (and again on macOS
// "activate") so protocol and IPC handlers are never registered twice.
async function bootstrap() {
  installApplicationMenu();

  const distPath = path.join(__dirname, '../../dist');
  registerAppProtocol(distPath);

  const settings = new SettingsService();
  const printers = new PrinterService(settings);
  const print = new PrintService(printers);
  const lifecycle = new LifecycleService();
  services = { settings, printers, print, lifecycle };

  registerIpcHandlers(settings, printers, print, lifecycle);

  // Restrict session permissions: allow only local-fonts for trusted origin
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const isApp = url.startsWith('http://127.0.0.1:15174') || url.startsWith(`${APP_SCHEME}://app`);

    if ((permission as string) === 'local-fonts' && isApp) {
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (!webContents) return false;
    const url = webContents.getURL();
    const isApp = url.startsWith('http://127.0.0.1:15174') || url.startsWith(`${APP_SCHEME}://app`);

    return (permission as string) === 'local-fonts' && isApp;
  });

  openWindows();
}

// Single application instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: the dock icon reopens a fresh, empty draft once everything is closed.
  if (services && BrowserWindow.getAllWindows().length === 0) {
    openWindows();
  }
});

import { app, BrowserWindow, protocol, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_SCHEME, registerAppProtocol } from './protocol';
import { SettingsService } from './services/settingsService';
import { PrinterService } from './services/printerService';
import { PrintService } from './services/printService';
import { registerIpcHandlers } from './ipc/handlers';
import { createMainWindow, createPrintWindow } from './window';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Single application instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let printWindow: BrowserWindow | null = null;

async function bootstrap() {
  const distPath = path.join(__dirname, '../../dist');
  registerAppProtocol(distPath);

  const settingsService = new SettingsService();
  const printerService = new PrinterService(settingsService);
  const printService = new PrintService(printerService);

  registerIpcHandlers(settingsService, printerService, printService);

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

  mainWindow = createMainWindow();
  printWindow = createPrintWindow();

  printerService.setMainWindow(mainWindow);
  printService.setWindows(mainWindow, printWindow);

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy();
      printWindow = null;
    }
  });
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    bootstrap();
  }
});

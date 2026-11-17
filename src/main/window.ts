import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadPage(win: BrowserWindow, url: string): Promise<void> {
  try {
    await win.loadURL(url);
  } catch (error) {
    // Navigation errors (a blocked or failed load) are reported by did-fail-load too.
    console.error(`Could not load ${url}:`, error);
  }
}

export function createMainWindow(): BrowserWindow {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const preloadPath = path.join(__dirname, '../preload/index.cjs');
  const iconPath = isDev
    ? path.join(__dirname, '../../public/labelmaker-icon.png')
    : path.join(__dirname, '../../dist/labelmaker-icon.png');
  const splashPath = isDev
    ? path.join(__dirname, '../../public/splash.html')
    : path.join(__dirname, '../../dist/splash.html');

  const splash = new BrowserWindow({
    width: 460,
    height: 220,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#101b3c',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const splashShown = new Promise<void>((resolve) => {
    splash.once('ready-to-show', () => {
      if (!splash.isDestroyed()) splash.show();
      setTimeout(resolve, 500);
    });
    splash.webContents.once('did-fail-load', () => resolve());
  });
  void splash.loadFile(splashPath).catch((error) => {
    console.warn('Could not load splash screen:', error);
  });

  const win = new BrowserWindow({
    title: 'Label Maker',
    icon: iconPath,
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const showMainAndCloseSplash = () => {
    if (!win.isDestroyed()) win.show();
    if (!splash.isDestroyed()) splash.close();
  };

  win.once('ready-to-show', () => {
    void splashShown.then(showMainAndCloseSplash);
  });
  win.once('closed', () => {
    if (!splash.isDestroyed()) splash.close();
  });

  // The splash must never be left on screen with no way to close it: if the app
  // page fails to load (or never reports ready), show the window anyway.
  win.webContents.once('did-fail-load', showMainAndCloseSplash);
  const splashFailsafe = setTimeout(showMainAndCloseSplash, 20_000);
  win.once('show', () => clearTimeout(splashFailsafe));
  win.once('closed', () => clearTimeout(splashFailsafe));

  void loadPage(win, isDev ? process.env.VITE_DEV_SERVER_URL! : 'labelmaker://app/index.html');

  return win;
}

export function createPrintWindow(): BrowserWindow {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const preloadPath = path.join(__dirname, '../preload/print.cjs');

  const win = new BrowserWindow({
    title: 'Label Maker Print Engine',
    show: false,
    width: 400,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  void loadPage(win, isDev ? `${process.env.VITE_DEV_SERVER_URL}/print.html` : 'labelmaker://app/print.html');

  return win;
}

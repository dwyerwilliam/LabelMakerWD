import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  win.once('ready-to-show', () => {
    void splashShown.then(() => {
      if (!win.isDestroyed()) win.show();
      if (!splash.isDestroyed()) splash.close();
    });
  });
  win.once('closed', () => {
    if (!splash.isDestroyed()) splash.close();
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    win.loadURL('labelmaker://app/index.html');
  }

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

  if (isDev) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/print.html`);
  } else {
    win.loadURL('labelmaker://app/print.html');
  }

  return win;
}

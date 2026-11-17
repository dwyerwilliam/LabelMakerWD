import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMainWindow(): BrowserWindow {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const preloadPath = path.join(__dirname, '../preload/index.js');

  const win = new BrowserWindow({
    title: 'Label Maker',
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
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
  const preloadPath = path.join(__dirname, '../preload/print.js');

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

import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { isAppUrl } from '@shared/appOrigin';

type SenderEvent = Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender' | 'senderFrame'>;

/** Which of the app's own windows a message must come from. */
export type SenderRole = 'main' | 'print';

let mainContents: WebContents | null = null;
let printContents: WebContents | null = null;
let allowDevOrigin = false;

/** Records the windows that may talk to main. Called whenever the windows are (re)created. */
export function setTrustedWindows(main: BrowserWindow | null, print: BrowserWindow | null): void {
  mainContents = main ? main.webContents : null;
  printContents = print ? print.webContents : null;
}

/** The Vite dev origin is trusted only while developing; secure by default. */
export function configureTrust(options: { allowDevOrigin: boolean }): void {
  allowDevOrigin = options.allowDevOrigin;
}

/** Whether a page may be treated as the app itself (permission checks use this too). */
export function isTrustedUrl(url: string | undefined | null): boolean {
  return isAppUrl(url, allowDevOrigin);
}

/**
 * A message is trusted only if it comes from the expected window, from that
 * window's top frame, and from a page served by the app. A hidden print window
 * cannot call the editor's channels, and the editor cannot pose as the print window.
 */
export function isTrustedSender(event: SenderEvent, role: SenderRole = 'main'): boolean {
  const expected = role === 'main' ? mainContents : printContents;
  if (!expected || event.sender !== expected) return false;

  const frame = event.senderFrame;
  if (frame && frame.parent) return false;

  return isTrustedUrl(frame?.url || event.sender.getURL());
}

export function validateIpcSender(event: IpcMainInvokeEvent, role: SenderRole = 'main'): void {
  if (!isTrustedSender(event, role)) {
    throw new Error('Untrusted IPC sender');
  }
}

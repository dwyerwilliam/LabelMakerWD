import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { APP_SCHEME } from '../protocol';

export function isTrustedSender(sender: WebContents): boolean {
  const url = sender.getURL();
  if (!url) return false;

  // Development loopback origin
  if (url.startsWith('http://127.0.0.1:15174') || url.startsWith('http://localhost:15174')) {
    return true;
  }

  // Packaged custom scheme origin
  if (url.startsWith(`${APP_SCHEME}://app`)) {
    return true;
  }

  return false;
}

export function validateIpcSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event.sender)) {
    throw new Error(`Untrusted IPC sender origin: ${event.sender.getURL()}`);
  }
}

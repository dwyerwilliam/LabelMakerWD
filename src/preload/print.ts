import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/channels';
import type { LayoutFingerprint, PrintSnapshot } from '@shared/contracts';

export interface PrintWindowAPI {
  onJob: (callback: (snapshot: PrintSnapshot) => void) => () => void;
  reportReady: (requestId: string, fingerprint: LayoutFingerprint) => void;
}

const printApi: PrintWindowAPI = {
  onJob: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: PrintSnapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on(IPC_CHANNELS.PRINT_WINDOW_JOB, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PRINT_WINDOW_JOB, listener);
    };
  },
  reportReady: (requestId: string, fingerprint: LayoutFingerprint) => {
    ipcRenderer.send(IPC_CHANNELS.PRINT_WINDOW_READY, { requestId, fingerprint });
  },
};

contextBridge.exposeInMainWorld('printApi', printApi);

declare global {
  interface Window {
    printApi: PrintWindowAPI;
  }
}

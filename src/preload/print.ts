import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/channels';
import type { LayoutFingerprint, PrintSnapshot } from '@shared/contracts';

export interface PrintWindowAPI {
  /** A null job releases the previous label from the print document. */
  onJob: (callback: (snapshot: PrintSnapshot | null) => void) => () => void;
  reportReady: (requestId: string, fingerprint: LayoutFingerprint) => void;
  /** Tells main the print page is listening for jobs; main sends none before this. */
  reportListening: () => void;
}

const printApi: PrintWindowAPI = {
  onJob: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: PrintSnapshot | null) => {
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
  reportListening: () => {
    ipcRenderer.send(IPC_CHANNELS.PRINT_WINDOW_LISTENING);
  },
};

contextBridge.exposeInMainWorld('printApi', printApi);

declare global {
  interface Window {
    printApi: PrintWindowAPI;
  }
}

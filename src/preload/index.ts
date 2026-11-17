import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/channels';
import type {
  NormalizedQueue,
  PreferencesV1,
  PrintPrepareResult,
  PrintSnapshot,
  PrintStatusResult,
} from '@shared/contracts';
import type { Result } from '@shared/errors';

export interface ElectronAPI {
  preferences: {
    get: () => Promise<PreferencesV1>;
    update: (partial: Partial<PreferencesV1>) => Promise<void>;
    reset: () => Promise<PreferencesV1>;
  };
  printers: {
    scan: () => Promise<NormalizedQueue[]>;
    select: (deviceName: string, manualConfirm?: boolean) => Promise<NormalizedQueue | null>;
  };
  print: {
    prepare: (snapshot: PrintSnapshot) => Promise<PrintPrepareResult>;
    confirm: (token: string, requestId: string) => Promise<Result<void>>;
    cancel: (token: string) => Promise<void>;
    status: (requestId: string) => Promise<PrintStatusResult>;
    onStateEvent: (callback: (state: { requestId: string; state: string; detail?: string }) => void) => () => void;
  };
  app: {
    requestClose: () => Promise<boolean>;
  };
}

const api: ElectronAPI = {
  preferences: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_GET),
    update: (partial) => ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_UPDATE, partial),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_RESET),
  },
  printers: {
    scan: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_SCAN),
    select: (deviceName, manualConfirm = false) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_SELECT, { deviceName, manualConfirm }),
  },
  print: {
    prepare: (snapshot) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_PREPARE, { snapshot }),
    confirm: (token, requestId) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_CONFIRM, { token, requestId }),
    cancel: (token) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_CANCEL, { token }),
    status: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_STATUS, { requestId }),
    onStateEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: any) => {
        callback(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.PRINT_STATE_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PRINT_STATE_EVENT, listener);
      };
    },
  },
  app: {
    requestClose: () => ipcRenderer.invoke(IPC_CHANNELS.APP_REQUEST_CLOSE),
  },
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

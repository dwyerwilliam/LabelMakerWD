import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/channels';
import type {
  NormalizedQueue,
  PreferencesUpdate,
  PreferencesV2,
  PrinterProfile,
  PrintPrepareResult,
  PrintSnapshot,
  PrintStatusResult,
} from '@shared/contracts';
import type { Result } from '@shared/errors';

export interface ElectronAPI {
  preferences: {
    get: () => Promise<PreferencesV2>;
    update: (partial: PreferencesUpdate) => Promise<void>;
    reset: () => Promise<PreferencesV2>;
  };
  printers: {
    scan: () => Promise<NormalizedQueue[]>;
    select: (profile: PrinterProfile, deviceName: string, manualConfirm?: boolean) => Promise<NormalizedQueue | null>;
  };
  print: {
    prepare: (snapshot: PrintSnapshot) => Promise<PrintPrepareResult>;
    confirm: (token: string, requestId: string) => Promise<Result<void>>;
    cancel: (token: string) => Promise<void>;
    status: (requestId: string) => Promise<PrintStatusResult>;
    onStateEvent: (callback: (state: { requestId: string; state: string; detail?: string }) => void) => () => void;
  };
  app: {
    /** Tells main whether the label has text, so closing the window can ask first. */
    setLabelHasText: (hasText: boolean) => Promise<void>;
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
    select: (profile, deviceName, manualConfirm = false) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_SELECT, { profile, deviceName, manualConfirm }),
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
    setLabelHasText: (hasText) => ipcRenderer.invoke(IPC_CHANNELS.APP_SET_LABEL_HAS_TEXT, hasText),
  },
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

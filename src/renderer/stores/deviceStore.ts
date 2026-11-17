import { create } from 'zustand';
import type { NormalizedQueue, PreferencesV2, PrinterProfile } from '@shared/contracts';
import { selectQueueForProfile } from '@shared/printerSelection';

type SelectedQueues = Record<PrinterProfile, NormalizedQueue | null>;


export interface DeviceState {
  isScanning: boolean;
  queues: NormalizedQueue[];
  selectedQueues: SelectedQueues;
  error: string | null;

  setScanning: (scanning: boolean) => void;
  setQueues: (queues: NormalizedQueue[], preferences?: PreferencesV2) => void;
  selectQueue: (profile: PrinterProfile, deviceName: string) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  isScanning: false,
  queues: [],
  selectedQueues: { '4x6': null, '2x1': null },
  error: null,

  setScanning: (scanning) => set({ isScanning: scanning }),

  setQueues: (queues, preferences) => set({
    queues,
    selectedQueues: {
      '4x6': selectQueueForProfile(queues, '4x6', preferences?.profiles['4x6'].printer ?? null),
      '2x1': selectQueueForProfile(queues, '2x1', preferences?.profiles['2x1'].printer ?? null),
    },
  }),

  selectQueue: (profile, deviceName) => set((state) => ({
    selectedQueues: {
      ...state.selectedQueues,
      [profile]: state.queues.find((queue) => queue.deviceName === deviceName) || null,
    },
  })),

  setError: (error) => set({ error }),
}));

import { create } from 'zustand';
import type { NormalizedQueue } from '@shared/contracts';

export interface DeviceState {
  isScanning: boolean;
  queues: NormalizedQueue[];
  selectedQueue: NormalizedQueue | null;
  error: string | null;

  setScanning: (scanning: boolean) => void;
  setQueues: (queues: NormalizedQueue[]) => void;
  selectQueue: (deviceName: string) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  isScanning: false,
  queues: [],
  selectedQueue: null,
  error: null,

  setScanning: (scanning: boolean) => set({ isScanning: scanning }),

  setQueues: (queues: NormalizedQueue[]) => {
    const currentSelected = get().selectedQueue;
    let newSelected: NormalizedQueue | null = null;

    if (currentSelected) {
      newSelected = queues.find((q) => q.deviceName === currentSelected.deviceName) || null;
    }

    if (!newSelected) {
      // Pick the first eligible queue
      const eligible = queues.filter((q) => q.isEligibleSp410);
      newSelected = eligible.length > 0 ? eligible[0] : null;
    }

    set({
      queues,
      selectedQueue: newSelected,
    });
  },

  selectQueue: (deviceName: string) => {
    const queue = get().queues.find((q) => q.deviceName === deviceName) || null;
    set({ selectedQueue: queue });
  },

  setError: (error: string | null) => set({ error }),
}));

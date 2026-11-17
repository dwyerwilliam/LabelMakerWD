import { create } from 'zustand';
import type { NormalizedQueue, PreferencesV2, PrinterProfile } from '@shared/contracts';
import { resolveQueueSelection, type QueueSelection } from '@shared/printerSelection';

type SelectedQueues = Record<PrinterProfile, NormalizedQueue | null>;
type SavedProblems = Record<PrinterProfile, QueueSelection['savedProblem']>;


export interface DeviceState {
  isScanning: boolean;
  queues: NormalizedQueue[];
  selectedQueues: SelectedQueues;
  /** A printer the user chose earlier that is gone or unusable now, per profile. */
  savedProblems: SavedProblems;
  /** When the last scan finished (ms since epoch); 0 before the first one. */
  lastScanAt: number;
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
  savedProblems: { '4x6': null, '2x1': null },
  lastScanAt: 0,
  error: null,

  setScanning: (scanning) => set({ isScanning: scanning }),

  setQueues: (queues, preferences) => {
    const small = resolveQueueSelection(queues, '2x1', preferences?.profiles['2x1'].printer ?? null);
    const large = resolveQueueSelection(queues, '4x6', preferences?.profiles['4x6'].printer ?? null);
    set({
      queues,
      selectedQueues: { '4x6': large.queue, '2x1': small.queue },
      savedProblems: { '4x6': large.savedProblem, '2x1': small.savedProblem },
      lastScanAt: Date.now(),
    });
  },

  selectQueue: (profile, deviceName) => set((state) => ({
    selectedQueues: {
      ...state.selectedQueues,
      [profile]: state.queues.find((queue) => queue.deviceName === deviceName) || null,
    },
    // The user just chose a printer, which replaces any earlier choice.
    savedProblems: { ...state.savedProblems, [profile]: null },
  })),

  setError: (error) => set({ error }),
}));

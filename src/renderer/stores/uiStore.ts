import { create } from 'zustand';

export type DialogType =
  | 'none'
  | 'settings'
  | 'confirm-layout'
  | 'confirm-clip'
  | 'confirm-unavailable'
  | 'confirm-uncertain'
  | 'confirm-reset'
  | 'shipping-crop';

/** The inline message in the shipping-label view. */
export interface ShippingMessage {
  kind: 'error' | 'info';
  text: string;
}

export interface UIState {
  activeDialog: DialogType;
  fontSizeDraft: string;
  copiesDraft: string;
  isPrintBusy: boolean;
  printStatusText: string;
  /** The last job's outcome could not be confirmed; the next print asks the user to check the queue first. */
  printOutcomeUncertain: boolean;
  /** A message shown under the toolbar until the user dismisses it (for example, damaged settings). */
  notice: string | null;
  fontSearchQuery: string;
  fontPickerOpen: boolean;
  shippingMessage: ShippingMessage | null;
  /** A file is being dragged over the window. */
  dragActive: boolean;

  openDialog: (dialog: DialogType) => void;
  closeDialog: () => void;
  setFontSizeDraft: (val: string) => void;
  setCopiesDraft: (val: string) => void;
  setPrintBusy: (busy: boolean, statusText?: string) => void;
  /** Shows a message in the status bar and clears it after `ms`, unless something newer replaced it. */
  flashPrintStatus: (text: string, ms: number) => void;
  setPrintOutcomeUncertain: (uncertain: boolean) => void;
  setNotice: (notice: string | null) => void;
  setFontSearchQuery: (query: string) => void;
  setFontPickerOpen: (open: boolean) => void;
  setShippingMessage: (message: ShippingMessage | null) => void;
  setDragActive: (active: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  activeDialog: 'none',
  fontSizeDraft: '24',
  copiesDraft: '1',
  isPrintBusy: false,
  printStatusText: '',
  printOutcomeUncertain: false,
  notice: null,
  fontSearchQuery: '',
  fontPickerOpen: false,
  shippingMessage: null,
  dragActive: false,

  openDialog: (dialog: DialogType) => set({ activeDialog: dialog }),
  closeDialog: () => set({ activeDialog: 'none' }),
  setFontSizeDraft: (fontSizeDraft: string) => set({ fontSizeDraft }),
  setCopiesDraft: (copiesDraft: string) => set({ copiesDraft }),
  setPrintBusy: (isPrintBusy: boolean, printStatusText = '') =>
    set({ isPrintBusy, printStatusText }),
  flashPrintStatus: (text: string, ms: number) => {
    set({ isPrintBusy: false, printStatusText: text });
    setTimeout(() => {
      // Only clear our own message: an earlier timer must not wipe a later print's
      // status or its busy state.
      const state = get();
      if (!state.isPrintBusy && state.printStatusText === text) set({ printStatusText: '' });
    }, ms);
  },
  setPrintOutcomeUncertain: (printOutcomeUncertain: boolean) => set({ printOutcomeUncertain }),
  setNotice: (notice: string | null) => set({ notice }),
  setFontSearchQuery: (fontSearchQuery: string) => set({ fontSearchQuery }),
  setFontPickerOpen: (fontPickerOpen: boolean) => set({ fontPickerOpen }),
  setShippingMessage: (shippingMessage) => set({ shippingMessage }),
  setDragActive: (dragActive) => set({ dragActive }),
}));

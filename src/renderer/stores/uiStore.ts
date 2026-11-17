import { create } from 'zustand';

export type DialogType =
  | 'none'
  | 'settings'
  | 'confirm-clip'
  | 'confirm-offline'
  | 'confirm-reset';

export interface UIState {
  activeDialog: DialogType;
  fontSizeDraft: string;
  copiesDraft: string;
  isPrintBusy: boolean;
  printStatusText: string;
  fontSearchQuery: string;
  fontPickerOpen: boolean;

  openDialog: (dialog: DialogType) => void;
  closeDialog: () => void;
  setFontSizeDraft: (val: string) => void;
  setCopiesDraft: (val: string) => void;
  setPrintBusy: (busy: boolean, statusText?: string) => void;
  setFontSearchQuery: (query: string) => void;
  setFontPickerOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeDialog: 'none',
  fontSizeDraft: '24',
  copiesDraft: '1',
  isPrintBusy: false,
  printStatusText: '',
  fontSearchQuery: '',
  fontPickerOpen: false,

  openDialog: (dialog: DialogType) => set({ activeDialog: dialog }),
  closeDialog: () => set({ activeDialog: 'none' }),
  setFontSizeDraft: (fontSizeDraft: string) => set({ fontSizeDraft }),
  setCopiesDraft: (copiesDraft: string) => set({ copiesDraft }),
  setPrintBusy: (isPrintBusy: boolean, printStatusText = '') =>
    set({ isPrintBusy, printStatusText }),
  setFontSearchQuery: (fontSearchQuery: string) => set({ fontSearchQuery }),
  setFontPickerOpen: (fontPickerOpen: boolean) => set({ fontPickerOpen }),
}));

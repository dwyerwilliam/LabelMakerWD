import { create } from 'zustand';
import type { PreferencesV1 } from '@shared/contracts';
import { DEFAULT_PREFERENCES } from '@shared/defaults';

export interface PreferencesState {
  preferences: PreferencesV1;
  isHydrated: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  errorMessage: string | null;

  hydrate: (prefs: PreferencesV1) => void;
  update: (partial: Partial<PreferencesV1>) => void;
  reset: () => void;
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error', error?: string | null) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  isHydrated: false,
  saveStatus: 'idle',
  errorMessage: null,

  hydrate: (prefs: PreferencesV1) => {
    set({
      preferences: prefs,
      isHydrated: true,
      saveStatus: 'saved',
    });
  },

  update: (partial: Partial<PreferencesV1>) => {
    const updated: PreferencesV1 = {
      ...get().preferences,
      ...partial,
      schemaVersion: 1,
    };
    set({
      preferences: updated,
      saveStatus: 'saving',
    });
  },

  reset: () => {
    set({
      preferences: DEFAULT_PREFERENCES,
      saveStatus: 'saving',
    });
  },

  setSaveStatus: (status, error = null) => {
    set({
      saveStatus: status,
      errorMessage: error,
    });
  },
}));

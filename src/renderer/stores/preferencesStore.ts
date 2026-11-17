import { create } from 'zustand';
import type { PreferencesUpdate, PreferencesV2, PrinterProfile, ProfilePreferences } from '@shared/contracts';
import { createDefaultPreferences } from '@shared/defaults';

function updatePayload(preferences: PreferencesV2): PreferencesUpdate {
  return {
    activeProfile: preferences.activeProfile,
    profiles: preferences.profiles,
  };
}

export interface PreferencesState {
  preferences: PreferencesV2;
  isHydrated: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  errorMessage: string | null;

  hydrate: (prefs: PreferencesV2) => void;
  update: (partial: PreferencesUpdate) => void;
  updateProfile: (profile: PrinterProfile, partial: Partial<ProfilePreferences>) => void;
  /** Re-sends the current preferences after a failed save. */
  retrySave: () => void;
  reset: (prefs?: PreferencesV2) => void;
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error', error?: string | null) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const persist = (preferences: PreferencesV2) => {
    if (!window.api) return;
    set({ saveStatus: 'saving', errorMessage: null });
    void window.api.preferences.update(updatePayload(preferences)).then(
      () => set({ saveStatus: 'saved', errorMessage: null }),
      (error: unknown) => {
        console.warn('Saving preferences failed:', error);
        set({ saveStatus: 'error', errorMessage: "Changes apply now but couldn't be saved." });
      }
    );
  };

  return {
    preferences: createDefaultPreferences(),
    isHydrated: false,
    saveStatus: 'idle',
    errorMessage: null,

    hydrate: (prefs) => set({ preferences: prefs, isHydrated: true, saveStatus: 'saved', errorMessage: null }),

    update: (partial) => {
      const current = get().preferences;
      const next: PreferencesV2 = {
        ...current,
        ...partial,
        schemaVersion: 2,
        profiles: partial.profiles || current.profiles,
      };
      set({ preferences: next });
      persist(next);
    },

    updateProfile: (profile, partial) => {
      const current = get().preferences;
      const next: PreferencesV2 = {
        ...current,
        profiles: {
          ...current.profiles,
          [profile]: { ...current.profiles[profile], ...partial },
        },
      };
      set({ preferences: next });
      persist(next);
    },

    retrySave: () => persist(get().preferences),

    reset: (prefs = createDefaultPreferences()) => set({ preferences: prefs, saveStatus: 'saved', errorMessage: null }),

    setSaveStatus: (status, errorMessage = null) => set({ saveStatus: status, errorMessage }),
  };
});

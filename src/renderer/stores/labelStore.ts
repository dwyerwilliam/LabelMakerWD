import { create } from 'zustand';
import type {
  Alignment,
  LabelDraft,
  LayoutFingerprint,
  Orientation,
  PrinterProfile,
  ProfilePreferences,
  PreferencesV2,
} from '@shared/contracts';
import {
  createDefaultPreferences,
  MIN_FONT_SIZE_PT,
  MAX_FONT_SIZE_PT,
  MIN_COPIES,
  MAX_COPIES,
} from '@shared/defaults';

interface ProfileSettingsMap {
  '4x6': ProfilePreferences;
  '2x1': ProfilePreferences;
}

function cloneProfileSettings(preferences: PreferencesV2): ProfileSettingsMap {
  return {
    '4x6': { ...preferences.profiles['4x6'] },
    '2x1': { ...preferences.profiles['2x1'] },
  };
}

function makeDraft(
  profile: PrinterProfile,
  settings: ProfilePreferences,
  text = '',
  revision = 1,
  copies = 1
): LabelDraft {
  return {
    revision,
    text,
    profile,
    orientation: profile === '2x1' ? 'landscape' : settings.orientation,
    preferredFontFamily: settings.fontFamily,
    resolvedFontFamily: settings.fontFamily,
    fontSizePt: settings.fontSizePt,
    alignment: settings.alignment,
    copies,
  };
}

export interface LabelState {
  activeProfile: PrinterProfile;
  profileSettings: ProfileSettingsMap;
  draft: LabelDraft;
  layoutFingerprint: LayoutFingerprint | null;
  layoutFingerprintRevision: number | null;
  overflow: boolean;
  isFontReady: boolean;

  hydratePreferences: (preferences: PreferencesV2, preserveText?: boolean) => void;
  setActiveProfile: (profile: PrinterProfile) => void;
  setText: (text: string) => void;
  setOrientation: (orientation: Orientation) => void;
  setFontFamily: (family: string, resolved?: string) => void;
  setFontSize: (sizePt: number) => void;
  stepFontSize: (deltaPt: number) => void;
  setAlignment: (alignment: Alignment) => void;
  setCopies: (copies: number) => void;
  setLayoutFingerprint: (fingerprint: LayoutFingerprint, draftRevision: number) => void;
  setFontReady: (ready: boolean) => void;
  resetDraft: () => void;
}

const initialPreferences = createDefaultPreferences();

export const useLabelStore = create<LabelState>((set, get) => ({
  activeProfile: initialPreferences.activeProfile,
  profileSettings: cloneProfileSettings(initialPreferences),
  draft: makeDraft('4x6', initialPreferences.profiles['4x6']),
  layoutFingerprint: null,
  layoutFingerprintRevision: null,
  overflow: false,
  isFontReady: true,

  hydratePreferences: (preferences, preserveText = false) => {
    const current = get();
    const profile = preferences.activeProfile;
    const text = preserveText ? current.draft.text : '';
    set({
      activeProfile: profile,
      profileSettings: cloneProfileSettings(preferences),
      draft: makeDraft(
        profile,
        preferences.profiles[profile],
        text,
        current.draft.revision + 1,
        current.draft.copies
      ),
      layoutFingerprint: null,
      overflow: false,
    });
  },

  setActiveProfile: (profile) => {
    const current = get();
    if (current.activeProfile === profile) return;
    const settings = current.profileSettings[profile];
    set({
      activeProfile: profile,
      draft: makeDraft(profile, settings, current.draft.text, current.draft.revision + 1, current.draft.copies),
      layoutFingerprint: null,
      overflow: false,
      isFontReady: false,
    });
  },

  setText: (text: string) => {
    const current = get().draft;
    if (current.text === text) return;
    set({
      draft: {
        ...current,
        text,
        revision: current.revision + 1,
      },
    });
  },

  setOrientation: (orientation: Orientation) => {
    const state = get();
    if (state.activeProfile === '2x1') return;
    const current = state.draft;
    if (current.orientation === orientation) return;
    set({
      draft: { ...current, orientation, revision: current.revision + 1 },
      profileSettings: {
        ...state.profileSettings,
        '4x6': { ...state.profileSettings['4x6'], orientation },
      },
    });
  },

  setFontFamily: (family: string, resolved?: string) => {
    const state = get();
    set({
      draft: {
        ...state.draft,
        preferredFontFamily: family,
        resolvedFontFamily: resolved || family,
        revision: state.draft.revision + 1,
      },
      profileSettings: {
        ...state.profileSettings,
        [state.activeProfile]: { ...state.profileSettings[state.activeProfile], fontFamily: family },
      },
    });
  },

  setFontSize: (sizePt: number) => {
    const state = get();
    const clamped = Math.max(MIN_FONT_SIZE_PT, Math.min(MAX_FONT_SIZE_PT, Math.round(sizePt * 2) / 2));
    if (state.draft.fontSizePt === clamped) return;
    set({
      draft: { ...state.draft, fontSizePt: clamped, revision: state.draft.revision + 1 },
      profileSettings: {
        ...state.profileSettings,
        [state.activeProfile]: { ...state.profileSettings[state.activeProfile], fontSizePt: clamped },
      },
    });
  },

  stepFontSize: (deltaPt: number) => {
    get().setFontSize(get().draft.fontSizePt + deltaPt);
  },

  setAlignment: (alignment: Alignment) => {
    const state = get();
    if (state.draft.alignment === alignment) return;
    set({
      draft: { ...state.draft, alignment, revision: state.draft.revision + 1 },
      profileSettings: {
        ...state.profileSettings,
        [state.activeProfile]: { ...state.profileSettings[state.activeProfile], alignment },
      },
    });
  },

  setCopies: (copies: number) => {
    const clamped = Math.max(MIN_COPIES, Math.min(MAX_COPIES, Math.floor(copies)));
    set({ draft: { ...get().draft, copies: clamped } });
  },

  setLayoutFingerprint: (fingerprint, draftRevision) => set({
    layoutFingerprint: fingerprint,
    layoutFingerprintRevision: draftRevision,
    overflow: fingerprint.overflow,
  }),

  setFontReady: (ready) => set({ isFontReady: ready }),

  resetDraft: () => {
    const current = get();
    const defaults = createDefaultPreferences();
    set({
      activeProfile: '4x6',
      profileSettings: cloneProfileSettings(defaults),
      draft: makeDraft('4x6', defaults.profiles['4x6'], '', current.draft.revision + 1, 1),
      layoutFingerprint: null,
      overflow: false,
    });
  },
}));

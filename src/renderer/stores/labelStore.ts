import { create } from 'zustand';
import type { Alignment, LabelDraft, LayoutFingerprint, Orientation } from '@shared/contracts';
import {
  DEFAULT_PREFERENCES,
  MIN_FONT_SIZE_PT,
  MAX_FONT_SIZE_PT,
  MIN_COPIES,
  MAX_COPIES,
} from '@shared/defaults';

export interface LabelState {
  draft: LabelDraft;
  layoutFingerprint: LayoutFingerprint | null;
  overflow: boolean;
  isFontReady: boolean;

  setText: (text: string) => void;
  setOrientation: (orientation: Orientation) => void;
  setFontFamily: (family: string, resolved?: string) => void;
  setFontSize: (sizePt: number) => void;
  stepFontSize: (deltaPt: number) => void;
  setAlignment: (alignment: Alignment) => void;
  setCopies: (copies: number) => void;
  setLayoutFingerprint: (fingerprint: LayoutFingerprint) => void;
  setFontReady: (ready: boolean) => void;
  resetDraft: () => void;
}

export const useLabelStore = create<LabelState>((set, get) => ({
  draft: {
    revision: 1,
    text: '',
    orientation: DEFAULT_PREFERENCES.orientation,
    preferredFontFamily: DEFAULT_PREFERENCES.fontFamily,
    resolvedFontFamily: DEFAULT_PREFERENCES.fontFamily,
    fontSizePt: DEFAULT_PREFERENCES.fontSizePt,
    alignment: DEFAULT_PREFERENCES.alignment,
    copies: 1,
  },
  layoutFingerprint: null,
  overflow: false,
  isFontReady: true,

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
    const current = get().draft;
    if (current.orientation === orientation) return;
    set({
      draft: {
        ...current,
        orientation,
        revision: current.revision + 1,
      },
    });
  },

  setFontFamily: (family: string, resolved?: string) => {
    const current = get().draft;
    set({
      draft: {
        ...current,
        preferredFontFamily: family,
        resolvedFontFamily: resolved || family,
        revision: current.revision + 1,
      },
    });
  },

  setFontSize: (sizePt: number) => {
    const clamped = Math.max(MIN_FONT_SIZE_PT, Math.min(MAX_FONT_SIZE_PT, Math.round(sizePt * 2) / 2));
    const current = get().draft;
    if (current.fontSizePt === clamped) return;
    set({
      draft: {
        ...current,
        fontSizePt: clamped,
        revision: current.revision + 1,
      },
    });
  },

  stepFontSize: (deltaPt: number) => {
    const current = get().draft;
    const newSize = current.fontSizePt + deltaPt;
    get().setFontSize(newSize);
  },

  setAlignment: (alignment: Alignment) => {
    const current = get().draft;
    if (current.alignment === alignment) return;
    set({
      draft: {
        ...current,
        alignment,
        revision: current.revision + 1,
      },
    });
  },

  setCopies: (copies: number) => {
    const clamped = Math.max(MIN_COPIES, Math.min(MAX_COPIES, Math.floor(copies)));
    const current = get().draft;
    set({
      draft: {
        ...current,
        copies: clamped,
      },
    });
  },

  setLayoutFingerprint: (fingerprint: LayoutFingerprint) => {
    set({
      layoutFingerprint: fingerprint,
      overflow: fingerprint.overflow,
    });
  },

  setFontReady: (ready: boolean) => {
    set({ isFontReady: ready });
  },

  resetDraft: () => {
    const current = get().draft;
    set({
      draft: {
        ...current,
        text: '',
        orientation: DEFAULT_PREFERENCES.orientation,
        preferredFontFamily: DEFAULT_PREFERENCES.fontFamily,
        resolvedFontFamily: DEFAULT_PREFERENCES.fontFamily,
        fontSizePt: DEFAULT_PREFERENCES.fontSizePt,
        alignment: DEFAULT_PREFERENCES.alignment,
        copies: 1,
        revision: current.revision + 1,
      },
      layoutFingerprint: null,
      overflow: false,
    });
  },
}));

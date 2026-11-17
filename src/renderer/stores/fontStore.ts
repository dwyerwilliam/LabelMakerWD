import { create } from 'zustand';
import type { FontItem } from '@shared/contracts';
import { enumerateSystemFonts, type FontSource } from '../fonts/fontCatalog';

export interface FontState {
  fonts: FontItem[];
  source: FontSource;
  /** `idle` until the first list has been read. */
  status: 'idle' | 'loading' | 'ready';

  /** Reads the installed fonts (again). Overlapping calls share one read. */
  load: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useFontStore = create<FontState>((set) => ({
  fonts: [],
  source: 'system',
  status: 'idle',

  load: () => {
    if (inFlight) return inFlight;
    set({ status: 'loading' });
    inFlight = enumerateSystemFonts()
      .then(({ fonts, source }) => set({ fonts, source, status: 'ready' }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },
}));

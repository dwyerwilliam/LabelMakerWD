import type { FontItem } from '@shared/contracts';

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

/** Common families offered only when the system font list cannot be read; each is checked against what is really installed. */
const COMMON_FALLBACK_FONTS: string[] = [
  'Arial',
  'Calibri',
  'Cambria',
  'Consolas',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Console',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

/** Chromium's Local Font Access API; absent in browsers that do not have it. */
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontData[]>;
  }
}

export type FontSource = 'system' | 'fallback';

export interface FontCatalogResult {
  fonts: FontItem[];
  /** `system`: the real installed list. `fallback`: the list could not be read, so only common fonts that are installed are shown. */
  source: FontSource;
}

const SAMPLE = 'mmmmmmmmmmlli1WwQq';

/**
 * Whether a family is installed, found by comparing the width of a sample
 * against two generic families: an unknown family renders as the generic one.
 * (`document.fonts.check` is not usable here; it reports true for unknown names.)
 */
export function isFontInstalled(family: string): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;

    const widthWith = (fontFamily: string) => {
      context.font = `72px ${fontFamily}`;
      return context.measureText(SAMPLE).width;
    };
    const quoted = `"${family.replace(/"/g, '')}"`;
    const monospace = widthWith('monospace');
    const serif = widthWith('serif');
    return widthWith(`${quoted}, monospace`) !== monospace || widthWith(`${quoted}, serif`) !== serif;
  } catch {
    return false;
  }
}

function toItem(family: string): FontItem {
  return { family, fullName: family, postscriptName: family, style: 'Regular' };
}

export async function enumerateSystemFonts(): Promise<FontCatalogResult> {
  try {
    if (typeof window.queryLocalFonts === 'function') {
      const availableFonts = await window.queryLocalFonts();
      const uniqueFamilies = new Map<string, FontItem>();

      for (const font of availableFonts) {
        if (!uniqueFamilies.has(font.family)) {
          uniqueFamilies.set(font.family, {
            family: font.family,
            fullName: font.fullName || font.family,
            postscriptName: font.postscriptName || font.family,
            style: font.style || 'Regular',
          });
        }
      }

      const list = Array.from(uniqueFamilies.values()).sort((a, b) =>
        a.family.localeCompare(b.family, undefined, { sensitivity: 'base' })
      );

      if (list.length > 0) {
        return { fonts: list, source: 'system' };
      }
    }
  } catch (err) {
    console.warn('Local Font Access API unavailable or denied, using the installed common fonts instead:', err);
  }

  const installed = COMMON_FALLBACK_FONTS.filter(isFontInstalled).map(toItem);
  return {
    fonts: installed.sort((a, b) => a.family.localeCompare(b.family)),
    source: 'fallback',
  };
}

export async function ensureFontLoaded(family: string, sizePt: number, sampleText = 'A'): Promise<boolean> {
  try {
    const fontDesc = `${sizePt}pt "${family}"`;
    await document.fonts.load(fontDesc, sampleText);
    await document.fonts.ready;
    return document.fonts.check(fontDesc, sampleText);
  } catch (err) {
    console.warn(`Failed loading font ${family}:`, err);
    return false;
  }
}

export function resolveDefaultFont(availableFonts: FontItem[]): string {
  const find = (name: string) => availableFonts.find((f) => f.family.toLowerCase() === name.toLowerCase());

  // Arial if installed, otherwise the platform's usual sans-serif.
  const preferred = find('Arial') ?? find('Segoe UI') ?? find('Helvetica');
  if (preferred) return preferred.family;

  return availableFonts[0]?.family || 'sans-serif';
}

export interface FontResolution {
  /** The family the label is really laid out and printed with. */
  resolved: string;
  /** True when `resolved` is not the family the user asked for. */
  substituted: boolean;
}

/**
 * Decides which family to use for the user's preferred one. A family that is
 * not installed is replaced by the default and the caller says so; the user's
 * preference itself is left alone so it applies again when the font returns.
 */
export function resolveFontFamily(
  preferred: string,
  catalog: FontCatalogResult,
  isInstalled: (family: string) => boolean = isFontInstalled
): FontResolution {
  const listed = catalog.fonts.find((font) => font.family.toLowerCase() === preferred.toLowerCase());
  if (listed) return { resolved: listed.family, substituted: false };

  // The fallback list only holds common fonts, so an uncommon installed font still has to be checked directly.
  if (catalog.source === 'fallback' && isInstalled(preferred)) return { resolved: preferred, substituted: false };

  return { resolved: resolveDefaultFont(catalog.fonts), substituted: true };
}

import type { FontItem } from '@shared/contracts';

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

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

export async function enumerateSystemFonts(): Promise<FontItem[]> {
  try {
    if ('queryLocalFonts' in window && typeof (window as any).queryLocalFonts === 'function') {
      const availableFonts: FontData[] = await (window as any).queryLocalFonts();
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
        return list;
      }
    }
  } catch (err) {
    console.warn('Local Font Access API unavailable or denied, using system font list fallback:', err);
  }

  // Fallback: test common system fonts
  const results: FontItem[] = [];
  for (const family of COMMON_FALLBACK_FONTS) {
    results.push({
      family,
      fullName: family,
      postscriptName: family,
      style: 'Regular',
    });
  }

  return results.sort((a, b) => a.family.localeCompare(b.family));
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
  const hasArial = availableFonts.some((f) => f.family.toLowerCase() === 'arial');
  if (hasArial) {
    return 'Arial';
  }

  // Windows default
  const hasSegoe = availableFonts.some((f) => f.family.toLowerCase() === 'segoe ui');
  if (hasSegoe) {
    return 'Segoe UI';
  }

  // macOS default
  const hasHelvetica = availableFonts.some((f) => f.family.toLowerCase() === 'helvetica');
  if (hasHelvetica) {
    return 'Helvetica';
  }

  return availableFonts[0]?.family || 'sans-serif';
}

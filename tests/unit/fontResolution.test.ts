import { describe, it, expect } from 'vitest';
import type { FontItem } from '@shared/contracts';
import { resolveDefaultFont, resolveFontFamily } from '@renderer/fonts/fontCatalog';

const font = (family: string): FontItem => ({ family, fullName: family, postscriptName: family, style: 'Regular' });
const list = (...families: string[]) => families.map(font);

describe('resolveDefaultFont', () => {
  it('prefers Arial, then Segoe UI, then Helvetica, then the first font', () => {
    expect(resolveDefaultFont(list('Georgia', 'arial', 'Segoe UI'))).toBe('arial');
    expect(resolveDefaultFont(list('Georgia', 'Segoe UI', 'Helvetica'))).toBe('Segoe UI');
    expect(resolveDefaultFont(list('Georgia', 'Helvetica'))).toBe('Helvetica');
    expect(resolveDefaultFont(list('Georgia', 'Verdana'))).toBe('Georgia');
    expect(resolveDefaultFont([])).toBe('sans-serif');
  });
});

describe('resolveFontFamily', () => {
  const system = { fonts: list('Arial', 'Georgia', 'Verdana'), source: 'system' as const };

  it('uses an installed family, in the name the system reports (case-insensitive match)', () => {
    expect(resolveFontFamily('georgia', system)).toEqual({ resolved: 'Georgia', substituted: false });
  });

  it('replaces a family that is not installed with the default and says so', () => {
    expect(resolveFontFamily('Papyrus', system)).toEqual({ resolved: 'Arial', substituted: true });
  });

  it('trusts the system list: an unlisted family is missing even if a probe would claim otherwise', () => {
    expect(resolveFontFamily('Papyrus', system, () => true)).toEqual({ resolved: 'Arial', substituted: true });
  });

  it('with only the common-font fallback list, checks an unlisted family directly', () => {
    const fallback = { fonts: list('Arial', 'Verdana'), source: 'fallback' as const };
    expect(resolveFontFamily('Bahnschrift', fallback, (family) => family === 'Bahnschrift')).toEqual({
      resolved: 'Bahnschrift',
      substituted: false,
    });
    expect(resolveFontFamily('Papyrus', fallback, () => false)).toEqual({ resolved: 'Arial', substituted: true });
  });
});

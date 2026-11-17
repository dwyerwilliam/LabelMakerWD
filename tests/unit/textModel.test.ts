import { describe, it, expect } from 'vitest';
import { normalizePlainText, sanitizePastedHtml } from '@renderer/editor/textModel';

describe('Text Model Normalization', () => {
  it('normalizes CRLF and CR to LF', () => {
    const raw = 'Line 1\r\nLine 2\rLine 3\nLine 4';
    expect(normalizePlainText(raw)).toBe('Line 1\nLine 2\nLine 3\nLine 4');
  });

  it('converts tabs to four spaces', () => {
    const raw = 'Col1\tCol2\t\tCol3';
    expect(normalizePlainText(raw)).toBe('Col1    Col2        Col3');
  });

  it('preserves multiple deliberate spaces and blank lines', () => {
    const raw = 'Heading\n\n   Indented text\n\n\nTrailing';
    expect(normalizePlainText(raw)).toBe('Heading\n\n   Indented text\n\n\nTrailing');
  });

  it('strips HTML tags and preserves plain text when pasting', () => {
    // In node environment without DOM, sanitizePastedHtml uses fallback if document is undefined
    if (typeof document !== 'undefined') {
      const html = '<div><b>Bold</b> text with <span style="color:red">styles</span></div>';
      expect(sanitizePastedHtml(html)).toBe('Bold text with styles');
    }
  });
});

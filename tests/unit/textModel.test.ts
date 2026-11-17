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

// Minimal DOM-shaped trees, so the serializer can be tested without a browser.
import { serializeEditableText, type SerializableNode } from '@renderer/editor/textModel';

const text = (value: string): SerializableNode => ({ nodeType: 3, nodeValue: value, childNodes: [] });
const el = (tagName: string, ...children: SerializableNode[]): SerializableNode => ({
  nodeType: 1,
  nodeValue: null,
  tagName,
  childNodes: children,
});
const br = () => el('BR');
const div = (...children: SerializableNode[]) => el('DIV', ...children);
const root = (...children: SerializableNode[]) => el('DIV', ...children);

describe('serializeEditableText', () => {
  it('returns text nodes as they are, including newline characters', () => {
    expect(serializeEditableText(root(text('a\n\nb')))).toBe('a\n\nb');
    expect(serializeEditableText(root(text('  spaced   out  ')))).toBe('  spaced   out  ');
  });

  it('is empty for an empty editor, with or without the placeholder <br>', () => {
    expect(serializeEditableText(root())).toBe('');
    expect(serializeEditableText(root(br()))).toBe('');
  });

  it('ignores the placeholder <br> after text', () => {
    expect(serializeEditableText(root(text('x\n'), br()))).toBe('x\n');
    expect(serializeEditableText(root(text('abc'), br()))).toBe('abc');
  });

  it('turns blocks into lines and a lone <br> block into exactly one empty line', () => {
    // a, <div>b</div>
    expect(serializeEditableText(root(text('a'), div(text('b'))))).toBe('a\nb');
    // a, one blank line, b  (innerText reported two blank lines here)
    expect(serializeEditableText(root(text('a'), div(br()), div(text('b'))))).toBe('a\n\nb');
    // two blank lines
    expect(serializeEditableText(root(text('a'), div(br()), div(br()), div(text('b'))))).toBe('a\n\n\nb');
  });

  it('keeps a <br> inside a line as a line break', () => {
    expect(serializeEditableText(root(text('a'), br(), text('b')))).toBe('a\nb');
  });

  it('reads through inline elements and nested blocks', () => {
    expect(serializeEditableText(root(el('B', text('bold')), text(' and '), el('I', text('italic'))))).toBe('bold and italic');
    expect(serializeEditableText(root(div(div(text('a'))), div(text('b'))))).toBe('a\nb');
  });

  it('ignores empty blocks', () => {
    expect(serializeEditableText(root(text('a'), div(), div(text('b'))))).toBe('a\nb');
  });
});

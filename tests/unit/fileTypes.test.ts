import { describe, it, expect } from 'vitest';
import { ACCEPT_ATTRIBUTE, classifyFile } from '@renderer/shipping/fileTypes';

describe('classifyFile', () => {
  it('recognizes PDFs by MIME type or extension', () => {
    expect(classifyFile('label.pdf', 'application/pdf')).toBe('pdf');
    expect(classifyFile('LABEL.PDF', '')).toBe('pdf');
    expect(classifyFile('download', 'application/pdf')).toBe('pdf');
  });

  it('recognizes the supported image formats', () => {
    for (const [name, mime] of [
      ['a.png', 'image/png'],
      ['a.jpg', 'image/jpeg'],
      ['a.JPEG', ''],
      ['a.gif', 'image/gif'],
      ['a.bmp', 'image/bmp'],
      ['a.webp', 'image/webp'],
      ['', 'image/png'], // clipboard images may have no name
    ]) {
      expect(classifyFile(name, mime), `${name} ${mime}`).toBe('image');
    }
  });

  it('rejects everything else', () => {
    expect(classifyFile('notes.txt', 'text/plain')).toBeNull();
    expect(classifyFile('photo.tiff', 'image/tiff')).toBeNull();
    expect(classifyFile('vector.svg', 'image/svg+xml')).toBeNull();
    expect(classifyFile('archive.pdf.zip', 'application/zip')).toBeNull();
    expect(classifyFile('', '')).toBeNull();
  });

  it('offers PDFs and the supported images in the file dialog', () => {
    expect(ACCEPT_ATTRIBUTE.split(',')).toEqual(
      expect.arrayContaining(['application/pdf', '.pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'])
    );
  });
});

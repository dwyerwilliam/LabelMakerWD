/** The first 29 bytes of a PNG: signature, then an IHDR chunk for width × height. Enough for readPngDimensions. */
export function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(29);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR data length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([1, 0, 0, 0, 0], 24); // bit depth, color type, compression, filter, interlace
  return bytes;
}

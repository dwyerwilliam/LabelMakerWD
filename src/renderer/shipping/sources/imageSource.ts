/** Largest image side accepted, as a memory guard (a 12000 × 12000 bitmap is already ~576 MB). */
export const MAX_IMAGE_SIDE_PX = 12000;

/**
 * Decodes a pasted or opened image. Throws `Error('decode')` when the image cannot be read or is
 * too large; the caller turns that into the user-facing message.
 */
export async function loadImage(blob: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('decode');
  }
  if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_IMAGE_SIDE_PX || bitmap.height > MAX_IMAGE_SIDE_PX) {
    bitmap.close();
    throw new Error('decode');
  }
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

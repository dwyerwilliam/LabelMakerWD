export type SourceType = 'pdf' | 'image';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp']);
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];

/** What the file input offers in the system file dialog. */
export const ACCEPT_ATTRIBUTE = 'application/pdf,.pdf,image/png,image/jpeg,image/gif,image/bmp,image/webp';

/** Whether a file can be opened as a shipping label, judged by its MIME type or extension. */
export function classifyFile(name: string, mime: string): SourceType | null {
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase();
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (IMAGE_MIME_TYPES.has(lowerMime) || IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) return 'image';
  return null;
}

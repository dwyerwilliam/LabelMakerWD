import type { FracRect, Rotation } from '@shared/shipping';

export interface PdfHandle {
  pageCount: number;
  /** Page size in PDF points in displayed orientation (respects the page's /Rotate). pageIndex is 0-based. */
  pageSizePt(pageIndex: number): Promise<{ width: number; height: number }>;
  /** Renders the whole page at `dpi` onto a new canvas (white background). */
  renderPage(pageIndex: number, dpi: number): Promise<HTMLCanvasElement>;
  /** Renders `crop` of the page onto a new canvas of exactly outW × outH pixels (white background). */
  renderRegion(pageIndex: number, crop: FracRect, outW: number, outH: number): Promise<HTMLCanvasElement>;
  destroy(): Promise<void>;
}

export type LoadedSource =
  | { kind: 'image'; bitmap: ImageBitmap; width: number; height: number; origin: 'clipboard' | 'file'; fileName: string | null }
  | { kind: 'pdf'; pdf: PdfHandle; fileName: string };

export interface CropChoice { pageIndex: number; crop: FracRect; rotation: Rotation }

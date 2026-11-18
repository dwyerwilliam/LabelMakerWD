// Opens and renders shipping-label PDFs with pdf.js (6.x), entirely in the renderer.
// pdf.js itself is loaded lazily so text-only users never pay for it at startup.
// Label PDFs contain names and addresses: never log their bytes or contents.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { FracRect, Rotation } from '@shared/shipping';
import type { PdfHandle } from './types';

export class PdfLoadError extends Error {
  constructor(public readonly reason: 'password' | 'invalid' | 'empty', message: string) {
    super(message);
    this.name = 'PdfLoadError';
  }
}

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Text needed inside a crop before its direction is trusted, and how dominant one direction must be. */
const MIN_TEXT_CHARS = 10;
const DOMINANT_SHARE = 0.6;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
}

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

export async function loadPdf(bytes: Uint8Array): Promise<PdfHandle> {
  const pdfjs = await loadPdfJs();
  // pdf.js 6: keep the loading task; it (not the document) is what gets destroyed.
  const task = pdfjs.getDocument({
    data: bytes,
    disableAutoFetch: true,
    disableStream: true,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', document.baseURI).href,
    wasmUrl: new URL('pdfjs/wasm/', document.baseURI).href,
  });

  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    if ((error as { name?: unknown } | null)?.name === 'PasswordException') {
      throw new PdfLoadError('password', 'The PDF is password-protected.');
    }
    throw new PdfLoadError('invalid', 'The PDF could not be read.');
  }

  if (doc.numPages === 0) {
    await task.destroy().catch(() => undefined);
    throw new PdfLoadError('empty', 'The PDF has no pages.');
  }

  const getPage = (pageIndex: number) => {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.numPages) {
      throw new RangeError(`Page ${pageIndex + 1} does not exist.`);
    }
    return doc.getPage(pageIndex + 1);
  };

  return {
    pageCount: doc.numPages,

    async pageSizePt(pageIndex) {
      const page = await getPage(pageIndex);
      const vp = page.getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },

    async renderPage(pageIndex, dpi) {
      const page = await getPage(pageIndex);
      const vp = page.getViewport({ scale: dpi / 72 });
      const canvas = newCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      // pdf.js 6: pass `canvas` (not `canvasContext`); the background defaults to white.
      await page.render({ canvas, viewport: vp }).promise;
      page.cleanup();
      return canvas;
    },

    async renderRegion(pageIndex, crop: FracRect, outW, outH) {
      const page = await getPage(pageIndex);
      const base = page.getViewport({ scale: 1 });
      const scale = outW / (crop.width * base.width); // output px per PDF point
      const vp = page.getViewport({ scale });
      const canvas = newCanvas(outW, outH);
      await page.render({
        canvas,
        viewport: vp,
        transform: [1, 0, 0, 1, -crop.x * vp.width, -crop.y * vp.height],
      }).promise;
      page.cleanup();
      return canvas;
    },

    async textUprightRotation(pageIndex, crop) {
      const page = await getPage(pageIndex);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Characters per text direction, in display space (y down): 0 = left-to-right, 90 = reading
      // downward, 180 = upside down, 270 = reading upward.
      const weights = [0, 0, 0, 0];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        const m = pdfjs.Util.transform(vp.transform, item.transform) as number[];
        const x = m[4] / vp.width;
        const y = m[5] / vp.height;
        if (x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height) continue;
        const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
        weights[(((Math.round(angle / 90)) % 4) + 4) % 4] += item.str.trim().length;
      }
      page.cleanup();
      const total = weights.reduce((a, b) => a + b, 0);
      const best = weights.indexOf(Math.max(...weights));
      if (total < MIN_TEXT_CHARS || weights[best] < DOMINANT_SHARE * total) return null;
      // Text running at `best` quarter turns is made upright by the opposite turn.
      return (((4 - best) % 4) * 90) as Rotation;
    },

    destroy: () => task.destroy(),
  };
}

// The shipping label being prepared: its source (PDF or image), the accepted crop, and the
// processed 812 × 1218 image. See SHIPPING_LABEL_TECHNICAL_SPEC.md §9.3.
//
// Design rule: `source`, `choice` and `processed` change together, and only when a new image has
// been rendered successfully. A PDF waiting in the crop dialog lives in `cropDialog.source` until
// the user accepts it, so Cancel or a failure leaves the previous label exactly as it was.
//
// Shipping labels hold names and addresses: never log sources, images or their bytes.
import { create } from 'zustand';
import {
  addRotation,
  chooseRotation,
  FOUR_BY_SIX_PAGE_TOLERANCE_IN,
  MAX_REMEMBERED_CROPS,
  MAX_SOURCE_FILE_BYTES,
  REMEMBERED_CROP_TOLERANCE_PT,
  type Darkness,
} from '@shared/shipping';
import type { RememberedCrop } from '@shared/contracts';
import {
  ANALYSIS_DPI,
  contentArea,
  detectLabelRegion,
  peelUniformBorders,
  pxRectToFrac,
  toGray,
  type GrayImage,
} from '../shipping/analysis';
import { classifyFile } from '../shipping/fileTypes';
import { renderShippingLabel, releaseCanvas, type ProcessedShippingImage } from '../shipping/render';
import { loadImage } from '../shipping/sources/imageSource';
import { loadPdf, PdfLoadError } from '../shipping/sources/pdfSource';
import type { CropChoice, LoadedSource, PdfHandle } from '../shipping/sources/types';
import { selectEffectiveContentMode, useLabelStore } from './labelStore';
import { usePreferencesStore } from './preferencesStore';
import { useUIStore } from './uiStore';

export type ShippingBusy = null | 'reading' | 'detecting' | 'processing';

export interface CropDialogState {
  /** What the dialog shows: a newly loaded PDF, or the current source (Adjust crop). */
  source: LoadedSource;
  /** True when `source` is a new load that is not the current label yet: Cancel releases it. */
  isNewSource: boolean;
  /** The page, crop and rotation the dialog starts with. */
  initial: CropChoice;
  /** Status line text (FS §4.6), or null. */
  status: string | null;
}

export interface ShippingState {
  source: LoadedSource | null;
  choice: CropChoice | null;              // the accepted crop for `processed`
  processed: ProcessedShippingImage | null;
  busy: ShippingBusy;
  cropDialog: CropDialogState | null;

  loadBlob: (blob: Blob, fileName: string | null, origin: 'clipboard' | 'file') => Promise<void>;
  acceptCrop: (choice: CropChoice) => Promise<void>;
  cancelCrop: () => void;
  openAdjustCrop: () => void;
  rotate: (delta: 90 | -90) => Promise<void>;
  reprocess: () => Promise<void>;         // after a darkness change
  clear: () => void;
}

export const MESSAGES = {
  tooLarge: (name: string) => `${name} is too large (over 25 MB).`,
  unsupported: (name: string) => `Label Maker can't open ${name}. Use a PDF or an image (PNG, JPEG, GIF, BMP, WebP).`,
  unreadableImage: (name: string) => `${name} isn't a readable image.`,
  unreadableClipboard: "The clipboard image couldn't be read.",
  unreadablePdf: (name: string) => `${name} isn't a readable PDF.`,
  passwordPdf: (name: string) => `${name} is password-protected. Open it in a PDF viewer and take a screen snip instead.`,
  emptyPdf: (name: string) => `${name} has no pages.`,
  couldNotOpen: (name: string) => `${name} couldn't be opened.`,
  blank: 'This area is blank. Choose the part of the page with the label.',
  prepareFailed: "The label couldn't be prepared. Try again.",
  switchedTo4x6: 'Shipping labels print on the 4 × 6 printer.',
  remembered: 'Using the area you chose last time for this page size.',
  foundOnPage: (page: number) => `Found a label on page ${page}.`,
  notFound: "Couldn't find a 4 × 6 label on this page. Drag the box around the label.",
} as const;

// Only the newest load and the newest render may commit their results.
let loadSeq = 0;
let processSeq = 0;

function currentDarkness(): Darkness {
  return usePreferencesStore.getState().preferences.shippingLabel?.darkness ?? 3;
}

function rememberedCrops(): RememberedCrop[] {
  return usePreferencesStore.getState().preferences.shippingLabel?.rememberedCrops ?? [];
}

function samePageSize(crop: RememberedCrop, size: { width: number; height: number }): boolean {
  return (
    Math.abs(crop.pageWidthPt - size.width) <= REMEMBERED_CROP_TOLERANCE_PT &&
    Math.abs(crop.pageHeightPt - size.height) <= REMEMBERED_CROP_TOLERANCE_PT
  );
}

export function findRememberedCrop(size: { width: number; height: number }): RememberedCrop | null {
  return rememberedCrops().find((c) => samePageSize(c, size)) ?? null;
}

function releaseSource(source: LoadedSource | null | undefined): void {
  if (!source) return;
  if (source.kind === 'pdf') void source.pdf.destroy().catch(() => undefined);
  else source.bitmap.close();
}

/** Errors go where the user can see them: the shipping view, or the notice bar in Text mode. */
function report(kind: 'error' | 'info', text: string): void {
  const ui = useUIStore.getState();
  if (selectEffectiveContentMode(useLabelStore.getState()) === 'image') ui.setShippingMessage({ kind, text });
  else ui.setNotice(text);
}

/** Switches to the 4 × 6 tab in Shipping label mode (after a file was read successfully). */
function ensureShippingMode(): void {
  const prefs = usePreferencesStore.getState();
  let switchedProfile = false;
  if (useLabelStore.getState().activeProfile !== '4x6') {
    useLabelStore.getState().setActiveProfile('4x6');
    prefs.update({ activeProfile: '4x6' });
    switchedProfile = true;
  }
  if (useLabelStore.getState().contentMode !== 'image') {
    useLabelStore.getState().setContentMode('image');
    prefs.updateShipping({ mode4x6: 'image' });
  }
  if (switchedProfile) useUIStore.getState().setNotice(MESSAGES.switchedTo4x6);
}

function canvasToGray(canvas: HTMLCanvasElement): GrayImage {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return toGray(data, canvas.width, canvas.height);
}

function bitmapToGray(bitmap: ImageBitmap): GrayImage {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const gray = canvasToGray(canvas);
  releaseCanvas(canvas);
  return gray;
}

function isFourBySixPage(size: { width: number; height: number }): boolean {
  const short = Math.min(size.width, size.height) / 72;
  const long = Math.max(size.width, size.height) / 72;
  return Math.abs(short - 4) <= FOUR_BY_SIX_PAGE_TOLERANCE_IN && Math.abs(long - 6) <= FOUR_BY_SIX_PAGE_TOLERANCE_IN;
}

export interface CropSuggestion {
  choice: CropChoice;
  status: string | null;
}

/**
 * Suggests a crop for a PDF page: the remembered crop for its page size (when allowed), else
 * detection on this page (and, with `scanAhead`, up to 4 more pages), else the page's content area.
 * Used for the first suggestion, for page changes in the dialog, and for Auto-detect.
 */
export async function suggestCropForPdf(
  pdf: PdfHandle,
  pageIndex: number,
  options: { useRemembered: boolean; scanAhead: boolean }
): Promise<CropSuggestion> {
  if (options.useRemembered) {
    const size = await pdf.pageSizePt(pageIndex);
    const remembered = findRememberedCrop(size);
    if (remembered) {
      // The area is remembered; which way up is read from this PDF's text when it has any, so a
      // remembered turn (possibly saved by an older version, or for another carrier) cannot flip it.
      const crop = { ...remembered.rect };
      const textUpright = await pdf.textUprightRotation(pageIndex, crop);
      const rotation =
        textUpright === null
          ? remembered.rotation
          : chooseRotation(crop.width * size.width, crop.height * size.height, textUpright);
      return { choice: { pageIndex, crop, rotation }, status: MESSAGES.remembered };
    }
  }

  const lastPage = options.scanAhead ? Math.min(pdf.pageCount, pageIndex + 5) - 1 : pageIndex;
  let firstGray: GrayImage | null = null;
  for (let i = pageIndex; i <= lastPage; i++) {
    const canvas = await pdf.renderPage(i, ANALYSIS_DPI);
    const gray = canvasToGray(canvas);
    releaseCanvas(canvas);
    if (i === pageIndex) firstGray = gray;
    const rect = detectLabelRegion(gray, ANALYSIS_DPI);
    if (rect) {
      const crop = pxRectToFrac(rect, gray.width, gray.height);
      return {
        choice: { pageIndex: i, crop, rotation: chooseRotation(rect.width, rect.height, await pdf.textUprightRotation(i, crop)) },
        status: i === pageIndex ? null : MESSAGES.foundOnPage(i + 1),
      };
    }
  }

  const gray = firstGray!;
  const area = contentArea(gray, ANALYSIS_DPI);
  const crop = pxRectToFrac(area, gray.width, gray.height);
  return {
    choice: { pageIndex, crop, rotation: chooseRotation(area.width, area.height, await pdf.textUprightRotation(pageIndex, crop)) },
    status: MESSAGES.notFound,
  };
}

/** The image counterpart of suggestCropForPdf: the snip with its outer borders trimmed. */
export function suggestCropForImage(source: Extract<LoadedSource, { kind: 'image' }>): CropSuggestion {
  const r = peelUniformBorders(bitmapToGray(source.bitmap));
  return {
    choice: {
      pageIndex: 0,
      crop: pxRectToFrac(r, source.width, source.height),
      // Snips keep the clockwise default until it is known how they are usually taken.
      rotation: chooseRotation(r.width, r.height, null, 90),
    },
    status: null,
  };
}

/** The whole page (or image), turned the way its text says (PDF) or by its shape. */
export async function wholePageChoice(source: LoadedSource, pageIndex: number): Promise<CropChoice> {
  const crop = { x: 0, y: 0, width: 1, height: 1 };
  if (source.kind === 'image') {
    return { pageIndex: 0, crop, rotation: chooseRotation(source.width, source.height, null, 90) };
  }
  const size = await source.pdf.pageSizePt(pageIndex);
  return { pageIndex, crop, rotation: chooseRotation(size.width, size.height, await source.pdf.textUprightRotation(pageIndex, crop)) };
}

export const useShippingStore = create<ShippingState>((set, get) => {
  /** Makes `source` + `choice` + `processed` the current label and releases what they replace. */
  const commit = (source: LoadedSource, choice: CropChoice, processed: ProcessedShippingImage) => {
    const old = get();
    set({ source, choice, processed, busy: null });
    if (old.source && old.source !== source && old.source !== get().cropDialog?.source) releaseSource(old.source);
    if (old.processed && old.processed !== processed) URL.revokeObjectURL(old.processed.objectUrl);
    useLabelStore.getState().bumpRevision();
  };

  /** Renders and commits. Returns false when it failed or a newer render replaced it. */
  const process = async (source: LoadedSource, choice: CropChoice): Promise<boolean> => {
    const seq = ++processSeq;
    set({ busy: 'processing' });
    try {
      const result = await renderShippingLabel(source, choice, currentDarkness());
      if (seq !== processSeq) {
        URL.revokeObjectURL(result.objectUrl);
        return false;
      }
      commit(source, choice, result);
      const ui = useUIStore.getState();
      if (result.blank) report('error', MESSAGES.blank);
      else if (ui.shippingMessage?.text === MESSAGES.blank) ui.setShippingMessage(null);
      return true;
    } catch {
      if (seq === processSeq) {
        set({ busy: null });
        report('error', MESSAGES.prepareFailed);
      }
      return false;
    }
  };

  /** Releases a source that was created by a load but never became the current label. */
  const discardIfUnused = (source: LoadedSource | null) => {
    if (source && source !== get().source && source !== get().cropDialog?.source) releaseSource(source);
  };

  return {
    source: null,
    choice: null,
    processed: null,
    busy: null,
    cropDialog: null,

    loadBlob: async (blob, fileName, origin) => {
      const seq = ++loadSeq;
      const stale = () => seq !== loadSeq;
      useUIStore.getState().setShippingMessage(null);
      const name = fileName ?? 'The clipboard image';

      if (blob.size > MAX_SOURCE_FILE_BYTES) return report('error', MESSAGES.tooLarge(name));
      let type = classifyFile(fileName ?? '', blob.type);
      if (!type && origin === 'clipboard' && blob.type.startsWith('image/')) type = 'image';
      if (!type) return report('error', MESSAGES.unsupported(fileName ?? 'that file'));

      set({ busy: 'reading' });
      let created: LoadedSource | null = null;
      try {
        if (type === 'image') {
          let loaded: Awaited<ReturnType<typeof loadImage>>;
          try {
            loaded = await loadImage(blob);
          } catch {
            if (!stale()) {
              set({ busy: null });
              report('error', origin === 'clipboard' ? MESSAGES.unreadableClipboard : MESSAGES.unreadableImage(name));
            }
            return;
          }
          created = { kind: 'image', ...loaded, origin, fileName };
          if (stale()) return discardIfUnused(created);

          const { choice } = suggestCropForImage(created);
          ensureShippingMode();
          await process(created, choice);
          return discardIfUnused(created);
        }

        let pdf: PdfHandle;
        try {
          pdf = await loadPdf(new Uint8Array(await blob.arrayBuffer()));
        } catch (error) {
          if (!stale()) {
            set({ busy: null });
            const reason = error instanceof PdfLoadError ? error.reason : 'invalid';
            report(
              'error',
              reason === 'password' ? MESSAGES.passwordPdf(name) : reason === 'empty' ? MESSAGES.emptyPdf(name) : MESSAGES.unreadablePdf(name)
            );
          }
          return;
        }
        created = { kind: 'pdf', pdf, fileName: fileName ?? 'PDF' };
        if (stale()) return discardIfUnused(created);

        const size = await pdf.pageSizePt(0);
        if (isFourBySixPage(size)) {
          ensureShippingMode();
          const whole = { x: 0, y: 0, width: 1, height: 1 };
          await process(created, {
            pageIndex: 0,
            crop: whole,
            rotation: chooseRotation(size.width, size.height, await pdf.textUprightRotation(0, whole)),
          });
          return discardIfUnused(created);
        }

        set({ busy: 'detecting' });
        const suggestion = await suggestCropForPdf(pdf, 0, { useRemembered: true, scanAhead: true });
        if (stale()) return discardIfUnused(created);

        ensureShippingMode();
        set({
          busy: null,
          cropDialog: { source: created, isNewSource: true, initial: suggestion.choice, status: suggestion.status },
        });
        useUIStore.getState().openDialog('shipping-crop');
      } catch {
        if (!stale()) {
          set({ busy: null });
          report('error', MESSAGES.couldNotOpen(name));
        }
        discardIfUnused(created);
      }
    },

    acceptCrop: async (choice) => {
      const dialog = get().cropDialog;
      if (!dialog) return;
      useUIStore.getState().closeDialog();
      set({ cropDialog: null });

      const ok = await process(dialog.source, choice);
      if (!ok) {
        if (dialog.isNewSource) discardIfUnused(dialog.source);
        return;
      }
      if (dialog.source.kind !== 'pdf') return;

      const size = await dialog.source.pdf.pageSizePt(choice.pageIndex);
      const list = rememberedCrops().filter((c) => !samePageSize(c, size));
      list.unshift({ pageWidthPt: size.width, pageHeightPt: size.height, rect: { ...choice.crop }, rotation: choice.rotation });
      usePreferencesStore.getState().updateShipping({ rememberedCrops: list.slice(0, MAX_REMEMBERED_CROPS) });
    },

    cancelCrop: () => {
      const dialog = get().cropDialog;
      if (useUIStore.getState().activeDialog === 'shipping-crop') useUIStore.getState().closeDialog();
      set({ cropDialog: null });
      if (dialog?.isNewSource) discardIfUnused(dialog.source);
    },

    openAdjustCrop: () => {
      const { source, choice, busy } = get();
      if (!source || !choice || busy) return;
      set({ cropDialog: { source, isNewSource: false, initial: choice, status: null } });
      useUIStore.getState().openDialog('shipping-crop');
    },

    rotate: async (delta) => {
      const { source, choice } = get();
      if (!source || !choice) return;
      await process(source, { ...choice, rotation: addRotation(choice.rotation, delta) });
    },

    reprocess: async () => {
      const { source, choice } = get();
      if (!source || !choice) return;
      await process(source, choice);
    },

    clear: () => {
      ++loadSeq;
      ++processSeq;
      const { source, processed, cropDialog } = get();
      if (useUIStore.getState().activeDialog === 'shipping-crop') useUIStore.getState().closeDialog();
      set({ source: null, choice: null, processed: null, busy: null, cropDialog: null });
      releaseSource(source);
      if (cropDialog?.isNewSource && cropDialog.source !== source) releaseSource(cropDialog.source);
      if (processed) URL.revokeObjectURL(processed.objectUrl);
      useLabelStore.getState().bumpRevision();
      useUIStore.getState().setShippingMessage(null);
    },
  };
});

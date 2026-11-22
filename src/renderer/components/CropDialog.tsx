// "Choose the label area": the page with an editable crop box, page navigation, rotation,
// Auto-detect, Whole page, and a live 4 × 6 thumbnail of exactly what will print.
// See SHIPPING_LABEL_FUNCTIONAL_SPEC.md §4.6 and SHIPPING_LABEL_TECHNICAL_SPEC.md §11.5.
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { addRotation, fitToLabel, rotatedSize, SHIPPING_DPI, type FracRect, type Rotation } from '@shared/shipping';
import { ModalFrame } from './ModalFrame';
import { drawCrop, HANDLES, keyboardCrop, moveCrop, resizeCrop, type Handle } from '../shipping/cropGeometry';
import { releaseCanvas, renderPreviewThumbnail } from '../shipping/render';
import type { LoadedSource } from '../shipping/sources/types';
import { usePreferencesStore } from '../stores/preferencesStore';
import {
  MESSAGES,
  suggestCropForImage,
  suggestCropForPdf,
  useShippingStore,
  wholePageChoice,
  type CropDialogState,
} from '../stores/shippingStore';
import { useUIStore } from '../stores/uiStore';

const BUTTON =
  'rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

/** Where each handle sits on the box, as fractions of the box. */
const HANDLE_POS: Record<Handle, [number, number]> = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
};

type Drag =
  | { mode: 'move'; startX: number; startY: number; start: FracRect }
  | { mode: 'resize'; handle: Handle; startX: number; startY: number; start: FracRect }
  | { mode: 'draw'; startX: number; startY: number };

/** Size of the source in its own units: points for a PDF page, pixels for an image. */
async function sourceSize(source: LoadedSource, pageIndex: number): Promise<{ width: number; height: number }> {
  return source.kind === 'pdf' ? source.pdf.pageSizePt(pageIndex) : { width: source.width, height: source.height };
}

/** Draws the page (or image) `pixelWidth` pixels wide and returns it as an object URL. */
async function renderPageImage(source: LoadedSource, pageIndex: number, size: { width: number }, pixelWidth: number): Promise<string> {
  let canvas: HTMLCanvasElement;
  if (source.kind === 'pdf') {
    canvas = await source.pdf.renderPage(pageIndex, (72 * pixelWidth) / size.width);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(pixelWidth));
    canvas.height = Math.max(1, Math.round((pixelWidth * source.height) / source.width));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.bitmap, 0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  releaseCanvas(canvas);
  if (!blob) throw new Error('render');
  return URL.createObjectURL(blob);
}

export const CropDialog: React.FC = () => {
  const activeDialog = useUIStore((s) => s.activeDialog);
  const cropDialog = useShippingStore((s) => s.cropDialog);
  if (activeDialog !== 'shipping-crop' || !cropDialog) return null;
  // A new key per dialog session starts every opening from its own suggestion.
  return <CropDialogBody key={`${cropDialog.initial.pageIndex}:${JSON.stringify(cropDialog.initial.crop)}`} dialog={cropDialog} />;
};

const CropDialogBody: React.FC<{ dialog: CropDialogState }> = ({ dialog }) => {
  const { source } = dialog;
  const titleId = useId();
  const statusId = useId();
  const hintId = useId();
  const darkness = usePreferencesStore((s) => s.preferences.shippingLabel?.darkness ?? 3);

  const [pageIndex, setPageIndex] = useState(dialog.initial.pageIndex);
  const [crop, setCrop] = useState<FracRect>(dialog.initial.crop);
  const [rotation, setRotation] = useState<Rotation>(dialog.initial.rotation);
  const [status, setStatus] = useState<string | null>(dialog.status);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbBlank, setThumbBlank] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });

  const areaRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const renderedWidthRef = useRef<{ pageIndex: number; width: number } | null>(null);
  const actionSeq = useRef(0);
  const pageCount = source.kind === 'pdf' ? source.pdf.pageCount : 1;

  // Size available for the page.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const update = () => setArea({ width: el.clientWidth - 32, height: el.clientHeight - 32 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The page's own size, for this page.
  useEffect(() => {
    let cancelled = false;
    void sourceSize(source, pageIndex).then((size) => {
      if (!cancelled) setPageSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [source, pageIndex]);

  // Displayed size of the page: as large as fits.
  const displayWidth =
    pageSize && area.width > 0 && area.height > 0
      ? Math.floor(pageSize.width * Math.min(area.width / pageSize.width, area.height / pageSize.height))
      : 0;
  const displayHeight = pageSize && displayWidth > 0 ? Math.floor((displayWidth * pageSize.height) / pageSize.width) : 0;

  // Draw the page sharply: again on a page change, or when it has grown by more than 25%.
  useEffect(() => {
    if (!displayWidth || !pageSize) return;
    const wanted = displayWidth * (window.devicePixelRatio || 1);
    const last = renderedWidthRef.current;
    if (last && last.pageIndex === pageIndex && wanted <= last.width * 1.25) return;
    renderedWidthRef.current = { pageIndex, width: wanted };
    let cancelled = false;
    let finished = false;
    setPageError(null);
    renderPageImage(source, pageIndex, pageSize, wanted).then(
      (url) => {
        finished = true;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setPageUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      },
      () => {
        finished = true;
        if (!cancelled) setPageError(`Page ${pageIndex + 1} of ${source.kind === 'pdf' ? source.fileName : 'the image'} couldn't be displayed.`);
      }
    );
    return () => {
      cancelled = true;
      // A render cancelled before it finished must be able to run again.
      if (!finished) renderedWidthRef.current = null;
    };
  }, [displayWidth, pageSize, pageIndex, source]);

  // Live 4 × 6 thumbnail, 200 ms after the crop stops changing.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      renderPreviewThumbnail(source, { pageIndex, crop, rotation }, darkness).then(
        ({ canvas, blank }) => {
          if (cancelled) {
            releaseCanvas(canvas);
            return;
          }
          canvas.toBlob((blob) => {
            releaseCanvas(canvas);
            if (!blob || cancelled) return;
            const url = URL.createObjectURL(blob);
            setThumbUrl((old) => {
              if (old) URL.revokeObjectURL(old);
              return url;
            });
            setThumbBlank(blank);
          }, 'image/png');
        },
        () => {
          if (!cancelled) setThumbBlank(false);
        }
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, pageIndex, crop, rotation, darkness]);

  // Release the page image and thumbnail when the dialog closes.
  const urlsRef = useRef<{ page: string | null; thumb: string | null }>({ page: null, thumb: null });
  useEffect(() => {
    urlsRef.current = { page: pageUrl, thumb: thumbUrl };
  }, [pageUrl, thumbUrl]);
  useEffect(
    () => () => {
      if (urlsRef.current.page) URL.revokeObjectURL(urlsRef.current.page);
      if (urlsRef.current.thumb) URL.revokeObjectURL(urlsRef.current.thumb);
    },
    []
  );

  // Minimum box: 0.5 × 0.5 in on a PDF page, 40 × 40 px on an image.
  const minW = pageSize ? (source.kind === 'pdf' ? 36 : 40) / pageSize.width : 0.01;
  const minH = pageSize ? (source.kind === 'pdf' ? 36 : 40) / pageSize.height : 0.01;

  /** Runs a suggestion (page change, Auto-detect, Whole page); only the newest one is applied. */
  const applySuggestion = useCallback(
    async (work: () => Promise<{ pageIndex: number; crop: FracRect; rotation: Rotation; status: string | null }>) => {
      const seq = ++actionSeq.current;
      setBusy(true);
      try {
        const next = await work();
        if (seq !== actionSeq.current) return;
        setPageIndex(next.pageIndex);
        setCrop(next.crop);
        setRotation(next.rotation);
        setStatus(next.status);
      } catch {
        if (seq === actionSeq.current) setStatus("This page couldn't be displayed.");
      } finally {
        if (seq === actionSeq.current) setBusy(false);
      }
    },
    []
  );

  const goToPage = (next: number) => {
    if (source.kind !== 'pdf' || next < 0 || next >= pageCount) return;
    void applySuggestion(async () => {
      const s = await suggestCropForPdf(source.pdf, next, { useRemembered: true, scanAhead: false });
      return { ...s.choice, status: s.status };
    });
  };

  const autoDetect = () =>
    void applySuggestion(async () => {
      if (source.kind === 'image') return { ...suggestCropForImage(source).choice, status: null };
      const s = await suggestCropForPdf(source.pdf, pageIndex, { useRemembered: false, scanAhead: false });
      return { ...s.choice, status: s.status === MESSAGES.notFound ? s.status : null };
    });

  const wholePage = () => void applySuggestion(async () => ({ ...(await wholePageChoice(source, pageIndex)), status: null }));

  // Pointer interaction on the page: move, resize, or draw a new box.
  const pointerFraction = (e: React.PointerEvent) => {
    const rect = pageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !pageRef.current || busy) return;
    const p = pointerFraction(e);
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    if (handle) dragRef.current = { mode: 'resize', handle, startX: p.x, startY: p.y, start: crop };
    else if (target.closest('[data-testid="crop-box"]')) dragRef.current = { mode: 'move', startX: p.x, startY: p.y, start: crop };
    else dragRef.current = { mode: 'draw', startX: p.x, startY: p.y };
    pageRef.current.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = pointerFraction(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.mode === 'move') setCrop(moveCrop(drag.start, dx, dy));
    else if (drag.mode === 'resize') setCrop(resizeCrop(drag.start, drag.handle, dx, dy, minW, minH));
    else setCrop(drawCrop(drag.startX, drag.startY, p.x, p.y, minW, minH));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (pageRef.current?.hasPointerCapture(e.pointerId)) pageRef.current.releasePointerCapture(e.pointerId);
  };

  const onBoxKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = keyboardCrop(crop, e.key, e.shiftKey, minW, minH);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setCrop(next);
  };

  // Readout: the area's real size and how it will print.
  let readout = '';
  if (pageSize) {
    const cw = crop.width * pageSize.width;
    const ch = crop.height * pageSize.height;
    const { w, h } = rotatedSize(cw, ch, rotation);
    const fit = fitToLabel(w, h);
    readout =
      source.kind === 'pdf'
        ? `Label area ${(cw / 72).toFixed(2)} × ${(ch / 72).toFixed(2)} in · prints at ${Math.round((fit.scale / (SHIPPING_DPI / 72)) * 100)}%`
        : `Label area ${Math.round(cw)} × ${Math.round(ch)} px · about ${Math.round(w / (fit.width / SHIPPING_DPI))} dpi`;
  }

  const accept = () => void useShippingStore.getState().acceptCrop({ pageIndex, crop, rotation });
  const cancel = () => useShippingStore.getState().cancelCrop();
  const pct = (v: number) => `${v * 100}%`;

  return (
    <ModalFrame
      labelledBy={titleId}
      describedBy={status ? statusId : undefined}
      onEscape={cancel}
      className="flex h-[90vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl focus:outline-hidden dark:bg-slate-800"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-white">
          Choose the label area
        </h2>
        {status && (
          <p id={statusId} role="status" className="text-sm text-slate-700 dark:text-slate-300" data-testid="crop-status">
            {status}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={areaRef} className="relative flex min-w-0 flex-1 items-center justify-center bg-slate-200 dark:bg-slate-900">
          {displayWidth > 0 && (
            <div
              ref={pageRef}
              className="relative touch-none select-none bg-white shadow"
              style={{ width: displayWidth, height: displayHeight, cursor: 'crosshair' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              data-testid="crop-page"
            >
              {pageUrl && (
                <img
                  src={pageUrl}
                  alt={source.kind === 'pdf' ? `Page ${pageIndex + 1} of ${source.fileName}` : 'The pasted image'}
                  draggable={false}
                  className="pointer-events-none block h-full w-full"
                />
              )}
              {/* The page outside the box is dimmed. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/40" style={{ height: pct(crop.y) }} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/40" style={{ height: pct(1 - crop.y - crop.height) }} />
              <div className="pointer-events-none absolute left-0 bg-black/40" style={{ top: pct(crop.y), height: pct(crop.height), width: pct(crop.x) }} />
              <div
                className="pointer-events-none absolute right-0 bg-black/40"
                style={{ top: pct(crop.y), height: pct(crop.height), width: pct(1 - crop.x - crop.width) }}
              />

              <div
                data-testid="crop-box"
                data-crop={`${crop.x.toFixed(3)},${crop.y.toFixed(3)},${crop.width.toFixed(3)},${crop.height.toFixed(3)}`}
                role="group"
                aria-label="Label area"
                aria-describedby={hintId}
                tabIndex={0}
                onKeyDown={onBoxKeyDown}
                className="absolute border-2 border-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.width), height: pct(crop.height), cursor: 'move' }}
              >
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    data-handle={h}
                    aria-hidden="true"
                    className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-blue-600 bg-white"
                    style={{ left: pct(HANDLE_POS[h][0]), top: pct(HANDLE_POS[h][1]), cursor: HANDLE_CURSOR[h] }}
                  />
                ))}
              </div>
              <span id={hintId} className="sr-only">
                Arrow keys move the area. Shift and arrow keys resize it.
              </span>
            </div>
          )}
          {(busy || !pageUrl) && !pageError && (
            <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="sr-only">Finding the label…</span>
            </div>
          )}
          {pageError && (
            <p role="alert" className="absolute inset-x-0 top-4 text-center text-sm font-medium text-red-700 dark:text-red-300">
              {pageError}
            </p>
          )}
        </div>

        <aside className="flex w-52 shrink-0 flex-col items-center gap-3 overflow-y-auto border-l border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Prints as</p>
          <div className="flex h-[180px] w-[120px] shrink-0 items-center justify-center bg-white ring-1 ring-slate-300 dark:ring-slate-600">
            {thumbUrl && <img src={thumbUrl} alt="4 × 6 label preview" className="h-full w-full" data-testid="crop-thumbnail" />}
          </div>
          <p className="text-center text-xs text-slate-600 dark:text-slate-300" data-testid="crop-readout">
            {readout}
          </p>
          {thumbBlank && (
            <p
              role="alert"
              className="rounded-sm bg-amber-50 px-2.5 py-2 text-center text-xs font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
              data-testid="crop-blank-warning"
            >
              {MESSAGES.blank}
            </p>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        {pageCount > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" className={BUTTON} aria-label="Previous page" disabled={busy || pageIndex === 0} onClick={() => goToPage(pageIndex - 1)}>
              ‹
            </button>
            <span className="text-xs text-slate-700 dark:text-slate-200" data-testid="crop-page-number">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <button
              type="button"
              className={BUTTON}
              aria-label="Next page"
              disabled={busy || pageIndex === pageCount - 1}
              onClick={() => goToPage(pageIndex + 1)}
            >
              ›
            </button>
          </div>
        )}
        <button type="button" className={BUTTON} aria-label="Rotate left" title="Rotate left" disabled={busy} onClick={() => setRotation((r) => addRotation(r, -90))}>
          ⟲
        </button>
        <button type="button" className={BUTTON} aria-label="Rotate right" title="Rotate right" disabled={busy} onClick={() => setRotation((r) => addRotation(r, 90))}>
          ⟳
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={autoDetect}>
          Auto-detect
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={wholePage}>
          Whole page
        </button>
        <div className="flex-1" />
        <button type="button" className={BUTTON} onClick={cancel}>
          Cancel
        </button>
        <button
          type="button"
          data-autofocus
          disabled={busy}
          onClick={accept}
          className="rounded-sm bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Use this area
        </button>
      </div>
    </ModalFrame>
  );
};

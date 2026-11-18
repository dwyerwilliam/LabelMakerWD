import React, { useEffect, useRef, useState } from 'react';
import { calculateFitScale, getPageDimensions } from '../label/geometry';
import { useShippingActions } from '../hooks/useShippingInput';
import { useShippingStore } from '../stores/shippingStore';
import { useUIStore } from '../stores/uiStore';

const BUTTON =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

/** Shipping label mode's work area: drop zone, busy state, or the exact black-and-white preview. */
export const ShippingLabelView: React.FC = () => {
  const { openFilePicker, pasteFromSystemClipboard } = useShippingActions();
  const processed = useShippingStore((s) => s.processed);
  const busy = useShippingStore((s) => s.busy);
  const sourceKind = useShippingStore((s) => s.source?.kind ?? null);
  const message = useUIStore((s) => s.shippingMessage);
  const setMessage = useUIStore((s) => s.setShippingMessage);
  const dragActive = useUIStore((s) => s.dragActive);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const { widthPx, heightPx } = getPageDimensions('4x6', 'portrait'); // 384 × 576: 4 × 6 in at 96 px/in

  // Fit the 4 × 6 sheet to the window, like the text preview.
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setScale(calculateFitScale(rect.width, rect.height, '4x6', 'portrait', 48));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const busyText =
    busy === 'detecting' ? 'Finding the label…' : busy === 'reading' && sourceKind !== 'image' ? 'Reading PDF…' : 'Preparing label…';

  const warnings: string[] = [];
  if (processed?.lowResolution) {
    warnings.push(
      `Low-resolution snip (about ${processed.effectiveDpi} dpi). Barcodes may not scan. For a sharper label, zoom the PDF to 200% before snipping, or drop the PDF file instead.`
    );
  }
  if (processed?.offAspect) {
    warnings.push("This doesn't look like a 4 × 6 label. It will print centered with white space around it. Use Adjust crop to fix the area.");
  }
  if (processed?.offScale) {
    warnings.push(`This label prints at ${processed.scalePercent}% of its original size. Check that the crop includes only the label.`);
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950" data-testid="shipping-view">
      <div ref={containerRef} className="flex flex-1 items-center justify-center overflow-hidden p-6">
        <div
          style={{
            width: `${widthPx}px`,
            height: `${heightPx}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
          }}
          className="relative"
        >
          {processed ? (
            <div className="h-full w-full bg-white shadow-lg ring-1 ring-slate-300 dark:ring-slate-600">
              <img
                src={processed.objectUrl}
                alt="Shipping label preview"
                width={widthPx}
                height={heightPx}
                className="block h-full w-full"
                // The 812 × 1218 label is usually shown smaller than its dots. Smooth scaling keeps thin
                // lines and small text visible; nearest-neighbour (pixelated) dropped them. Print is unaffected.
                style={{ imageRendering: 'auto' }}
                data-testid="shipping-preview"
              />
            </div>
          ) : busy ? null : (
            <div
              className={`flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
              }`}
              data-testid="shipping-dropzone"
            >
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Paste a screen snip or drop a label PDF here</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Ctrl+V to paste (⌘V on Mac) · PDF, PNG, JPEG, GIF, BMP, WebP
              </p>
              <div className="mt-1 flex gap-2">
                <button type="button" className={BUTTON} onClick={() => void pasteFromSystemClipboard()}>
                  Paste
                </button>
                <button type="button" className={BUTTON} onClick={openFilePicker}>
                  Open file…
                </button>
              </div>
            </div>
          )}

          {busy && (
            <div
              role="status"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 text-sm font-medium text-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
            >
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span>{busyText}</span>
            </div>
          )}
        </div>
      </div>

      {(processed || message) && (
        <div className="flex flex-col items-center gap-1.5 px-6 pb-4 text-center text-xs">
          {processed && (
            <p className="text-slate-600 dark:text-slate-300" data-testid="shipping-caption">
              {processed.caption}
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} className="max-w-xl font-medium text-amber-800 dark:text-amber-300" data-testid="shipping-warning">
              {w}
            </p>
          ))}
          {message && (
            <div
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={`flex max-w-xl items-center gap-3 rounded-md px-3 py-1.5 font-medium ${
                message.kind === 'error'
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                  : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
              }`}
              data-testid="shipping-message"
            >
              <span>{message.text}</span>
              <button type="button" onClick={() => setMessage(null)} className="font-semibold underline hover:no-underline">
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import type { PrintSnapshot } from '@shared/contracts';
import { LabelSurface } from '../label/LabelSurface';
import { measureLayoutFingerprint } from '../label/layout';
import { ensureFontLoaded } from '../fonts/fontCatalog';
import { getPageDimensions } from '../label/geometry';
import { SP310_OUTPUT_HEIGHT_IN, SP310_OUTPUT_WIDTH_IN } from '@shared/defaults';

export const PrintDocument: React.FC = () => {
  const [snapshot, setSnapshot] = useState<PrintSnapshot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.printApi) return;

    const unsubscribe = window.printApi.onJob(setSnapshot);

    // Main waits for this before sending the first job; a job sent while the
    // page was still loading would be lost.
    window.printApi.reportListening();

    return unsubscribe;
  }, []);

  // Measure only after React has drawn THIS job's label. Measuring from the job callback
  // could run before the page was updated and report the label shown before it, which decides
  // whether the user is asked about a clipped label.
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;

    void (async () => {
      // Ensure the font is fully loaded in this window
      await ensureFontLoaded(snapshot.resolvedFontFamily, snapshot.fontSizePt, snapshot.text || 'A');

      // Wait for the next animation frame so the browser has finished laying the page out
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const container = containerRef.current;
      if (cancelled || !container) return;

      const fingerprint = measureLayoutFingerprint(
        container,
        snapshot.profile,
        snapshot.orientation,
        snapshot.profile === '4x6' && snapshot.orientation === 'landscape'
      );
      window.printApi.reportReady(snapshot.requestId, fingerprint);
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  if (!snapshot) {
    return <div className="text-gray-400 p-4">Awaiting print snapshot...</div>;
  }

  const isSmallProfile = snapshot.profile === '2x1';
  const printWidthPx = isSmallProfile ? getPageDimensions('2x1').widthPx : 384;
  const printHeightPx = isSmallProfile ? getPageDimensions('2x1').heightPx : 576;
  const printWidthIn = isSmallProfile ? SP310_OUTPUT_WIDTH_IN : 4;
  const printHeightIn = isSmallProfile ? SP310_OUTPUT_HEIGHT_IN : 6;

  return (
    <>
      <style>{`@page { size: ${printWidthIn}in ${printHeightIn}in; margin: 0; } @media print { html, body { width: ${printWidthPx}px !important; height: ${printHeightPx}px !important; } }`}</style>
      <div
        className={`print-page print-page-${snapshot.profile}`}
        style={{ width: `${printWidthPx}px`, height: `${printHeightPx}px`, overflow: 'hidden' }}
      >
        <LabelSurface
          ref={containerRef}
          text={snapshot.text}
          profile={snapshot.profile}
          orientation={snapshot.orientation}
          fontFamily={snapshot.resolvedFontFamily}
          fontSizePt={snapshot.fontSizePt}
          alignment={snapshot.alignment}
          isPrintMode={true}
          overflow={snapshot.expectedLayout.overflow}
        />
      </div>
    </>
  );
};

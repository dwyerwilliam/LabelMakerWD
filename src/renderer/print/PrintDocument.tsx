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

    const unsubscribe = window.printApi.onJob((job) => {
      setSnapshot(job);

      void (async () => {
        // Ensure the font is fully loaded in this window
        await ensureFontLoaded(job.resolvedFontFamily, job.fontSizePt, job.text || 'A');

        // Request next animation frame to ensure browser layout has completed
        requestAnimationFrame(() => {
          if (containerRef.current) {
            const fingerprint = measureLayoutFingerprint(
              containerRef.current,
              job.profile,
              job.orientation,
              job.profile === '4x6' && job.orientation === 'landscape'
            );
            window.printApi.reportReady(job.requestId, fingerprint);
          }
        });
      })();
    });

    // Main waits for this before sending the first job; a job sent while the
    // page was still loading would be lost.
    window.printApi.reportListening();

    return unsubscribe;
  }, []);

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

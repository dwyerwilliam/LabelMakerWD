import React, { useEffect, useRef, useState } from 'react';
import type { PrintSnapshot } from '@shared/contracts';
import { LabelSurface } from '../label/LabelSurface';
import { measureLayoutFingerprint } from '../label/layout';
import { ensureFontLoaded } from '../fonts/fontCatalog';

export const PrintDocument: React.FC = () => {
  const [snapshot, setSnapshot] = useState<PrintSnapshot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.printApi) return;

    const unsubscribe = window.printApi.onJob(async (job) => {
      setSnapshot(job);

      // Ensure the font is fully loaded in this window
      await ensureFontLoaded(job.resolvedFontFamily, job.fontSizePt, job.text || 'A');

      // Request next animation frame to ensure browser layout has completed
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const fingerprint = measureLayoutFingerprint(containerRef.current, job.orientation);
          window.printApi.reportReady(job.requestId, fingerprint);
        }
      });
    });

    return unsubscribe;
  }, []);

  if (!snapshot) {
    return <div className="text-gray-400 p-4">Awaiting print snapshot...</div>;
  }

  return (
    <div style={{ width: '384px', height: '576px', overflow: 'hidden' }}>
      <LabelSurface
        ref={containerRef}
        text={snapshot.text}
        orientation={snapshot.orientation}
        fontFamily={snapshot.resolvedFontFamily}
        fontSizePt={snapshot.fontSizePt}
        alignment={snapshot.alignment}
        isPrintMode={true}
        overflow={snapshot.expectedLayout.overflow}
      />
    </div>
  );
};

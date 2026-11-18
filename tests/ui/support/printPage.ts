import type { Page } from '@playwright/test';

// Helpers for driving the hidden print window's page (print.html) in a browser, the way the
// main process does: it sends one job and the page reports back the layout it measured.

export interface ReportedLayout {
  logicalWidthPt: number;
  logicalHeightPt: number;
  lineRectsPt: Array<{ x: number; y: number; width: number; height: number }>;
  lineTextOffsets: number[];
  overflow: boolean;
}

export interface TestJob {
  requestId: string;
  draftRevision: number;
  contentKind: 'text' | 'image';
  text: string;
  profile: '4x6' | '2x1';
  orientation: 'portrait' | 'landscape';
  resolvedFontFamily: string;
  fontSizePt: number;
  alignment: 'left' | 'center' | 'right';
  copies: number;
  expectedLayout: ReportedLayout;
  image?: { pngBase64: string; widthPx: 812; heightPx: 1218 };
}

let jobNumber = 0;

export function makeJob(
  profile: TestJob['profile'],
  orientation: TestJob['orientation'],
  text: string,
  options: { fontSizePt?: number; fontFamily?: string; alignment?: TestJob['alignment']; expectedLayout?: ReportedLayout } = {}
): TestJob {
  jobNumber += 1;
  return {
    requestId: `00000000-0000-4000-8000-${String(jobNumber).padStart(12, '0')}`,
    draftRevision: jobNumber,
    contentKind: 'text',
    text,
    profile,
    orientation,
    resolvedFontFamily: options.fontFamily ?? 'Arial',
    fontSizePt: options.fontSizePt ?? 24,
    alignment: options.alignment ?? 'left',
    copies: 1,
    expectedLayout: options.expectedLayout ?? { logicalWidthPt: 0, logicalHeightPt: 0, lineRectsPt: [], lineTextOffsets: [], overflow: false },
  };
}

/** Replaces the preload bridge of the print page with one the test can drive. Call before `page.goto('/print.html')`. */
export async function installPrintApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.printApi = {
      onJob: (callback: unknown) => {
        w.__onJob = callback;
        return () => {};
      },
      reportReady: (_requestId: string, fingerprint: unknown) => {
        (w.__reportResolve as ((value: unknown) => void) | undefined)?.(fingerprint);
      },
      reportListening: () => {},
    };
  });
}

/** Sends a job to the print page and returns the layout the page reports for it. */
export async function sendJob(page: Page, job: TestJob): Promise<ReportedLayout> {
  return page.evaluate(
    (j) =>
      new Promise<ReportedLayout>((resolve) => {
        const w = window as unknown as Record<string, unknown>;
        w.__reportResolve = resolve;
        (w.__onJob as (x: unknown) => void)(j);
      }),
    job
  );
}

/** A shipping-label job for a PNG (base64) of an 812 × 1218 label. */
export function makeImageJob(pngBase64: string): TestJob {
  return {
    ...makeJob('4x6', 'portrait', ''),
    contentKind: 'image',
    expectedLayout: { logicalWidthPt: 288, logicalHeightPt: 432, lineRectsPt: [], lineTextOffsets: [], overflow: false },
    image: { pngBase64, widthPx: 812, heightPx: 1218 },
  };
}

/** An 812 × 1218 black-and-white PNG (base64) drawn in the page. */
export async function makeLabelPng(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 812;
    c.height = 1218;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 812, 1218);
    ctx.fillStyle = '#000';
    for (let x = 100; x < 700; x += 12) ctx.fillRect(x, 800, 6, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
}

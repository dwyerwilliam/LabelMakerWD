import { test, expect, type ElectronApplication } from '@playwright/test';
import { IPC_CHANNELS } from '../../src/shared/channels';
import { launchApp, makeUserDataDir, removeUserDataDir } from './support/app';

// What the hidden print window hands to the printer driver, checked without a printer:
// the label is rendered into the real print document and exported with the same page
// rules, then the PDF is inspected. This covers page size, "one page per label" and the
// direction of the 4 x 6 landscape rotation. Whether paper comes out correctly still
// needs the physical printers.

let userDataDir: string;
test.beforeEach(() => {
  userDataDir = makeUserDataDir();
});
test.afterEach(() => removeUserDataDir(userDataDir));

interface Snapshot {
  text: string;
  profile: '4x6' | '2x1';
  orientation: 'portrait' | 'landscape';
  fontSizePt: number;
  alignment?: 'left' | 'center' | 'right';
}

interface Rendered {
  pages: number;
  mediaBox: number[];
  chars: Array<{ x: number; y: number }>;
  page: { width: number; height: number };
}

async function renderInPrintWindow(app: ElectronApplication, snapshot: Snapshot): Promise<Rendered> {
  const job = {
    requestId: '00000000-0000-4000-8000-000000000000',
    draftRevision: 1,
    contentKind: 'text',
    resolvedFontFamily: 'Arial',
    alignment: 'left',
    copies: 1,
    expectedLayout: { logicalWidthPt: 0, logicalHeightPt: 0, lineRectsPt: [], lineTextOffsets: [], overflow: false },
    ...snapshot,
  };

  const result = await app.evaluate(
    async ({ BrowserWindow }, { channel, job }) => {
      const printWindow = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('print.html'))!;
      // Wait for the label to be laid out in the print window. The print page may still be
      // starting (the app waits for its own 'listening' signal), so the job is sent again
      // until the page has taken it.
      const ready = `(() => {
        const box = document.querySelector('.label-text-container');
        return !!box && document.fonts.status === 'loaded' && box.textContent === ${JSON.stringify(job.text)};
      })()`;
      for (let i = 0; i < 100; i++) {
        if (i % 5 === 0) printWindow.webContents.send(channel, job);
        if (await printWindow.webContents.executeJavaScript(ready)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Where each character sits on the page, and the page itself.
      const geometry = await printWindow.webContents.executeJavaScript(`(() => {
        const box = document.querySelector('.label-text-container');
        const node = box.firstChild;
        const range = document.createRange();
        const chars = [];
        for (let i = 0; i < node.textContent.length; i++) {
          if (node.textContent[i].trim() === '') continue;
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          chars.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }
        const page = document.querySelector('.print-page').getBoundingClientRect();
        return { chars, page: { width: page.width, height: page.height } };
      })()`);

      const pdf = await printWindow.webContents.printToPDF({
        preferCSSPageSize: true,
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      return { pdf: pdf.toString('latin1'), ...geometry };
    },
    { channel: IPC_CHANNELS.PRINT_WINDOW_JOB, job }
  );

  const pages = (result.pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const box = /\/MediaBox\s*\[\s*([\d.\s-]+?)\s*\]/.exec(result.pdf);
  return {
    pages,
    mediaBox: box ? box[1].trim().split(/\s+/).map(Number) : [],
    chars: result.chars,
    page: result.page,
  };
}

const widthPt = (r: Rendered) => r.mediaBox[2] - r.mediaBox[0];
const heightPt = (r: Rendered) => r.mediaBox[3] - r.mediaBox[1];

test('every profile and orientation produces exactly one page of the right size', async () => {
  const { app } = await launchApp(userDataDir);
  try {
    const cases: Array<[string, Snapshot, number, number]> = [
      ['4 × 6 portrait', { text: 'ABCDEFGH', profile: '4x6', orientation: 'portrait', fontSizePt: 24 }, 288, 432],
      // Landscape is composed sideways on the same portrait stock.
      ['4 × 6 landscape', { text: 'ABCDEFGH', profile: '4x6', orientation: 'landscape', fontSizePt: 24 }, 288, 432],
      ['2 × 1 (DYMO 30334)', { text: 'ABCDEFGH', profile: '2x1', orientation: 'landscape', fontSizePt: 12 }, 162, 90],
    ];

    for (const [name, snapshot, width, height] of cases) {
      const rendered = await renderInPrintWindow(app, snapshot);
      expect(rendered.pages, `${name}: pages`).toBe(1);
      expect(Math.round(widthPt(rendered)), `${name}: page width (pt)`).toBe(width);
      expect(Math.round(heightPt(rendered)), `${name}: page height (pt)`).toBe(height);
    }
  } finally {
    await app.close().catch(() => undefined);
  }
});

test('text that does not fit is clipped onto the same single page', async () => {
  const { app } = await launchApp(userDataDir);
  try {
    const many = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`).join('\n');
    const cases: Array<[string, Snapshot, number, number]> = [
      ['4 × 6 portrait', { text: many, profile: '4x6', orientation: 'portrait', fontSizePt: 48 }, 288, 432],
      ['4 × 6 landscape', { text: many, profile: '4x6', orientation: 'landscape', fontSizePt: 48 }, 288, 432],
      ['2 × 1', { text: many, profile: '2x1', orientation: 'landscape', fontSizePt: 24 }, 162, 90],
    ];

    for (const [name, snapshot, width, height] of cases) {
      const rendered = await renderInPrintWindow(app, snapshot);
      expect(rendered.pages, `${name}: pages`).toBe(1);
      expect(Math.round(widthPt(rendered)), `${name}: width`).toBe(width);
      expect(Math.round(heightPt(rendered)), `${name}: height`).toBe(height);
    }
  } finally {
    await app.close().catch(() => undefined);
  }
});

test('the 4 × 6 landscape label is turned a quarter turn clockwise, once', async () => {
  const { app } = await launchApp(userDataDir);
  try {
    const portrait = await renderInPrintWindow(app, { text: 'ABCDEFGH', profile: '4x6', orientation: 'portrait', fontSizePt: 24 });
    const landscape = await renderInPrintWindow(app, { text: 'ABCDEFGH', profile: '4x6', orientation: 'landscape', fontSizePt: 24 });
    const small = await renderInPrintWindow(app, { text: 'ABCDEFGH', profile: '2x1', orientation: 'landscape', fontSizePt: 12 });

    const direction = (r: Rendered) => {
      const first = r.chars[0];
      const last = r.chars[r.chars.length - 1];
      return { dx: last.x - first.x, dy: last.y - first.y };
    };

    // Portrait and the 2 × 1 label read left to right.
    expect(direction(portrait).dx).toBeGreaterThan(40);
    expect(Math.abs(direction(portrait).dy)).toBeLessThan(3);
    expect(direction(small).dx).toBeGreaterThan(20);
    expect(Math.abs(direction(small).dy)).toBeLessThan(3);

    // Landscape on portrait stock reads top to bottom (rotated 90° clockwise), not sideways twice.
    expect(direction(landscape).dy).toBeGreaterThan(40);
    expect(Math.abs(direction(landscape).dx)).toBeLessThan(3);

    // Everything stays inside the page, and the safe inset (12 px) is applied once.
    for (const [name, rendered] of [['portrait', portrait], ['landscape', landscape], ['2 × 1', small]] as const) {
      for (const char of rendered.chars) {
        expect(char.x, `${name}: x`).toBeGreaterThan(12);
        expect(char.x, `${name}: x`).toBeLessThan(rendered.page.width - 12);
        expect(char.y, `${name}: y`).toBeGreaterThan(12);
        expect(char.y, `${name}: y`).toBeLessThan(rendered.page.height - 12);
      }
    }
  } finally {
    await app.close().catch(() => undefined);
  }
});

test('the print window reports overflow for the label it was given, whichever layout it showed first', async () => {
  // What the print window reports decides whether the user is asked about a clipped label.
  // The first label it ever shows used to decide which element later reports were taken from,
  // so after a 4 × 6 landscape label every report said "fits".
  const { app } = await launchApp(userDataDir);
  try {
    const tall = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
    const cases: Array<[string, Snapshot, boolean]> = [
      ['4 × 6 landscape, tall', { text: tall, profile: '4x6', orientation: 'landscape', fontSizePt: 24 }, true],
      ['4 × 6 portrait, tall', { text: tall, profile: '4x6', orientation: 'portrait', fontSizePt: 24 }, true],
      ['2 × 1, tall', { text: tall, profile: '2x1', orientation: 'landscape', fontSizePt: 24 }, true],
      ['4 × 6 portrait, short', { text: 'Hello', profile: '4x6', orientation: 'portrait', fontSizePt: 24 }, false],
      ['4 × 6 landscape, tall again', { text: tall, profile: '4x6', orientation: 'landscape', fontSizePt: 24 }, true],
    ];

    let n = 0;
    for (const [name, snapshot, overflow] of cases) {
      n += 1;
      const job = {
        requestId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        draftRevision: n,
        contentKind: 'text',
        resolvedFontFamily: 'Arial',
        alignment: 'left',
        copies: 1,
        expectedLayout: { logicalWidthPt: 0, logicalHeightPt: 0, lineRectsPt: [], lineTextOffsets: [], overflow: false },
        ...snapshot,
      };

      const reported = await app.evaluate(
        async ({ BrowserWindow, ipcMain }, { jobChannel, readyChannel, job }) => {
          const printWindow = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('print.html'))!;
          return await new Promise<{ overflow: boolean; lines: number }>((resolve) => {
            const onReady = (_event: unknown, payload: { requestId: string; fingerprint: { overflow: boolean; lineTextOffsets: number[] } }) => {
              if (payload.requestId !== job.requestId) return;
              ipcMain.removeListener(readyChannel, onReady);
              clearInterval(resend);
              resolve({ overflow: payload.fingerprint.overflow, lines: payload.fingerprint.lineTextOffsets.length });
            };
            ipcMain.on(readyChannel, onReady);
            // The print page may still be starting; the job is sent again until it answers.
            const resend = setInterval(() => printWindow.webContents.send(jobChannel, job), 400);
            printWindow.webContents.send(jobChannel, job);
          });
        },
        { jobChannel: IPC_CHANNELS.PRINT_WINDOW_JOB, readyChannel: IPC_CHANNELS.PRINT_WINDOW_READY, job }
      );

      expect(reported.overflow, `${name}: overflow`).toBe(overflow);
      expect(reported.lines, `${name}: lines`).toBe(snapshot.text === 'Hello' ? 1 : 20);
    }
  } finally {
    await app.close().catch(() => undefined);
  }
});

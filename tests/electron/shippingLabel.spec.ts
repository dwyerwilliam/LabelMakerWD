import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeUserDataDir, removeUserDataDir } from './support/app';

// These tests write to the real system clipboard. They save what was there first and put it
// back afterwards, so running the suite does not lose what the user had copied.

let userDataDir: string;
let app: ElectronApplication;
let window: Page;

test.beforeEach(async () => {
  userDataDir = makeUserDataDir();
  ({ app, window } = await launchApp(userDataDir));
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    const saved = [];
    for (const item of await clipboard.read()) {
      const entries: Record<string, Blob> = {};
      for (const type of item.types) {
        const value = await item.getType(type).catch(() => null);
        if (value instanceof Blob) entries[type] = value;
      }
      if (Object.keys(entries).length > 0) saved.push(new ClipboardItem(entries));
    }
    (process as any).__savedClipboard = saved;
  });
});

test.afterEach(async () => {
  await app
    .evaluate(async ({ clipboard }) => {
      const saved = (process as any).__savedClipboard;
      if (saved?.length) await clipboard.write(saved);
      else await clipboard.clear();
    })
    .catch(() => undefined);
  await app.close().catch(() => undefined);
  removeUserDataDir(userDataDir);
});

/** A PNG of the given size, made by the renderer's canvas. */
async function makePng(width: number, height: number): Promise<number[]> {
  return window.evaluate(async ([w, h]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(10, 10, w / 2, h / 4);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, [width, height]);
}

function pngSize(bytes: number[]): { width: number; height: number } {
  const view = new DataView(new Uint8Array(bytes).buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('the Paste button bridge reads an image from the system clipboard', async () => {
  const png = await makePng(300, 450);
  await app.evaluate(async ({ clipboard, ClipboardItem }, bytes) => {
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })]);
  }, png);

  const read = await window.evaluate(async () => {
    const bytes = await globalThis.window.api.clipboard.readImage();
    return bytes ? [...bytes] : null;
  });

  expect(read).not.toBeNull();
  expect(read!.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(pngSize(read!)).toEqual({ width: 300, height: 450 });
});

test('the Paste button bridge reports no image when the clipboard holds only text', async () => {
  await app.evaluate(async ({ clipboard }) => {
    await clipboard.writeText('just some text');
  });

  const read = await window.evaluate(() => globalThis.window.api.clipboard.readImage());
  expect(read).toBeNull();
});

// Windows snipping tools put a bitmap (CF_DIB), not a PNG, on the clipboard. .NET's
// Clipboard.SetImage writes the same formats, so this checks the real Win+Shift+S path.
test('the Paste button bridge reads a Windows bitmap like the one Snipping Tool leaves', async () => {
  test.skip(process.platform !== 'win32', 'Windows clipboard formats only');
  const { execFileSync } = await import('child_process');
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
    '$bmp = New-Object System.Drawing.Bitmap 320, 480',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.Clear([System.Drawing.Color]::White)',
    '$g.FillRectangle([System.Drawing.Brushes]::Black, 20, 20, 100, 60)',
    '$g.Dispose()',
    '[System.Windows.Forms.Clipboard]::SetImage($bmp)',
  ].join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { stdio: 'ignore', timeout: 30000 });

  const read = await window.evaluate(async () => {
    const bytes = await globalThis.window.api.clipboard.readImage();
    return bytes ? [...bytes] : null;
  });

  expect(read).not.toBeNull();
  expect(read!.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(pngSize(read!)).toEqual({ width: 320, height: 480 });
});

/** An 812 × 1218 black-and-white label PNG (base64), drawn by the renderer. */
async function makeLabelPng(): Promise<string> {
  return window.evaluate(() => {
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

function imageJob(pngBase64: string, overrides: Record<string, unknown> = {}) {
  return {
    requestId: '00000000-0000-4000-8000-00000000a001',
    draftRevision: 1,
    contentKind: 'image',
    text: '',
    profile: '4x6',
    orientation: 'portrait',
    resolvedFontFamily: 'Arial',
    fontSizePt: 24,
    alignment: 'center',
    copies: 1,
    expectedLayout: { logicalWidthPt: 288, logicalHeightPt: 432, lineRectsPt: [], lineTextOffsets: [], overflow: false },
    image: { pngBase64, widthPx: 812, heightPx: 1218 },
    ...overrides,
  };
}

test('a shipping label prints as exactly one portrait 4 × 6 page holding the image', async () => {
  const job = imageJob(await makeLabelPng());
  const pdf = await app.evaluate(
    async ({ BrowserWindow }, { channel, job }) => {
      const printWindow = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('print.html'))!;
      // The image must really load in the print window (its CSP has to allow data: images).
      const ready = `(() => {
        const img = document.querySelector('img.shipping-label-image');
        return !!img && img.complete && img.naturalWidth === 812 && img.naturalHeight === 1218;
      })()`;
      let loaded = false;
      for (let i = 0; i < 100 && !loaded; i++) {
        if (i % 5 === 0) printWindow.webContents.send(channel, job);
        loaded = await printWindow.webContents.executeJavaScript(ready);
        if (!loaded) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!loaded) return null;
      const bytes = await printWindow.webContents.printToPDF({
        preferCSSPageSize: true,
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      return bytes.toString('latin1');
    },
    { channel: 'print-window:job', job }
  );

  expect(pdf, 'the label image loaded in the print window').not.toBeNull();
  const pages = (pdf!.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const box = /\/MediaBox\s*\[\s*([\d.\s-]+?)\s*\]/.exec(pdf!)![1].trim().split(/\s+/).map(Number);
  expect(pages).toBe(1);
  expect([Math.round(box[2] - box[0]), Math.round(box[3] - box[1])]).toEqual([288, 432]);
  expect(pdf).toMatch(/\/Subtype\s*\/Image/);
});

test('the main process accepts a valid shipping-label job and refuses malformed ones', async () => {
  const png = await makeLabelPng();
  // Never confirms: nothing is sent to a printer, even on a machine with a real SP410.
  const prepare = (snapshot: Record<string, unknown>) =>
    window.evaluate(async (s) => {
      try {
        const result = await globalThis.window.api.print.prepare(s as never);
        if (result.token) await globalThis.window.api.print.cancel(result.token);
        return 'prepared';
      } catch (error) {
        return String((error as Error).message);
      }
    }, snapshot);

  // A valid job gets past validation: it is prepared, or stops only because no 4 × 6 printer is set up here.
  expect(await prepare(imageJob(png))).toMatch(/^prepared$|No printer queue is selected/);

  // A tiny 100 × 100 PNG claiming to be a label.
  const small = await window.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 100;
    c.height = 100;
    return c.toDataURL('image/png').split(',')[1];
  });
  expect(await prepare(imageJob(small))).toContain('not a valid 4 × 6 label image');
  expect(await prepare(imageJob(png, { profile: '2x1', orientation: 'landscape' }))).toContain('4 × 6 profile only');
  expect(await prepare(imageJob(png, { text: 'Hello' }))).toContain('An image job has no text');
});

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

// Drives the shipping-label store and renderer directly (real pdf.js, real canvas) with the
// synthetic fixtures. The UI tests in shippingLabel.spec.ts cover the same flows through the
// interface; these pin down the pipeline itself: crops, rotation, fit, darkness and errors.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { installMockApi } from './support/mockApi';

const fixture = (name: string) => [...fs.readFileSync(path.resolve('tests/fixtures/shipping', name))];

/** Loads the app, then exposes the shipping modules (same instances the app uses) as window.__ship. */
async function open(page: Page): Promise<void> {
  await installMockApi(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const w = window as any;
    w.__ship = {
      store: (await import('/src/renderer/stores/shippingStore.ts' as string)).useShippingStore,
      label: (await import('/src/renderer/stores/labelStore.ts' as string)).useLabelStore,
      ui: (await import('/src/renderer/stores/uiStore.ts' as string)).useUIStore,
      prefs: (await import('/src/renderer/stores/preferencesStore.ts' as string)).usePreferencesStore,
    };
    /** Waits until the store is idle. */
    w.__shipIdle = async () => {
      for (let i = 0; i < 400; i++) {
        if (w.__ship.store.getState().busy === null) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('shipping store stayed busy');
    };
    /** Decodes the processed label and reports its size, black-pixel count and chosen pixels. */
    w.__shipPixels = async (points: Array<[number, number]> = []) => {
      const processed = w.__ship.store.getState().processed;
      if (!processed) return null;
      const img = new Image();
      img.src = processed.objectUrl;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let black = 0;
      let gray = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 0) black++;
        else if (data[i] !== 255) gray++;
      }
      const at = points.map(([x, y]) => data[(y * c.width + x) * 4]);
      return { width: c.width, height: c.height, black, gray, at, base64Length: processed.pngBase64.length };
    };
  });
}

async function loadFixture(page: Page, name: string): Promise<void> {
  await page.evaluate(
    async ([bytes, fileName]) => {
      const w = window as any;
      const file = new File([new Uint8Array(bytes as number[])], fileName as string, { type: 'application/pdf' });
      await w.__ship.store.getState().loadBlob(file, fileName, 'file');
      await w.__shipIdle();
    },
    [fixture(name), name] as const
  );
}

/**
 * A landscape "snip": a 20 px viewer-gray frame around a white page, a black marker at the
 * content's top-left and a block at its bottom-right. Content box: (40, 40) – (840, 540).
 */
async function pasteSnip(page: Page, width = 900, height = 600): Promise<void> {
  await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#525659';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 20, w - 40, h - 40);
      ctx.fillStyle = '#000000';
      const sx = w / 900;
      const sy = h / 600;
      ctx.fillRect(40 * sx, 40 * sy, 60 * sx, 40 * sy);
      ctx.fillRect(800 * sx, 500 * sy, 40 * sx, 40 * sy);
      const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
      const win = window as any;
      await win.__ship.store.getState().loadBlob(blob, null, 'clipboard');
      await win.__shipIdle();
    },
    [width, height] as const
  );
}

const state = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    const s = w.__ship.store.getState();
    const label = w.__ship.label.getState();
    const ui = w.__ship.ui.getState();
    return {
      hasSource: s.source !== null,
      sourceKind: s.source?.kind ?? null,
      choice: s.choice,
      processed: s.processed && { ...s.processed, pngBase64: undefined, objectUrl: undefined },
      busy: s.busy,
      dialog: s.cropDialog && { initial: s.cropDialog.initial, status: s.cropDialog.status, isNewSource: s.cropDialog.isNewSource },
      activeDialog: ui.activeDialog,
      shippingMessage: ui.shippingMessage,
      notice: ui.notice,
      profile: label.activeProfile,
      contentMode: label.contentMode,
      revision: label.draft.revision,
      remembered: w.__ship.prefs.getState().preferences.shippingLabel.rememberedCrops,
      darkness: w.__ship.prefs.getState().preferences.shippingLabel.darkness,
    };
  });

test.beforeEach(async ({ page }) => {
  await open(page);
});

test('a 4 × 6 PDF goes straight to an actual-size 812 × 1218 label with no dialog', async ({ page }) => {
  await loadFixture(page, 'label-4x6.pdf');
  const s = await state(page);
  expect(s.dialog).toBeNull();
  expect(s.activeDialog).toBe('none');
  expect(s.contentMode).toBe('image');
  expect(s.choice).toEqual({ pageIndex: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0 });
  expect(s.processed).toMatchObject({ scalePercent: 100, caption: 'From label-4x6.pdf, page 1 · actual size', blank: false, offAspect: false });

  const px = await page.evaluate(() => (window as any).__shipPixels());
  expect(px).toMatchObject({ width: 812, height: 1218, gray: 0 }); // pure black and white
  expect(px!.black).toBeGreaterThan(5000);
});

test('a 6 × 4 PDF is turned to portrait', async ({ page }) => {
  await loadFixture(page, 'label-6x4.pdf');
  const s = await state(page);
  expect(s.dialog).toBeNull();
  expect(s.choice!.rotation).toBe(90);
  expect(s.processed).toMatchObject({ scalePercent: 100, offAspect: false });
  expect(await page.evaluate(() => (window as any).__shipPixels())).toMatchObject({ width: 812, height: 1218 });
});

test('an eBay-style letter PDF waits in the crop dialog, then prints only the label and is remembered', async ({ page }) => {
  await loadFixture(page, 'ebay-letter.pdf');
  let s = await state(page);
  expect(s.activeDialog).toBe('shipping-crop');
  expect(s.dialog!.isNewSource).toBe(true);
  expect(s.dialog!.status).toBeNull();
  const crop = s.dialog!.initial.crop;
  [crop.x, crop.y, crop.width, crop.height].forEach((v, i) => expect(v).toBeCloseTo([0.049, 0.038, 0.489, 0.56][i], 2));
  // Nothing is the current label until the user accepts.
  expect(s.hasSource).toBe(false);
  expect(s.processed).toBeNull();

  await page.evaluate(async () => {
    const w = window as any;
    const { cropDialog, acceptCrop } = w.__ship.store.getState();
    await acceptCrop(cropDialog.initial);
    await w.__shipIdle();
  });
  s = await state(page);
  expect(s.activeDialog).toBe('none');
  expect(s.sourceKind).toBe('pdf');
  expect(s.processed!.caption).toMatch(/^From ebay-letter\.pdf, page 1 · (actual size|prints at 9\d% of original size)$/);
  expect(s.remembered).toHaveLength(1);
  expect(s.remembered[0]).toMatchObject({ pageWidthPt: 612, pageHeightPt: 792, rotation: 0 });

  // The same page size opens with the remembered area next time.
  await loadFixture(page, 'ebay-letter.pdf');
  s = await state(page);
  expect(s.dialog!.status).toBe('Using the area you chose last time for this page size.');
  expect(s.dialog!.initial.crop).toEqual(s.remembered[0].rect);
});

test('Cancel in the crop dialog keeps the label that was there before', async ({ page }) => {
  await loadFixture(page, 'label-4x6.pdf');
  const before = await state(page);

  await loadFixture(page, 'ebay-letter.pdf');
  await page.evaluate(() => (window as any).__ship.store.getState().cancelCrop());
  const after = await state(page);

  expect(after.activeDialog).toBe('none');
  expect(after.dialog).toBeNull();
  expect(after.processed).toEqual(before.processed);
  expect(after.choice).toEqual(before.choice);
  expect(after.revision).toBe(before.revision);
});

test('a sideways UPS-style label is detected above the fold line and turned to portrait', async ({ page }) => {
  await loadFixture(page, 'ups-letter.pdf');
  const s = await state(page);
  const c = s.dialog!.initial.crop;
  expect(c.y + c.height).toBeLessThan(0.5); // the fold line is at half height
  expect(s.dialog!.initial.rotation).toBe(90);
});

test('a label on page 2 is found when page 1 has none', async ({ page }) => {
  await loadFixture(page, 'two-page.pdf');
  const s = await state(page);
  expect(s.dialog!.initial.pageIndex).toBe(1);
  expect(s.dialog!.status).toBe('Found a label on page 2.');
});

test('a page without a label suggests its content area and says so', async ({ page }) => {
  await loadFixture(page, 'no-label.pdf');
  const s = await state(page);
  expect(s.dialog!.status).toBe("Couldn't find a 4 × 6 label on this page. Drag the box around the label.");
  expect(s.dialog!.initial.crop.width).toBeGreaterThan(0.5);
});

test('a landscape snip is trimmed, turned clockwise to portrait, and fitted', async ({ page }) => {
  await pasteSnip(page);
  const s = await state(page);
  expect(s.dialog).toBeNull();
  expect(s.choice!.rotation).toBe(90);
  // Peeled to the content box (40, 40, 800, 500) of the 900 × 600 snip.
  const crop = s.choice!.crop;
  expect([crop.x * 900, crop.y * 600, crop.width * 900, crop.height * 600].map(Math.round)).toEqual([40, 40, 800, 500]);
  expect(s.processed!.caption).toBe('From clipboard snip · about 133 dpi');
  expect(s.processed!.lowResolution).toBe(true);

  // 500 × 800 after turning, fitted to 761 × 1218 at x = 25. The top-left marker ends up top-right,
  // the bottom-right block bottom-left.
  const px = await page.evaluate(() => (window as any).__shipPixels([[770, 40], [40, 40], [50, 1190], [770, 1190]]));
  expect(px!.at).toEqual([0, 255, 0, 255]);
  expect(px!.gray).toBe(0);
});

test('Rotate turns the label in quarter turns', async ({ page }) => {
  await pasteSnip(page);
  await page.evaluate(async () => {
    const w = window as any;
    await w.__ship.store.getState().rotate(90);
  });
  expect((await state(page)).choice!.rotation).toBe(180);
  // 180°: the marker that was top-left of the landscape snip is now bottom-left of a landscape fit.
  await page.evaluate(async () => {
    const w = window as any;
    await w.__ship.store.getState().rotate(-90);
    await w.__ship.store.getState().rotate(-90);
  });
  expect((await state(page)).choice!.rotation).toBe(0);
});

test('a sharp snip has no low-resolution warning', async ({ page }) => {
  await pasteSnip(page, 1800, 1200);
  const s = await state(page);
  expect(s.processed!.lowResolution).toBe(false);
  expect(s.processed!.effectiveDpi).toBeGreaterThanOrEqual(150);
});

test('darkness changes how much prints black', async ({ page }) => {
  await loadFixture(page, 'label-4x6.pdf');
  const blackAt = async (darkness: number) =>
    page.evaluate(async (d) => {
      const w = window as any;
      w.__ship.prefs.getState().updateShipping({ darkness: d });
      await w.__ship.store.getState().reprocess();
      return (await w.__shipPixels()).black as number;
    }, darkness);
  const light = await blackAt(1);
  const dark = await blackAt(5);
  expect(dark).toBeGreaterThan(light);
});

test('a password-protected PDF is reported and changes nothing', async ({ page }) => {
  await loadFixture(page, 'encrypted.pdf');
  const s = await state(page);
  // Still in Text mode, so the message goes to the notice bar.
  expect(s.contentMode).toBe('text');
  expect(s.notice).toBe('encrypted.pdf is password-protected. Open it in a PDF viewer and take a screen snip instead.');
  expect(s.hasSource).toBe(false);
  expect(s.busy).toBeNull();
});

test('an unreadable file is reported in the shipping view once in Shipping label mode, keeping the label', async ({ page }) => {
  await loadFixture(page, 'label-4x6.pdf');
  const before = await state(page);
  await page.evaluate(async () => {
    const w = window as any;
    await w.__ship.store.getState().loadBlob(new File(['not a pdf'], 'broken.pdf', { type: 'application/pdf' }), 'broken.pdf', 'file');
    await w.__ship.store.getState().loadBlob(new File(['hello'], 'notes.txt', { type: 'text/plain' }), 'notes.txt', 'file');
  });
  const s = await state(page);
  expect(s.shippingMessage).toEqual({
    kind: 'error',
    text: "Label Maker can't open notes.txt. Use a PDF or an image (PNG, JPEG, GIF, BMP, WebP).",
  });
  expect(s.processed).toEqual(before.processed);
});

test('loading from the 2 × 1 tab switches to 4 × 6 Shipping label and says why', async ({ page }) => {
  await page.evaluate(() => (window as any).__ship.label.getState().setActiveProfile('2x1'));
  await loadFixture(page, 'label-4x6.pdf');
  const s = await state(page);
  expect(s.profile).toBe('4x6');
  expect(s.contentMode).toBe('image');
  expect(s.notice).toBe('Shipping labels print on the 4 × 6 printer.');
});

test('Clear empties the label and starts a new revision', async ({ page }) => {
  await loadFixture(page, 'label-4x6.pdf');
  const before = await state(page);
  await page.evaluate(() => (window as any).__ship.store.getState().clear());
  const s = await state(page);
  expect(s.hasSource).toBe(false);
  expect(s.processed).toBeNull();
  expect(s.revision).toBeGreaterThan(before.revision);
});

test('the newest load wins when two overlap', async ({ page }) => {
  await page.evaluate(
    async ([a, b]) => {
      const w = window as any;
      const first = w.__ship.store.getState().loadBlob(new File([new Uint8Array(a)], 'label-6x4.pdf'), 'label-6x4.pdf', 'file');
      const second = w.__ship.store.getState().loadBlob(new File([new Uint8Array(b)], 'label-4x6.pdf'), 'label-4x6.pdf', 'file');
      await Promise.all([first, second]);
      await w.__shipIdle();
    },
    [fixture('label-6x4.pdf'), fixture('label-4x6.pdf')] as const
  );
  const s = await state(page);
  expect(s.processed!.caption).toBe('From label-4x6.pdf, page 1 · actual size');
  expect(s.choice!.rotation).toBe(0);
});

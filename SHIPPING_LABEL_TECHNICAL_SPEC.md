# Label Maker — Shipping Label Mode: Technical Specification

- **Version:** v1 draft · November 17, 2026
- **Functional baseline:** [SHIPPING_LABEL_FUNCTIONAL_SPEC.md](SHIPPING_LABEL_FUNCTIONAL_SPEC.md). Section references like "FS §4.6" point there.
- **Architecture baseline:** [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md). Its process boundaries, IPC security, error model, and print protocol all still apply.

---

## 0. Read this first (rules for the implementer)

1. Work through the phases in §15 **in order**. Do not start a phase until the previous phase's checks pass.
2. After each phase run, in this order: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:ui`. From Phase 7 on, also run `npm run build:app` and `npm run test:electron`. Fix every failure before you continue. Do not skip or delete existing tests to make a run pass.
3. **Commit locally at the end of each phase**, with a message like `Shipping labels: phase 3 – PDF and image sources`. **Never push.** Never amend or rewrite earlier commits.
4. Do not change behavior outside this feature. Text mode, the 2 × 1 profile, printer discovery, and settings must behave exactly as before. The existing tests prove this. If an existing test fails, your change is wrong; don't change the test.
5. **Privacy rule (hard):** never `console.log`/`warn`/`error` image bytes, base64 strings, PDF bytes, file contents, or full snapshots. Log sizes, counts, and timings only. Never write label images or PDFs to disk: no temp files, no `fs` calls, no caches.
6. Use the exact names, file paths, constants, and messages in this document. When this document shows code, copy it. When it gives an algorithm in prose, implement it exactly as written.
7. User-visible strings are given in the functional spec. Copy them exactly, including the `×` (U+00D7) and `…` (U+2026) characters.
8. Use the dependency version you actually install (see §2). Where an API detail depends on that version, this document says **"check the installed types"**. Do that, rather than guessing.

---

## 1. Overview and data flow

```text
                     ┌───────────── renderer (visible window) ──────────────┐
clipboard image ─┐   │                                                      │
dropped file  ───┼──►│ useShippingInput ─► shippingStore.loadBlob()         │
Open file…    ───┤   │        │                                             │
Paste button  ───┘   │        ▼                                             │
 (IPC clipboard:     │  sources/ (pdfSource | imageSource)                  │
  read-image)        │        │                                             │
                     │        ▼                                             │
                     │  analysis.ts (pure)  ── suggests crop / trims border │
                     │        │                                             │
                     │        ├─► CropDialog (PDF letter pages, Adjust crop)│
                     │        ▼                                             │
                     │  render.ts ─► 812×1218 1-bit PNG (base64 + blob URL) │
                     │        │                                             │
                     │        ▼                                             │
                     │  ShippingLabelView preview · Print 4 × 6             │
                     └────────┬─────────────────────────────────────────────┘
                              │ print:prepare (PrintSnapshot contentKind='image')
                              ▼
                 main: PrintService.prepare → validates PNG (812×1218)
                              │ print-window:job
                              ▼
                 hidden print window: PrintDocument renders <img> on 4in×6in page
                              │ print-window:ready (fixed image fingerprint)
                              ▼
                 main: webContents.print(... same options as 4 × 6 text ...)
```

Key design points:

- All image work (PDF parsing, cropping, rotation, thresholding) happens in the **visible renderer**. Main never parses PDFs or images. It only checks the PNG header of the final image.
- The print pipeline is reused unchanged except for one new snapshot kind. The hidden print window draws an `<img>` instead of text.
- The final image is always **812 × 1218 px**: 4 × 6 in at the SP410's 203 dpi. It is displayed in the print page at 384 × 576 CSS px (4 × 6 in at 96 CSS px/in).
- Pure algorithms (`analysis.ts`, parts of `render.ts`, `shared/shipping.ts`) have no DOM dependency and are unit-tested in Vitest's node environment.

---

## 2. Dependencies and build setup

### 2.1 Packages

| Package | Kind | Purpose |
| --- | --- | --- |
| `pdfjs-dist` | `dependencies` | Parse and render PDF pages in the renderer. |
| `pdf-lib` | `devDependencies` | Only for the fixture generator script (§14.1). Never imported by app code. |

Install with an exact version (no `^`):

```bash
npm install --save-exact pdfjs-dist@latest
npm install --save-dev --save-exact pdf-lib@1.17.1
```

Then write the resolved `pdfjs-dist` version into §16 of this file ("Recorded versions"). If the latest `pdfjs-dist` requires a Node version newer than this repo's engines field (`>=24`), choose the newest version that supports Node 24 instead.

### 2.2 Vite client types

Create `src/renderer/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

This lets TypeScript accept `import workerUrl from '...?url'`.

### 2.3 pdf.js assets (standard fonts)

Some carrier PDFs use non-embedded standard fonts (Helvetica, Courier). pdf.js needs its `standard_fonts` folder for these.

Create `scripts/copy-pdfjs-assets.mjs`:

```js
// Copies the pdf.js files that must be served as static assets into public/pdfjs/.
// public/pdfjs/ is generated: it is git-ignored and rebuilt by `npm run dev` and `npm run build:app`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'node_modules', 'pdfjs-dist');
const to = path.join(root, 'public', 'pdfjs');

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const dir of ['standard_fonts', 'wasm']) {
  const src = path.join(from, dir);
  if (existsSync(src)) cpSync(src, path.join(to, dir), { recursive: true });
}
console.log('Copied pdf.js assets to public/pdfjs/');
```

In `package.json` scripts, change:

```jsonc
"dev": "node scripts/copy-pdfjs-assets.mjs && vite",
"build:app": "node scripts/copy-pdfjs-assets.mjs && tsc --noEmit && vite build",
```

Add `public/pdfjs/` to `.gitignore` under "Build output", and `'public/pdfjs/**'` to the `ignores` list in `eslint.config.js` (they are vendor files). Both were done in Phase 0.

Vite copies `public/` into `dist/`, and the `labelmaker://app/` protocol already serves everything in `dist/`. So the files are reachable at `labelmaker://app/pdfjs/standard_fonts/` in the packaged app and at `/pdfjs/standard_fonts/` in dev.

### 2.4 Worker

pdf.js runs its parser in a Web Worker. In `src/renderer/shipping/sources/pdfSource.ts` (see §7.2):

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
```

Check the installed package for the exact worker file name (`build/pdf.worker.min.mjs` in pdf.js 4 and 5). Vite emits the worker as a hashed asset under `dist/assets/`, which the app protocol serves.

**Load pdf.js lazily** (`await import('pdfjs-dist')` inside `loadPdf`) so startup does not slow down for text-only users.

---

## 3. Shared constants and helpers — `src/shared/shipping.ts` (new)

Create this file exactly:

```ts
import type { LayoutFingerprint } from './contracts';

/** SP410 resolution. A 4 × 6 in label is 812 × 1218 printer dots. */
export const SHIPPING_DPI = 203;
export const SHIPPING_WIDTH_IN = 4;
export const SHIPPING_HEIGHT_IN = 6;
// Written as literals (not 4 * 203) so their types are the literal values the IPC schema
// and ShippingImagePayload require. A unit test checks they equal inches × dpi.
export const SHIPPING_WIDTH_PX = 812 as const;   // SHIPPING_WIDTH_IN × SHIPPING_DPI
export const SHIPPING_HEIGHT_PX = 1218 as const; // SHIPPING_HEIGHT_IN × SHIPPING_DPI

/** Largest file the user may open or paste. */
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;
/** Largest final PNG accepted over IPC (a real 1-bit label is usually 30–300 KB). */
export const MAX_SHIPPING_PNG_BYTES = 4 * 1024 * 1024;
export const MAX_SHIPPING_PNG_BASE64_LENGTH = Math.ceil(MAX_SHIPPING_PNG_BYTES / 3) * 4;

/** Darkness steps 1–5 → luminance threshold. A pixel darker than the threshold prints black. */
export const DARKNESS_THRESHOLDS = { 1: 112, 2: 136, 3: 160, 4: 184, 5: 208 } as const;
export type Darkness = keyof typeof DARKNESS_THRESHOLDS; // 1 | 2 | 3 | 4 | 5
export const DEFAULT_DARKNESS: Darkness = 3;

/** Output rotation, clockwise, applied after cropping. */
export type Rotation = 0 | 90 | 180 | 270;

/** A rectangle as fractions (0–1) of the source page or image, in its displayed orientation. */
export interface FracRect { x: number; y: number; width: number; height: number }

/** How many remembered PDF crops are kept, and how close page sizes must be to match. */
export const MAX_REMEMBERED_CROPS = 8;
export const REMEMBERED_CROP_TOLERANCE_PT = 2;

/** Image sources below this effective resolution get the low-resolution warning. */
export const LOW_DPI_WARNING = 150;
/** Aspect ratio (height/width) more than this fraction away from 1.5 gets the aspect warning. */
export const ASPECT_WARNING_TOLERANCE = 0.12;
/** A PDF crop that is already 4 × 6 within this many inches skips the dialog. */
export const FOUR_BY_SIX_PAGE_TOLERANCE_IN = 0.15;

/**
 * The layout fingerprint every shipping-label job reports. The image always fills one
 * portrait 4 × 6 page and has no text lines, so the preview and the print window agree by construction.
 */
export const IMAGE_LAYOUT_FINGERPRINT: LayoutFingerprint = {
  logicalWidthPt: 288,
  logicalHeightPt: 432,
  lineRectsPt: [],
  lineTextOffsets: [],
  overflow: false,
};

/** Reads width and height from a PNG's IHDR chunk. Returns null if the bytes are not a PNG. */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== signature[i]) return null;
  // Chunk type at bytes 12–15 must be "IHDR".
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Clamps a fractional rect so it lies inside [0,1]² and is at least minW × minH (fractions). */
export function clampFracRect(r: FracRect, minW: number, minH: number): FracRect {
  const width = Math.min(1, Math.max(minW, r.width));
  const height = Math.min(1, Math.max(minH, r.height));
  const x = Math.min(1 - width, Math.max(0, r.x));
  const y = Math.min(1 - height, Math.max(0, r.y));
  return { x, y, width, height };
}

export interface FitResult { width: number; height: number; offsetX: number; offsetY: number; scale: number }

/**
 * Uniform fit of a (srcW × srcH) box into the 812 × 1218 label, centered.
 * `scale` is output pixels per source unit. All results are integers except `scale`.
 */
export function fitToLabel(srcW: number, srcH: number): FitResult {
  const scale = Math.min(SHIPPING_WIDTH_PX / srcW, SHIPPING_HEIGHT_PX / srcH);
  const width = Math.max(1, Math.min(SHIPPING_WIDTH_PX, Math.round(srcW * scale)));
  const height = Math.max(1, Math.min(SHIPPING_HEIGHT_PX, Math.round(srcH * scale)));
  return {
    width,
    height,
    offsetX: Math.floor((SHIPPING_WIDTH_PX - width) / 2),
    offsetY: Math.floor((SHIPPING_HEIGHT_PX - height) / 2),
    scale,
  };
}

/** Width/height after rotating a w × h box. */
export function rotatedSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

export function addRotation(r: Rotation, delta: 90 | -90): Rotation {
  return (((r + delta) % 360) + 360) % 360 as Rotation;
}

/** True when height/width is more than ASPECT_WARNING_TOLERANCE away from 6/4. */
export function isOffAspect(w: number, h: number): boolean {
  return Math.abs(h / w - 1.5) / 1.5 > ASPECT_WARNING_TOLERANCE;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
```

---

## 4. Contracts and schemas

### 4.1 `src/shared/contracts.ts`

Add:

```ts
export type ContentMode = 'text' | 'image';

export interface RememberedCrop {
  pageWidthPt: number;
  pageHeightPt: number;
  /** Crop as fractions of the page in its displayed orientation (pdf.js viewport with the page's own /Rotate). */
  rect: { x: number; y: number; width: number; height: number };
  rotation: 0 | 90 | 180 | 270;
}

export interface ShippingLabelPreferences {
  /** Which mode the 4 × 6 tab opens in. */
  mode4x6: ContentMode;
  darkness: 1 | 2 | 3 | 4 | 5;
  /** Most recent first, at most 8. */
  rememberedCrops: RememberedCrop[];
}

export interface ShippingImagePayload {
  /** Base64 (no data: prefix) of an 812 × 1218 PNG. */
  pngBase64: string;
  widthPx: 812;
  heightPx: 1218;
}
```

Change `PreferencesV2`:

```ts
export interface PreferencesV2 {
  schemaVersion: 2;
  activeProfile: PrinterProfile;
  profiles: Record<PrinterProfile, ProfilePreferences>;
  shippingLabel: ShippingLabelPreferences;
}
```

Change `PreferencesUpdate`:

```ts
export type PreferencesUpdate = Partial<Pick<PreferencesV2, 'activeProfile' | 'profiles' | 'shippingLabel'>>;
```

Change `PrintSnapshot`, adding two fields:

```ts
export interface PrintSnapshot {
  requestId: string;
  draftRevision: number;
  /** 'text' for the text editor; 'image' for a shipping label. */
  contentKind: ContentMode;
  text: string;
  profile: PrinterProfile;
  orientation: Orientation;
  resolvedFontFamily: string;
  fontSizePt: number;
  alignment: Alignment;
  copies: number;
  expectedLayout: LayoutFingerprint;
  /** Present only when contentKind is 'image'. */
  image?: ShippingImagePayload;
}
```

The schema stays version 2. `shippingLabel` is a new key. Older builds ignore unknown keys when reading, so this does not need a schema version bump.

### 4.2 `src/shared/defaults.ts`

In `createDefaultPreferences()` add:

```ts
shippingLabel: {
  mode4x6: 'text',
  darkness: 3,
  rememberedCrops: [],
},
```

### 4.3 `src/shared/schemas.ts`

Add (import the constants from `./shipping`):

```ts
export const contentModeSchema = z.enum(['text', 'image']);
export const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const fraction = z.number().min(0).max(1);

export const rememberedCropSchema = z.object({
  pageWidthPt: z.number().positive().max(14400),
  pageHeightPt: z.number().positive().max(14400),
  rect: z.object({ x: fraction, y: fraction, width: fraction.positive(), height: fraction.positive() }),
  rotation: rotationSchema,
});

export const shippingLabelPreferencesSchema = z.object({
  mode4x6: contentModeSchema,
  darkness: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  rememberedCrops: z.array(rememberedCropSchema).max(MAX_REMEMBERED_CROPS),
});

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const shippingImagePayloadSchema = z.object({
  pngBase64: z.string().min(16).max(MAX_SHIPPING_PNG_BASE64_LENGTH).regex(BASE64_RE),
  widthPx: z.literal(SHIPPING_WIDTH_PX),
  heightPx: z.literal(SHIPPING_HEIGHT_PX),
});
```

Change `preferencesV2Schema` so the key is **optional when reading** (files written before this feature lack it). `SettingsService.load` fills the default (§5.2):

```ts
export const preferencesV2Schema = z.object({
  schemaVersion: z.literal(2),
  activeProfile: printerProfileSchema,
  profiles: profilesSchema,
  shippingLabel: shippingLabelPreferencesSchema.optional(),
});
```

Change `preferencesUpdateSchema`:

```ts
export const preferencesUpdateSchema = z.strictObject({
  activeProfile: printerProfileSchema.optional(),
  profiles: profilesSchema.optional(),
  shippingLabel: shippingLabelPreferencesSchema.optional(),
});
```

Change `printSnapshotSchema`:

```ts
export const printSnapshotSchema = z.object({
  requestId: z.uuid(),
  draftRevision: z.number().int().nonnegative(),
  contentKind: contentModeSchema.default('text'),
  text: labelTextSchema,
  profile: printerProfileSchema,
  orientation: orientationSchema,
  resolvedFontFamily: z.string().min(1),
  fontSizePt: fontSizePtSchema,
  alignment: alignmentSchema,
  copies: copiesSchema,
  expectedLayout: layoutFingerprintSchema,
  image: shippingImagePayloadSchema.optional(),
}).superRefine((s, ctx) => {
  if (s.contentKind === 'image') {
    if (!s.image) ctx.addIssue({ code: 'custom', path: ['image'], message: 'An image job needs an image.' });
    if (s.profile !== '4x6') ctx.addIssue({ code: 'custom', path: ['profile'], message: 'Shipping labels print on the 4 × 6 profile only.' });
    if (s.orientation !== 'portrait') ctx.addIssue({ code: 'custom', path: ['orientation'], message: 'Shipping labels print portrait.' });
    if (s.text !== '') ctx.addIssue({ code: 'custom', path: ['text'], message: 'An image job has no text.' });
  } else if (s.image) {
    ctx.addIssue({ code: 'custom', path: ['image'], message: 'A text job must not carry an image.' });
  }
});
```

If the installed Zod version flags `superRefine` as deprecated, use the replacement it names (`.check(...)`) with the same rules.

### 4.4 Existing call sites that construct `PrintSnapshot`

Add `contentKind: 'text'` to each. Find them with:

```bash
git grep -n "expectedLayout:" -- src tests
```

At minimum: `src/renderer/App.tsx` (`handlePrintClick`), `tests/unit/printService.test.ts` (`snapshotFor`), and `tests/ui/support/printPage.ts` (`TestJob` type and `makeJob`).

---

## 5. Preferences plumbing

### 5.1 `src/shared/preferencesRepair.ts`

After the per-profile loop, add:

```ts
if (json.shippingLabel !== undefined) {
  const shipping = shippingLabelPreferencesSchema.safeParse(json.shippingLabel);
  if (shipping.success) defaults.shippingLabel = shipping.data;
  else repaired.push('shippingLabel');
}
```

(`defaults` already holds the default `shippingLabel` from `createDefaultPreferences()`.)

### 5.2 `src/main/services/settingsService.ts`

1. `clonePreferences` must copy the new key **deeply**:

   ```ts
   shippingLabel: {
     ...preferences.shippingLabel,
     rememberedCrops: preferences.shippingLabel.rememberedCrops.map((c) => ({ ...c, rect: { ...c.rect } })),
   },
   ```

2. In `load()`, after a successful `preferencesV2Schema.safeParse`, fill in a missing key:

   ```ts
   this.currentPreferences = {
     ...parsedV2.data,
     shippingLabel: parsedV2.data.shippingLabel ?? createDefaultPreferences().shippingLabel,
   };
   ```

   The v1 migration path already starts from `createDefaultPreferences()`, so it gets the default.

3. In `update()`, `partial.shippingLabel` replaces the whole object when present: the existing `...partial` spread already does that. Check that the `profiles` merge code still compiles.

### 5.3 `src/renderer/stores/preferencesStore.ts`

1. `updatePayload` returns `{ activeProfile, profiles, shippingLabel }`.
2. In `update`, keep `shippingLabel: partial.shippingLabel ?? current.shippingLabel`.
3. Add an action:

   ```ts
   updateShipping: (partial: Partial<ShippingLabelPreferences>) => void;
   // implementation:
   updateShipping: (partial) => {
     const current = get().preferences;
     const next: PreferencesV2 = { ...current, shippingLabel: { ...current.shippingLabel, ...partial } };
     set({ preferences: next });
     persist(next);
   },
   ```

### 5.4 Tests to add or update

- `tests/unit/schemas.test.ts`: `shippingLabelPreferencesSchema` accepts defaults and rejects darkness 0/6, rotation 45, rect fractions > 1, more than 8 crops. `printSnapshotSchema` rejects: an image job on `2x1`, an image job with `landscape`, an image job with text, an image job without an image, a text job with an image, and wrong `widthPx`. It accepts a valid image job. A text job without `contentKind` parses with `contentKind === 'text'`.
- `tests/unit/settingsService.test.ts`: a settings file without `shippingLabel` loads with the default; one with a valid `shippingLabel` round-trips through `update` and reload; an invalid `shippingLabel` is repaired with `repaired` containing `shippingLabel`, and the rest is kept.
- `tests/unit/preferencesRepair.test.ts`: the same repair case at the pure-function level.

---

## 6. Pure image analysis — `src/renderer/shipping/analysis.ts` (new)

No DOM, no canvas. Everything works on a grayscale grid:

```ts
export interface GrayImage { data: Uint8Array; width: number; height: number } // 0 = black, 255 = white
export interface PxRect { x: number; y: number; width: number; height: number }
```

### 6.1 `toGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage`

For each pixel, composite over white, then compute luminance:

```ts
const a = rgba[i + 3] / 255;
const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
data[p] = Math.round(lum * a + 255 * (1 - a));
```

### 6.2 `thresholdRgbaInPlace(rgba: Uint8ClampedArray, threshold: number): { blackPixels: number }`

For each pixel, compute the alpha-composited luminance as above (rounded with `Math.round`, exactly as in `toGray`, so a gray of 160 is not black at threshold 160 because of floating-point error), then set `v = lum < threshold ? 0 : 255`, write `r = g = b = v` and `a = 255`, and count black pixels. Return the count (used for the "blank" check: `blackPixels === 0`).

### 6.3 `peelUniformBorders(img: GrayImage): PxRect`

Used for snips and image files. It removes outer bands of uniform color: white margins and the gray background of a PDF viewer.

Algorithm:

1. Start with `r = { x: 0, y: 0, width, height }`.
2. A **line** is one row or one column, limited to the current `r`.
3. A line is **peelable** when:
   - compute its median value `m` (use a 256-bin histogram);
   - `m >= 40` (do not peel near-black lines; a label's black border must stay);
   - at least 98% of its pixels are within ±16 of `m`.
4. Loop: in each pass, try the top row, bottom row, left column, and right column of `r`, in that order. While a side's outer line is peelable and `r` is still more than 1 px in that dimension, shrink `r` by one line on that side. Repeat passes until a full pass peels nothing.
5. Safety: if the result is narrower than 20% of the original width or shorter than 20% of the original height, return the full image rect instead.
6. Return `r`.

### 6.4 `inkBounds(img: GrayImage, region: PxRect, inkLevel = 200): PxRect | null`

Smallest rect inside `region` that contains every pixel with value `< inkLevel`. Returns `null` when there is none.

### 6.5 `detectLabelRegion(img: GrayImage, dpi: number): PxRect | null`

Used for PDF pages. `img` is the whole page rendered at `ANALYSIS_DPI = 50` (exported constant). Returns the suggested label rect in `img` pixels, or `null`.

Constants (derive pixel values from `dpi`):

```ts
export const ANALYSIS_DPI = 50;
const INK_LEVEL = 200;                 // value < 200 counts as ink
const MIN_GAP_IN = 0.15;               // whitespace needed to split regions
const RULE_MAX_THICKNESS_IN = 0.06;    // thin full-width lines (fold/cut lines) are erased
const RULE_MIN_SPAN = 0.8;             // ... if their ink spans ≥ 80% of the page dimension
const RULE_MIN_COVERAGE = 0.3;         // ... and covers ≥ 30% of it (dashed lines qualify)
const RULE_MIN_LENGTH_IN = 7.0;        // ... and is longer than any label could be (= L_MAX)
const RULE_MAX_INNER_GAP_IN = 0.25;    // ... and has no gap longer than this (dashes, not unrelated content)
const MAX_DEPTH = 6;
const PAD_IN = 0.06;
// Candidate limits, in inches, on the trimmed ink box (short side s, long side l):
const S_MIN = 2.5, S_MAX = 4.6, L_MIN = 3.75, L_MAX = 7.0, RATIO_MIN = 1.2, RATIO_MAX = 1.9;
```

Steps:

1. **Ink mask.** `ink[i] = img.data[i] < INK_LEVEL ? 1 : 0` (a `Uint8Array`).
2. **Erase fold/cut lines.** For each row `y`: let `first`/`last` be the first/last ink x, `count` the ink count, and `widestGap` the longest run of non-ink pixels between `first` and `last`. Mark the row as a *rule row* only if **all** of these hold: `last - first + 1 >= RULE_MIN_SPAN * width`; `last - first + 1 > RULE_MIN_LENGTH_IN * dpi`; `count >= RULE_MIN_COVERAGE * width`; `widestGap <= RULE_MAX_INNER_GAP_IN * dpi`.

   Why the last two (found in Phase 2): without them, the column through a label's left border also passes through the packing-slip text below it. Together they span most of the page, so the label's own border was erased and the label fell apart. The same happened to a label's border on a page that is itself label-sized. A real fold line is longer than any label and has only short dash gaps.

   Group consecutive rule rows. Clear every group whose height is `<= ceil(RULE_MAX_THICKNESS_IN * dpi)` (set its ink to 0). Do the same for columns, using `height`. Thick bands are kept, because they may be part of a label.
3. **XY-cut tree.** Collect candidate rects recursively:

   ```text
   collect(region, depth, out):
     r = inkBounds(mask, region)          // using the mask, not gray values
     if r is null: return
     out.push(r)
     if depth >= MAX_DEPTH: return
     find the longest run of all-empty rows strictly inside r   → (gapRowStart, gapRowLen)
     find the longest run of all-empty columns strictly inside r → (gapColStart, gapColLen)
     minGap = round(MIN_GAP_IN * dpi)
     if max(gapRowLen, gapColLen) < minGap: return
     if gapRowLen >= gapColLen:
        split r horizontally into [r.y, gapRowStart) and [gapRowStart + gapRowLen, r.y + r.height)
     else:
        split r vertically the same way with columns
     collect(firstPart, depth + 1, out); collect(secondPart, depth + 1, out)
   ```

   Start with `collect(fullImageRect, 0, out)`.
4. **Score.** For each candidate `c`: `w = c.width / dpi`, `h = c.height / dpi`, `s = min(w, h)`, `l = max(w, h)`. Skip it unless `S_MIN <= s <= S_MAX`, `L_MIN <= l <= L_MAX`, and `RATIO_MIN <= l / s <= RATIO_MAX`. Score: `err = |s - 4| / 4 + |l - 6| / 6`. Choose the lowest `err`. If two scores are within 0.02, choose the larger area. If no candidate passes, return `null`.
5. **Pad.** Grow the chosen rect by `round(PAD_IN * dpi)` px on every side, clamped to the image. Return it.

### 6.6 `contentArea(img: GrayImage, dpi: number): PxRect`

The fallback suggestion when detection returns `null`: `inkBounds` of the whole image (gray `< 200`), padded by `round(0.1 * dpi)` and clamped. If there is no ink at all, return the full image rect.

### 6.7 Helpers

```ts
export function pxRectToFrac(r: PxRect, w: number, h: number): FracRect; // divide by w/h
export function fracRectToPx(r: FracRect, w: number, h: number): PxRect;  // multiply and round
```

### 6.8 Unit tests — `tests/unit/shippingAnalysis.test.ts`

Build synthetic `GrayImage`s in the test with a helper `canvasOf(wIn, hIn, dpi)` (white) and `fillRect(img, xIn, yIn, wIn, hIn, value)`. Cases:

| Test | Setup (inches, at 50 dpi) | Expect |
| --- | --- | --- |
| eBay-style | 8.5 × 11 page; "label" = a 4 × 6 block of scattered rects at (0.5, 0.5) with a 1 px border; "packing slip" = rows of rects from y = 7.0 to 10.5 spanning x 0.5–8.0 | detected rect within ±0.15 in of (0.44, 0.44, 4.12, 6.12) |
| UPS-style | Landscape 6 × 4 label block at (1.25, 0.6); a dashed full-width line at y = 5.5 (2 px tall, 50% coverage); instruction rects from y = 6 to 10 across the page | rect around the 6 × 4 block; the dashed line does not join the regions |
| Label with internal gap | 4 × 6 label whose middle has a 0.3 in empty band; packing slip 0.6 in below | the whole label, not a half |
| Nothing label-like | 8.5 × 11 with only a 7 × 2 text block | `null` |
| Already a label | 4 × 6 page with content inset by 0.1 in | rect ≈ the content box padded |
| `peelUniformBorders` | image with a gray (#525659 ≈ 86) frame 30 px wide around white, then a black 1 px border, then content | result starts exactly at the black border |
| `peelUniformBorders` safety | all-white image | full rect |
| `thresholdRgbaInPlace` | pixels lum 159, 160, 161 at threshold 160; one transparent pixel | 159 → 0; 160, 161 → 255; transparent → 255 |
| `fitToLabel` | (406, 609), (1000, 1000), (1218, 812) | exact width/height/offsets |
| `readPngDimensions` | a tiny hand-written PNG header for 812 × 1218; garbage bytes | dims; `null` |
| `addRotation` | 0−90, 270+90 | 270, 0 |

---

## 7. Sources

Folder: `src/renderer/shipping/sources/`.

### 7.1 Types — `src/renderer/shipping/sources/types.ts`

```ts
import type { FracRect, Rotation } from '@shared/shipping';

export interface PdfHandle {
  pageCount: number;
  /** Page size in PDF points in displayed orientation (respects the page's /Rotate). pageIndex is 0-based. */
  pageSizePt(pageIndex: number): Promise<{ width: number; height: number }>;
  /** Renders the whole page at `dpi` onto a new canvas (white background). */
  renderPage(pageIndex: number, dpi: number): Promise<HTMLCanvasElement>;
  /** Renders `crop` of the page onto a new canvas of exactly outW × outH pixels (white background). */
  renderRegion(pageIndex: number, crop: FracRect, outW: number, outH: number): Promise<HTMLCanvasElement>;
  destroy(): Promise<void>;
}

export type LoadedSource =
  | { kind: 'image'; bitmap: ImageBitmap; width: number; height: number; origin: 'clipboard' | 'file'; fileName: string | null }
  | { kind: 'pdf'; pdf: PdfHandle; fileName: string };

export interface CropChoice { pageIndex: number; crop: FracRect; rotation: Rotation }
```

### 7.2 `pdfSource.ts`

```ts
export class PdfLoadError extends Error {
  constructor(public readonly reason: 'password' | 'invalid' | 'empty', message: string) { super(message); }
}
export async function loadPdf(bytes: Uint8Array): Promise<PdfHandle>;
```

Implementation requirements:

1. `const pdfjs = await import('pdfjs-dist');` then, once per session, `pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;`.
2. Create the loading task and **keep it**. In pdf.js 6 the task, not the document, is what you destroy:

   ```ts
   const task = pdfjs.getDocument({
     data: bytes,
     disableAutoFetch: true,
     disableStream: true,
     standardFontDataUrl: new URL('pdfjs/standard_fonts/', document.baseURI).href,
     wasmUrl: new URL('pdfjs/wasm/', document.baseURI).href,
   });
   const doc = await task.promise;
   ```

   pdf.js 6 has no `isEvalSupported` option (it never uses eval). Don't pass it.
3. Map errors by `error.name`: `'PasswordException'` → `PdfLoadError('password', …)` (verified in Phase 0 with `encrypted.pdf`); anything else → `PdfLoadError('invalid', …)`. If `doc.numPages === 0` → `PdfLoadError('empty', …)`. Also call `task.destroy()` on every error path.
4. `pageSizePt(i)`: `const page = await doc.getPage(i + 1); const vp = page.getViewport({ scale: 1 }); return { width: vp.width, height: vp.height };`
5. `renderPage(i, dpi)`: viewport at `scale = dpi / 72`; canvas `Math.ceil(vp.width) × Math.ceil(vp.height)`; `page.render({ canvas, viewport: vp })`; return the canvas.
6. `renderRegion(i, crop, outW, outH)`:

   ```ts
   const page = await doc.getPage(i + 1);
   const base = page.getViewport({ scale: 1 });
   const scale = outW / (crop.width * base.width);          // output px per PDF point
   const vp = page.getViewport({ scale });
   const canvas = document.createElement('canvas');
   canvas.width = outW; canvas.height = outH;
   await page.render({
     canvas,                    // pdf.js 6: pass `canvas`, not `canvasContext`; the background defaults to white
     viewport: vp,
     transform: [1, 0, 0, 1, -crop.x * vp.width, -crop.y * vp.height],
   }).promise;
   page.cleanup();
   return canvas;
   ```

7. `destroy()` calls `task.destroy()`. `PDFDocumentProxy` has no `destroy()` in pdf.js 6.
8. Never keep a copy of `bytes` after `getDocument` resolves, and never log it.

### 7.3 `imageSource.ts`

```ts
export async function loadImage(blob: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number }>;
```

Use `createImageBitmap(blob)`. On failure throw `new Error('decode')`; the caller maps it to the FS §6 message. Reject images whose width or height is over 12000 px with the same error, as a memory guard.

### 7.4 File type detection — `src/renderer/shipping/fileTypes.ts`

```ts
export type SourceType = 'pdf' | 'image';
export function classifyFile(name: string, mime: string): SourceType | null;
```

- `pdf` when the MIME is `application/pdf` or the name ends in `.pdf` (case-insensitive).
- `image` when the MIME is one of `image/png`, `image/jpeg`, `image/gif`, `image/bmp`, `image/webp`, or the extension is one of `.png .jpg .jpeg .gif .bmp .webp`.
- Otherwise `null`.

Also export `ACCEPT_ATTRIBUTE = 'application/pdf,.pdf,image/png,image/jpeg,image/gif,image/bmp,image/webp'` for the file input. Unit-test `classifyFile`.

### 7.5 Clipboard IPC (main) — for the **Paste** button

The `paste` event covers Ctrl+V. The Paste button cannot use `navigator.clipboard.read()` without a new permission, so it uses a narrow IPC call instead.

1. `src/shared/channels.ts`: add `CLIPBOARD_READ_IMAGE: 'clipboard:read-image'`.
2. `src/main/ipc/handlers.ts`:

   ```ts
   // Electron 45 replaced clipboard.readImage() with an async, W3C-style API.
   ipcMain.handle(IPC_CHANNELS.CLIPBOARD_READ_IMAGE, async (event) => {
     validateIpcSender(event);
     const items = await clipboard.read();
     for (const item of items) {
       const type = item.types.includes('image/png') ? 'image/png' : item.types.find((t) => t.startsWith('image/'));
       if (!type) continue;
       const blob = await item.getType(type);
       if (!(blob instanceof Blob) || blob.size === 0 || blob.size > MAX_SOURCE_FILE_BYTES) return null;
       return new Uint8Array(await blob.arrayBuffer());
     }
     return null;
   });
   ```

   Import `clipboard` from `electron`.
3. `src/preload/index.ts`: add to `ElectronAPI` and to `api`:

   ```ts
   clipboard: {
     /** PNG bytes of the image on the system clipboard, or null when there is none. */
     readImage: () => Promise<Uint8Array | null>;
   };
   // ...
   clipboard: { readImage: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_READ_IMAGE) },
   ```

4. `tests/ui/support/mockApi.ts`: add `clipboard.readImage` returning `window.__mock.clipboardImage ?? null`, where a test can set `window.__mock.clipboardImage` to a `Uint8Array`. Also add `shippingLabel: { mode4x6: 'text', darkness: 3, rememberedCrops: [] }` to the mock's `preferences` object, plus a `MockOptions.shippingLabel` override so tests can start in image mode or with remembered crops.

---

## 8. Rendering — `src/renderer/shipping/render.ts` (new)

### 8.1 Rotation (exact, no resampling)

```ts
export function rotateCanvas(src: HTMLCanvasElement, rotation: Rotation): HTMLCanvasElement {
  if (rotation === 0) return src;
  const out = document.createElement('canvas');
  const swap = rotation === 90 || rotation === 270;
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (rotation === 90) ctx.setTransform(0, 1, -1, 0, out.width, 0);          // clockwise
  else if (rotation === 180) ctx.setTransform(-1, 0, 0, -1, out.width, out.height);
  else ctx.setTransform(0, -1, 1, 0, 0, out.height);                          // 270 = counter-clockwise
  ctx.drawImage(src, 0, 0);
  return out;
}
```

### 8.2 `renderShippingLabel`

```ts
export interface ProcessedShippingImage {
  pngBase64: string;
  objectUrl: string;            // URL.createObjectURL(pngBlob), for the on-screen preview
  caption: string;              // FS §4.2 caption text
  scalePercent: number | null;  // PDF only
  effectiveDpi: number | null;  // image only
  lowResolution: boolean;
  offAspect: boolean;
  offScale: boolean;            // PDF scale outside 90–110%
  blank: boolean;
}

export async function renderShippingLabel(
  source: LoadedSource,
  choice: CropChoice,
  darkness: Darkness
): Promise<ProcessedShippingImage>;
```

Steps:

1. **Crop size in source units.**
   - PDF: `page = await source.pdf.pageSizePt(choice.pageIndex)`; `cw = crop.width * page.width`, `ch = crop.height * page.height` (points).
   - Image: `cw = crop.width * source.width`, `ch = crop.height * source.height` (pixels).
2. **Fit.** `const { w: rw, h: rh } = rotatedSize(cw, ch, choice.rotation); const fit = fitToLabel(rw, rh);`
   Unrotated output size: `ow = (rotation is 90 or 270) ? fit.height : fit.width`, and `oh` likewise the other way.
3. **Draw the crop at output size (unrotated).**
   - PDF: `piece = await source.pdf.renderRegion(choice.pageIndex, choice.crop, ow, oh)`.
   - Image: create a canvas `ow × oh`, fill white, set `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'`, then `drawImage(bitmap, sx, sy, sw, sh, 0, 0, ow, oh)` with `sx = crop.x * width`, `sy = crop.y * height`, `sw = cw`, `sh = ch`.
4. **Rotate.** `rotated = rotateCanvas(piece, choice.rotation)`.
5. **Compose.** Create the final canvas `812 × 1218`, fill white, set `imageSmoothingEnabled = false`, then `drawImage(rotated, fit.offsetX, fit.offsetY)`.
6. **Threshold.** `getImageData` of the full canvas → `thresholdRgbaInPlace(data, DARKNESS_THRESHOLDS[darkness])` → `putImageData`. `blank = blackPixels === 0`.
7. **Encode.** `canvas.toBlob(resolve, 'image/png')` → `blob`. Bytes: `new Uint8Array(await blob.arrayBuffer())`. If `bytes.length > MAX_SHIPPING_PNG_BYTES`, throw `new Error('too-large')` (should never happen for 1-bit content). `pngBase64 = bytesToBase64(bytes)`, `objectUrl = URL.createObjectURL(blob)`.
8. **Metrics.**
   - PDF: `scalePercent = Math.round(fit.scale / (SHIPPING_DPI / 72) * 100)`; `offScale = scalePercent < 90 || scalePercent > 110`; `effectiveDpi = null`; `lowResolution = false`.
   - Image: `effectiveDpi = Math.round(rw / (fit.width / SHIPPING_DPI))`; `lowResolution = effectiveDpi < LOW_DPI_WARNING`; `scalePercent = null`; `offScale = false`.
   - Both: `offAspect = isOffAspect(rw, rh)`.
9. **Caption** (FS §4.2):
   - PDF: `` `From ${fileName}, page ${pageIndex + 1} · ` `` + (`scalePercent` in 97–103 ? `'actual size'` : `` `prints at ${scalePercent}% of original size` ``).
   - Image: `` `From ${origin === 'clipboard' ? 'clipboard snip' : fileName} · about ${effectiveDpi} dpi` ``.
10. Release intermediate canvases (set width/height to 0) before returning.

### 8.3 `renderPreviewThumbnail` for the crop dialog

Same as `renderShippingLabel` but **skip step 7 and the metrics**. Return the final thresholded canvas, so the dialog can draw it scaled down. Implement it by sharing a private `composeLabelCanvas(source, choice, darkness)` used by both functions.

---

## 9. Stores

### 9.1 `labelStore.ts` changes

Add state and actions:

```ts
contentMode: ContentMode;              // meaningful on the 4x6 profile only
setContentMode: (mode: ContentMode) => void;
/** A shipping image appeared, changed or was cleared: the label is a new revision. */
bumpRevision: () => void;
```

```ts
setContentMode: (mode) => {
  const s = get();
  if (s.contentMode === mode) return;
  set({
    contentMode: mode,
    draft: { ...s.draft, revision: s.draft.revision + 1 },
    layoutFingerprint: null,
    overflow: false,
  });
},
bumpRevision: () => {
  const s = get();
  set({ draft: { ...s.draft, revision: s.draft.revision + 1 }, layoutFingerprint: null });
},
```

- Initial `contentMode: 'text'`.
- `hydratePreferences` sets `contentMode: preferences.shippingLabel?.mode4x6 ?? 'text'`. The optional chaining is deliberate: test mocks and older payloads may lack the key. Use the same defensive read everywhere the renderer reads `preferences.shippingLabel` (darkness → `?? 3`, rememberedCrops → `?? []`).
- `resetDraft` sets `contentMode: 'text'`.
- Export a selector:

  ```ts
  export const selectEffectiveContentMode = (s: LabelState): ContentMode =>
    s.activeProfile === '4x6' ? s.contentMode : 'text';
  ```

### 9.2 `uiStore.ts` changes

- Add `'shipping-crop'` to `DialogType`.
- Add `shippingMessage: { kind: 'error' | 'info'; text: string } | null` and `setShippingMessage(m)`. This is the inline message in the shipping view (FS §4.2 error state, and the "clipboard has text" info).

### 9.3 `shippingStore.ts` — `src/renderer/stores/shippingStore.ts` (implemented in Phase 4)

**The file is the reference.** Read it before Phases 5–6. Its behavior is pinned by `tests/ui/shippingPipeline.spec.ts`. Public API:

```ts
export interface CropDialogState {
  source: LoadedSource;     // a newly loaded PDF, or the current source (Adjust crop)
  isNewSource: boolean;     // true: not the current label yet; Cancel releases it
  initial: CropChoice;      // page, crop, rotation the dialog starts with
  status: string | null;    // FS §4.6 status line
}
export interface ShippingState {
  source: LoadedSource | null;
  choice: CropChoice | null;
  processed: ProcessedShippingImage | null;
  busy: null | 'reading' | 'detecting' | 'processing';
  cropDialog: CropDialogState | null;
  loadBlob(blob, fileName: string | null, origin: 'clipboard' | 'file'): Promise<void>;
  acceptCrop(choice: CropChoice): Promise<void>;
  cancelCrop(): void;
  openAdjustCrop(): void;
  rotate(delta: 90 | -90): Promise<void>;
  reprocess(): Promise<void>;   // after a darkness change
  clear(): void;
}
export const MESSAGES;          // every user-facing string the store produces (FS §4.6, §6)
export function suggestCropForPdf(pdf, pageIndex, { useRemembered, scanAhead }): Promise<{ choice, status }>;
export function findRememberedCrop(size): RememberedCrop | null;
```

**Changes from the original draft of this section (made in Phase 4), and why:**

1. **The crop dialog holds its own pending source.** `source`, `choice` and `processed` change together, and only after a new image has rendered successfully. A PDF waiting in the dialog lives in `cropDialog.source` until it is accepted. This replaces the draft's `previous` variable and `cancelClears` flag: Cancel only releases the pending source, and the old label is never touched.
2. **The mode switches only after a file was read successfully.** The store calls `ensureShippingMode()` (4 × 6 tab, Shipping label mode, and the notice "Shipping labels print on the 4 × 6 printer." when it changed tabs) after the image decodes or the PDF parses. This is FS §6's "nothing changes" rule for failed loads. **The input hook (§10) must therefore not switch modes itself.** It just calls `loadBlob`.
3. **Errors go where they are visible.** In Shipping label mode, they go to `uiStore.shippingMessage` (shown by the shipping view). In Text mode, where that view isn't mounted, they go to the notice bar (`uiStore.setNotice`).
4. **Suggestions for dialog page changes and Auto-detect** use `suggestCropForPdf`. On a page change, call it with `{ useRemembered: true, scanAhead: false }`; for Auto-detect, `{ useRemembered: false, scanAhead: false }`.

Unchanged from the draft: the load and process sequence counters (the newest wins); the 4 × 6-page shortcut; the remembered-crop lookup (±2 pt) and save on accept (PDFs only, most recent first, max 8); the blank-label message; `bumpRevision()` on every commit and on `clear()`; and releasing PDFs, bitmaps and object URLs whenever they are replaced.

---

## 10. Input handling — `src/renderer/hooks/useShippingInput.ts` (new)

Mount once in `App.tsx`: `useShippingInput();`.

```ts
export function useShippingInput(): {
  openFilePicker: () => void;       // used by the toolbar and the drop zone
  pasteFromSystemClipboard: () => Promise<void>; // the Paste button
  fileInput: React.ReactElement;    // hidden <input type="file">, rendered by App
};
```

### 10.1 Guards

Shared function `inputBlocked()` returns true when `uiStore.activeDialog !== 'none'` or `uiStore.isPrintBusy`. When it is true, paste and drop do nothing. (Drop still calls `preventDefault()`, see below.)

### 10.2 Choosing an item from a `DataTransfer`

```ts
function pickSupportedFile(dt: DataTransfer): { file: File | null; total: number; unsupported: File | null } {
  const files = Array.from(dt.files ?? []);
  const supported = files.find((f) => classifyFile(f.name, f.type) !== null) ?? null;
  // Snipping tools put a bitmap on the clipboard as an item, not always as a file:
  if (!supported) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return { file: f, total: Math.max(files.length, 1), unsupported: null };
      }
    }
  }
  return { file: supported, total: files.length, unsupported: supported ? null : files[0] ?? null };
}
```

A file that came from a clipboard image item has a generic name such as `image.png`. Pass `fileName = null` and `origin = 'clipboard'` for anything that came from a `paste` event and is an image; pass the real name and `'file'` for drops and the file picker. A PDF pasted from Explorer/Finder (a copied file) keeps its name and uses `'file'`.

### 10.3 Paste

Register `window.addEventListener('paste', onPaste)` (bubble phase).

```text
onPaste(e):
  if inputBlocked(): return
  const effective = selectEffectiveContentMode(labelState)
  const target = e.target as Element
  const inEditor = target.closest('[role="textbox"][aria-label="Label text editor"]') !== null
  const text = e.clipboardData?.getData('text/plain') ?? ''
  const { file } = pickSupportedFile(e.clipboardData)

  if effective === 'text' and inEditor:
      return   // LabelEditor's own onPaste handles it (see 10.4)
  if file:
      e.preventDefault()
      void shippingStore.loadBlob(file, isImage(file) ? null : file.name, isImage(file) ? 'clipboard' : 'file')
      return
  if effective === 'image' and text.trim() !== '':
      uiStore.setShippingMessage({ kind: 'info', text: 'The clipboard has text, not an image. Switch to Text to paste text.' })
```

The hook does **not** switch tabs or modes: `loadBlob` does that once the file has been read (§9.3, change 2).

### 10.4 Paste inside the text editor — `LabelEditor.tsx`

At the very top of the existing `onPaste` handler, add:

```ts
const plain = e.clipboardData.getData('text/plain');
if (plain === '' && useLabelStore.getState().activeProfile === '4x6') {
  const { file } = pickSupportedFile(e.clipboardData);
  if (file) {
    e.preventDefault();
    // hand off to the shipping flow; the editor unmounts when the mode changes
    void useShippingStore.getState().loadBlob(file, null, 'clipboard'); // loadBlob switches the mode; the editor then unmounts
    return;
  }
}
```

Leave everything else in that handler unchanged. Plain text always wins over an image.

### 10.5 Drag and drop

Register on `window`:

```text
dragover(e):  if e.dataTransfer.types includes 'Files': e.preventDefault(); e.dataTransfer.dropEffect = inputBlocked() ? 'none' : 'copy'; set uiStore.dragActive = true
dragleave(e): if e.relatedTarget === null: dragActive = false
drop(e):
  if !types includes 'Files': return          // text drops keep their normal behavior
  e.preventDefault()                          // never let Electron/Chromium open the file
  dragActive = false
  if inputBlocked(): return
  const { file, total, unsupported } = pickSupportedFile(e.dataTransfer)
  if !file:
     uiStore.setShippingMessage({ kind:'error', text: `Label Maker can't open ${unsupported?.name ?? 'that file'}. Use a PDF or an image (PNG, JPEG, GIF, BMP, WebP).` })
     return
  if total > 1: uiStore.setNotice(`Only one file at a time. Using ${file.name}.`)
  void shippingStore.loadBlob(file, file.name, 'file')
```

Add `dragActive: boolean` and `setDragActive` to `uiStore`. The drop zone uses it for its highlight.

### 10.6 File picker

`fileInput` is `<input ref type="file" accept={ACCEPT_ATTRIBUTE} hidden onChange=…>`. `openFilePicker` resets `value = ''` and calls `click()`. In `onChange`, take `files[0]` and call `loadBlob(file, file.name, 'file')`. `App.tsx` renders `{fileInput}` once.

### 10.7 Paste button

```ts
async function pasteFromSystemClipboard() {
  if (inputBlocked() || !window.api) return;
  const bytes = await window.api.clipboard.readImage();
  if (!bytes) {
    const mac = navigator.platform.toUpperCase().includes('MAC');
    uiStore.setShippingMessage({ kind: 'error', text: mac
      ? 'No image on the clipboard. Take a screen snip first (Cmd+Ctrl+Shift+4).'
      : 'No image on the clipboard. Take a screen snip first (Win+Shift+S).' });
    return;
  }
  await shippingStore.loadBlob(new Blob([bytes], { type: 'image/png' }), null, 'clipboard');
}
```

---

## 11. UI components

All new components use Tailwind classes consistent with `Toolbar.tsx`, `SettingsDialog.tsx`, and `ModalFrame.tsx`, including dark-mode variants. Every button has an accessible name. Every new interactive element must pass the existing axe and keyboard tests (`tests/ui/axe.spec.ts`, `tests/ui/focusVisible.spec.ts`), so reuse the focus-ring classes those components use.

### 11.1 `ContentModeSwitch.tsx` (new, rendered by `Toolbar` right after the profile tabs)

- Render it only when `activeProfile === '4x6'`.
- Markup: `<div role="radiogroup" aria-label="4 × 6 content">` with two `<button role="radio" aria-checked>` items: **Text** and **Shipping label**. Arrow Left/Right move between them (roving `tabIndex`), the same pattern the existing orientation control uses. Copy that control's implementation.
- On change: `labelStore.setContentMode(mode)` and `preferencesStore.updateShipping({ mode4x6: mode })`.

### 11.2 `Toolbar.tsx`

- `const mode = useLabelStore(selectEffectiveContentMode);`
- When `mode === 'image'`, do **not** render the Orientation, Font, Size, and Alignment groups. Render `<ShippingControls />` in their place. Copies, Settings, and Print stay.
- Print button tooltip: when disabled, use the first blocker's message. Add a small map `BLOCKER_MESSAGES: Record<PrintBlocker, string>`, if one does not exist yet, with `'no-image': 'Paste or drop a shipping label first'` and `'image-processing': 'Preparing label…'`. Existing blockers keep whatever text they show today; if there is none today, keep the current tooltip for them.

### 11.3 `ShippingControls.tsx` (new)

Buttons, in order: **Paste**, **Open file…**, **Adjust crop…**, **Rotate left** (icon ⟲, `aria-label="Rotate left"`), **Rotate right** (icon ⟳, `aria-label="Rotate right"`), **Darkness** control, **Clear**.

- Paste → `pasteFromSystemClipboard()`; Open file → `openFilePicker()` (both from `useShippingInput`; pass them down from `App` via props or a small React context, whichever is simpler, but do not register the window listeners twice).
- Adjust crop, Rotate, Clear are disabled when `processed === null` or `busy !== null`.
- **Darkness**: `<input type="range" min=1 max=5 step=1>` with a visible `<label>` "Darkness" and `aria-valuetext` like `"3 of 5"`. On change: `preferencesStore.updateShipping({ darkness })`, then `shippingStore.reprocess()`.

### 11.4 `ShippingLabelView.tsx` (new)

In `App.tsx`, replace `<LabelEditor />` with:

```tsx
{effectiveMode === 'image' ? <ShippingLabelView onOpenFile={openFilePicker} onPaste={pasteFromSystemClipboard} /> : <LabelEditor />}
```

`LabelEditor` is **unmounted** in image mode. This is intentional: if it stayed mounted it would keep measuring and overwrite the image fingerprint. The text is in `labelStore` and survives.

Contents:

- Uses the same container sizing and `calculateFitScale(rect.width, rect.height, '4x6', 'portrait', 48)` approach as `LabelEditor` (copy its `ResizeObserver` block) to size a `384 × 576` box scaled to fit.
- **Empty** (`processed === null && busy === null`): a dashed-border box with the FS §4.2 empty-state text and two buttons (Paste, Open file…). It gets highlight classes when `uiStore.dragActive`. The whole box is not a button. Only the two real buttons are focusable.
- **Busy**: a spinner and `Reading PDF…` (`busy === 'reading'` with a PDF), `Finding the label…` (`'detecting'`), or `Preparing label…` (otherwise). Wrap it in `role="status"`.
- **Ready**: `<img src={processed.objectUrl} alt="Shipping label preview" width=384 height=576 style={{ imageRendering: 'pixelated' }} />` inside a white sheet with a 1 px slate outline. Under it, the caption, then the amber warnings (FS §4.2 table) for `lowResolution`, `offAspect`, and `offScale`.
- **Message**: if `uiStore.shippingMessage`, render it under the preview (`role="alert"` for errors, `role="status"` for info) with a Dismiss button.

### 11.5 `CropDialog.tsx` (new)

Rendered by `App` when `activeDialog === 'shipping-crop' && shippingStore.cropDialog`. Use `ModalFrame` (`labelledBy` = the title id, `onEscape` = `cancelCrop`). Size it to about 90vw × 90vh.

**Local state:** `pageIndex`, `crop: FracRect`, `rotation: Rotation`, `status: string | null`, all initialized from `cropDialog.initial` and `cropDialog.status`; plus `pageCanvasUrl`, `pageAspect` (w/h), `thumbUrl`.

**Page display.**

1. Measure the available area with a `ResizeObserver`.
2. Render the page:
   - PDF: `dpi = 72 * displayScale * window.devicePixelRatio`, where `displayScale = min(areaW / pageWpt, areaH / pageHpt)`. Then `renderPage(pageIndex, dpi)`, convert to a blob URL, and show it with `<img>` at CSS size `pageWpt * displayScale × pageHpt * displayScale`. Revoke the old URL on change. Re-render on page change and when the area grows by more than 25%; don't re-render on every resize pixel.
   - Image: draw the bitmap to a canvas once, blob URL, same display math using pixels.
3. The overlay is an absolutely positioned `<div>` over the image with four dim panels (`bg-black/40`) around the crop box, the box itself (`border-2` accent color), and 8 handles (`10 × 10 px`, `cursor` set to the matching resize cursor).

**Pointer interaction** (pointer events with `setPointerCapture`):

- `pointerdown` on a handle → mode `resize-<edge>`; inside the box → `move`; elsewhere on the page → `draw`, anchored at the pointer.
- `pointermove` → compute the new rect in fractions (pointer px ÷ displayed size). Normalize negative width/height when drawing. Apply `clampFracRect(r, minW, minH)`, where `minW = 0.5 * 72 / pageWpt` and `minH = 0.5 * 72 / pageHpt` for PDFs, or `40 / imgW` and `40 / imgH` for images.
- `pointerup` → schedule the thumbnail update (below).

**Keyboard.** The crop box element: `tabIndex={0}`, `role="group"`, `aria-label="Label area"`, `aria-describedby` pointing at a visually hidden hint: "Arrow keys move the area. Shift and arrow keys resize it."

- Arrow keys: move by 0.01 in that direction.
- Shift+ArrowRight / Shift+ArrowLeft: change `width` by ±0.01. Shift+ArrowDown / Shift+ArrowUp: change `height` by ±0.01.
- Always clamp, and `preventDefault` for handled keys.

**Thumbnail.** Debounce 200 ms after any change of `crop`, `rotation`, or `pageIndex`: `renderPreviewThumbnail(source, { pageIndex, crop, rotation }, darkness)` → `toBlob` → URL → show at 120 × 180 CSS px with `image-rendering: pixelated`. Ignore stale results using a local sequence counter.

**Readout** under the thumbnail:

- PDF: `` `Label area ${(crop.width * pageWpt / 72).toFixed(2)} × ${(crop.height * pageHpt / 72).toFixed(2)} in · prints at ${pct}%` ``, where `pct` comes from `fitToLabel` exactly as in §8.2 step 8.
- Image: `` `Label area ${Math.round(crop.width * imgW)} × ${Math.round(crop.height * imgH)} px · about ${dpi} dpi` ``.

**Bottom bar buttons** (FS §4.6):

- Page `‹` / `›` (`aria-label="Previous page"` / `"Next page"`, disabled at the ends, hidden for single-page PDFs and images) and the text `Page N of M`. On page change: look for a remembered crop for that page size; else run detection (at `ANALYSIS_DPI`); else use the content area. Set `status` the same way `loadBlob` does.
- **Rotate left / Rotate right**: change `rotation` with `addRotation`.
- **Auto-detect**: run detection on the current page. On `null`, use the content area plus the "Couldn't find…" status.
- **Whole page**: crop `{ 0, 0, 1, 1 }`.
- **Cancel** → `cancelCrop()`.
- **Use this area** (primary, `data-autofocus`) → `acceptCrop({ pageIndex, crop, rotation })`.

Expose the crop for tests: put `data-testid="crop-box"` on the box and `data-crop={`${x.toFixed(3)},${y.toFixed(3)},${w.toFixed(3)},${h.toFixed(3)}`}` on it.

### 11.6 `SettingsDialog.tsx`

Add a section titled **Shipping labels** after the existing profile sections, using the same section markup. It contains one button: `` `Forget ${n} remembered label area${n === 1 ? '' : 's'}` ``, disabled when `n === 0`. Clicking it calls `updateShipping({ rememberedCrops: [] })`.

### 11.7 `App.tsx`

1. `useShippingInput()`; render its `fileInput`.
2. Content switch per §11.4. Render `<CropDialog />` per §11.5.
3. **Image fingerprint effect:**

   ```ts
   const effectiveMode = useLabelStore(selectEffectiveContentMode);
   const processed = useShippingStore((s) => s.processed);
   const revision = useLabelStore((s) => s.draft.revision);
   const setLayoutFingerprint = useLabelStore((s) => s.setLayoutFingerprint);
   useEffect(() => {
     if (effectiveMode === 'image' && processed) setLayoutFingerprint(IMAGE_LAYOUT_FINGERPRINT, revision);
   }, [effectiveMode, processed, revision, setLayoutFingerprint]);
   ```

4. **Close guard:** `const labelHasContent = draft.text.trim().length > 0 || processed !== null;`. Pass it to `setLabelHasText` (keep the IPC name).
5. **`handlePrintClick`:** after the existing guard checks, build the snapshot by mode:

   ```ts
   const isImage = selectEffectiveContentMode(useLabelStore.getState()) === 'image';
   const shipping = useShippingStore.getState().processed;
   if (isImage && !shipping) return;
   const snapshot: PrintSnapshot = isImage
     ? {
         requestId: crypto.randomUUID(),
         draftRevision: draft.revision,
         contentKind: 'image',
         text: '',
         profile: '4x6',
         orientation: 'portrait',
         resolvedFontFamily: draft.resolvedFontFamily,
         fontSizePt: draft.fontSizePt,
         alignment: draft.alignment,
         copies: draft.copies,
         expectedLayout: IMAGE_LAYOUT_FINGERPRINT,
         image: { pngBase64: shipping!.pngBase64, widthPx: 812, heightPx: 1218 },
       }
     : { /* existing text snapshot */ contentKind: 'text', ... };
   ```

6. **Restore defaults:** this already resets preferences; `createDefaultPreferences()` now includes `shippingLabel`. After `hydratePreferences(reset, true)`, the mode becomes Text. The shipping image stays loaded (as text does). Update the confirm message to: "This will reset both label profiles, their printer selections, formatting, and shipping-label settings to initial defaults. Your current label will be preserved."

### 11.8 `usePrintBlockers.ts`

Extend the type: `| 'no-image' | 'image-processing'`. Logic:

```ts
const mode = useLabelStore(selectEffectiveContentMode);
const hasImage = useShippingStore((s) => s.processed !== null);
const shippingBusy = useShippingStore((s) => s.busy !== null);

if (mode === 'image') {
  if (!hasImage) blockers.push('no-image');
  if (shippingBusy) blockers.push('image-processing');
} else {
  if (text.trim().length === 0) blockers.push('no-text');
  if (!parseFontSizeInput(fontSizeDraft).ok) blockers.push('invalid-font-size');
}
// unchanged for both modes: busy, no-printer, layout-pending, invalid-copies
```

### 11.9 Main-process close message — `src/main/index.ts`

In `confirmClose`, change the `hasText` detail to: `'Label Maker does not save labels, so this label can't be reopened. Jobs already queued will still print.'`

---

## 12. Print path

### 12.1 `PrintService.prepare` — `src/main/services/printService.ts`

At the top of `prepare`, after the busy check, add:

```ts
if (snapshot.contentKind === 'image') {
  const bytes = Buffer.from(snapshot.image!.pngBase64, 'base64');
  const dims = readPngDimensions(bytes);
  if (!dims || dims.width !== SHIPPING_WIDTH_PX || dims.height !== SHIPPING_HEIGHT_PX) {
    throw new Error('The shipping label image is not a valid 4 × 6 label image.');
  }
}
```

Nothing else in `prepare` or `confirm` changes. The fingerprint comparison passes because both sides report `IMAGE_LAYOUT_FINGERPRINT`. The print options stay the 4 × 6 options (`pageSize 101600 × 152400`, `landscape: false`, no margins, `scaleFactor: 100`). Check that the existing `console.warn` in `prepare` does not print the snapshot object. It prints only profile and line counts today; keep it that way.

### 12.2 `PrintDocument.tsx`

1. Add `const imageRef = useRef<HTMLImageElement>(null);`.
2. In the measurement effect, branch first:

   ```ts
   if (snapshot.contentKind === 'image') {
     const img = imageRef.current;
     if (!img) return;
     try { await img.decode(); } catch { return; } // main's preparation timeout reports the failure
     await new Promise<void>((r) => requestAnimationFrame(() => r()));
     if (cancelled) return;
     window.printApi.reportReady(snapshot.requestId, IMAGE_LAYOUT_FINGERPRINT);
     return;
   }
   ```

3. In the render, before the text return:

   ```tsx
   if (snapshot.contentKind === 'image' && snapshot.image) {
     return (
       <>
         <style>{`@page { size: 4in 6in; margin: 0; } @media print { html, body { width: 384px !important; height: 576px !important; } }`}</style>
         <div className="print-page print-page-4x6" style={{ width: '384px', height: '576px', overflow: 'hidden' }}>
           <div className="label-sheet-portrait">
             <img
               ref={imageRef}
               className="shipping-label-image"
               src={`data:image/png;base64,${snapshot.image.pngBase64}`}
               alt=""
             />
           </div>
         </div>
       </>
     );
   }
   ```

4. `src/renderer/label/label.css`: add

   ```css
   .shipping-label-image {
     display: block;
     width: 384px;
     height: 576px;
     image-rendering: pixelated;
   }
   ```

### 12.3 `src/preload/print.ts`

No change. The snapshot type gained fields only.

---

## 13. Security

### 13.1 Content Security Policy

Update the `<meta http-equiv="Content-Security-Policy">` in **both** `index.html` and `print.html`. Add these two directives and change nothing else:

```text
img-src 'self' labelmaker: data: blob:;
worker-src 'self' labelmaker:;
```

- `data:` is needed by the print page's `<img>` and `blob:` by the preview and the crop dialog.
- `worker-src` covers the pdf.js worker.
- Do **not** add `'unsafe-eval'`. pdf.js 6 never uses eval (verified in Phase 0).
- If, and only if, the Phase 0 spike shows pdf.js needs WebAssembly for a real label PDF, add `'wasm-unsafe-eval'` to `script-src` in `index.html` only, and write down why in §16.

The dev server strips the CSP (see `vite.config.ts`), so CSP problems only show up in `npm run test:electron` and the packaged app. That is why Phase 0 and Phase 7 include Electron checks.

### 13.2 Other rules

- No new Electron permissions. The Paste button uses IPC (§7.5), not `navigator.clipboard.read()`.
- The window-level `drop` handler always calls `preventDefault()` for file drags, so a dropped PDF can never navigate the window. `will-navigate` is already blocked in `src/main/index.ts` as a second line of defense.
- Main never parses PDF or image content. It only reads the 24-byte PNG header (§12.1).
- IPC payload size: the image is at most `MAX_SHIPPING_PNG_BASE64_LENGTH` characters, enforced by the schema.
- No disk writes, no logging of content (rule 0.5).

---

## 14. Tests

### 14.1 Fixtures — `scripts/make-shipping-fixtures.mjs` (new) and `tests/fixtures/shipping/` (committed)

Write a Node script using `pdf-lib` that generates **synthetic** PDFs. Never use a real label. Every fixture prints the words `SAMPLE — NOT A REAL LABEL` and fake addresses only. Draw "barcodes" as runs of black rectangles of varying widths. Generate:

| File | Page | Content |
| --- | --- | --- |
| `ebay-letter.pdf` | 612 × 792 pt | A 288 × 432 pt label with a 1 pt border at (36, 36) from top-left; inside: 3 text lines, a barcode block 200 × 60 pt, a 2D-code square 80 × 80 pt. Below it from y = 500 pt: a packing-slip table (5 rows of text and 0.5 pt rules spanning x 36–576). |
| `ups-letter.pdf` | 612 × 792 pt | A landscape 432 × 288 pt label at (90, 40) with barcode and text; a dashed line across the full width at y = 396 pt (dash 6, gap 4, 1 pt); instruction text paragraphs from y = 430 to 740 pt. |
| `label-4x6.pdf` | 288 × 432 pt | Label content filling the page with 7 pt margins. |
| `label-6x4.pdf` | 432 × 288 pt | Same, landscape. |
| `two-page.pdf` | 2 × letter | Page 1: only a packing-slip table. Page 2: the eBay-style label. |
| `no-label.pdf` | letter | One 504 × 144 pt text block. |
| `encrypted.pdf` | letter | Any content, saved with a user password. If `pdf-lib` cannot encrypt, commit a small password-protected PDF made another way and note its origin in the script comment. |

pdf-lib's origin is bottom-left. Convert the top-left coordinates above with `y_pdf = pageHeight - y - height`. Run the script once and commit the generated files. Add an npm script `"fixtures:shipping": "node scripts/make-shipping-fixtures.mjs"`.

### 14.2 Unit tests (Vitest, node)

- `tests/unit/shippingAnalysis.test.ts` — §6.8.
- `tests/unit/shippingShared.test.ts` — `readPngDimensions`, `fitToLabel`, `clampFracRect`, `rotatedSize`, `addRotation`, `isOffAspect`, `bytesToBase64` (compare with `Buffer.from(...).toString('base64')`).
- `tests/unit/fileTypes.test.ts` — `classifyFile`.
- `tests/unit/schemas.test.ts`, `tests/unit/settingsService.test.ts`, `tests/unit/preferencesRepair.test.ts` — §5.4.
- `tests/unit/printService.test.ts` — add: an image snapshot with a valid 812 × 1218 PNG header prepares and prints with the 4 × 6 page options; one with a 100 × 100 header throws `not a valid 4 × 6 label image`; an image job never adds `overflow_clipped`. Build the PNG header bytes by hand in the test (signature + IHDR length/type + width/height + 5 bytes); `readPngDimensions` only reads the header.

### 14.3 Browser UI tests (Playwright, mocked bridge) — `tests/ui/shippingLabel.spec.ts` (new)

Helpers in the spec:

- `makePngInPage(page, wPx, hPx, draw)`: creates a canvas in the page, draws (white background, black rects), and returns a `File` handle via `page.evaluateHandle`.
- `pasteFile(page, fileHandle)`: in the page, `const dt = new DataTransfer(); dt.items.add(file); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))`. Use `document.body` if nothing is focused.
- `dropFile(page, path)`: read the fixture in Node, pass the bytes into the page, build a `File` and a `DataTransfer`, and dispatch `dragover` then `drop` (`DragEvent`) on `document.body`.
- For **Open file…**, use `page.setInputFiles('input[type=file]', fixturePath)`.

Cases (map to FS §7):

1. **S01** mode switch visible on 4 × 6, hidden on 2 × 1; keyboard arrows switch; text typed before switching is still there after switching back.
2. **S02** paste a 600 × 900 snip with a 30 px gray (#525659) frame → preview `img` present; Print enabled; no dialog.
3. **S03** in Text mode, focus the editor and paste a DataTransfer with both `text/plain` and an image → text inserted, still Text mode. Paste an image-only DataTransfer → Shipping label mode with a preview.
4. **S04** paste a 900 × 600 snip → preview present. Check the rotation by reading the preview pixels: draw the preview `img` to a canvas in the page and assert a black marker drawn in the snip's top-left corner ends up in the top-right of the output.
5. **S05** paste a 300 × 450 snip → low-resolution warning visible.
6. **S06** `ebay-letter.pdf` via file input → dialog open; `data-crop` within ±0.03 of `0.049,0.038,0.489,0.560` (measured in Phase 2 from the pdf.js render of this fixture at `ANALYSIS_DPI`). Use this area → preview present; Print enabled.
7. **S07** `ups-letter.pdf` → `data-crop` within ±0.03 of `0.139,0.044,0.722,0.378` (measured in Phase 2), so not extending below the fold line at y = 396/792 = 0.5; after Use this area, the output is portrait (check the preview's natural size is 812 × 1218 and the rotation marker as in case 4).
8. **S08** `label-4x6.pdf` and `label-6x4.pdf` → no dialog; preview present.
9. **S09** `two-page.pdf` → dialog shows `Page 2 of 2` and `Found a label on page 2.`
10. **S10** `no-label.pdf` → "Couldn't find a 4 × 6 label…" status.
11. **S11** crop editing: drag a handle with `page.mouse` → `data-crop` width changes; the box cannot be dragged past the page edge; arrow keys move it by 0.01; Whole page → `0.000,0.000,1.000,1.000`.
12. **S12** accept a crop on `ebay-letter.pdf`, clear, load it again → dialog shows the "Using the area you chose last time…" status and the same `data-crop`. Assert the mock's `preferences.update` payload contained `shippingLabel.rememberedCrops` length 1. Settings → Forget → payload with an empty list.
13. **S13** Darkness change → the preview `src` changes and `preferences.update` was called with the new darkness.
14. **S16** Print disabled with no image (tooltip `Paste or drop a shipping label first`); Ctrl+P does nothing.
15. **S15** with an image loaded, click Print → the mock's `print.prepare` received `contentKind: 'image'`, `profile: '4x6'`, `orientation: 'portrait'`, `text: ''`, and an image whose decoded PNG header is 812 × 1218.
16. **S17** unsupported file (`.txt`) → error message; `encrypted.pdf` → password message; the previous preview is still shown in both cases.
17. Accessibility: run the existing axe helper on the empty view, the loaded view, and the open crop dialog. No violations.

Extend `tests/ui/support/mockApi.ts` so `print.prepare` records its argument (if it doesn't already) and `preferences.update` payloads are recorded for assertions.

### 14.4 Print document tests — extend `tests/ui/printDocument.spec.ts`

Add an image job (extend `makeJob` in `tests/ui/support/printPage.ts` with an optional `image`), using an 812 × 1218 PNG generated in the page. Assert that:

- the page reports `IMAGE_LAYOUT_FINGERPRINT`;
- the exported PDF (same method the existing tests use) has exactly one page of 288 × 432 pt.

### 14.5 Electron tests — `tests/electron/shippingLabel.spec.ts` (new)

Against the built app (real CSP, real protocol, real pdf.js worker):

1. Collect console messages; load `ebay-letter.pdf` via the file input; the crop dialog opens. Accept; the preview appears. Assert **no** console message contains `Content Security Policy` or `Refused to`.
2. Write a PNG to the system clipboard from the test (`app.evaluate(async ({ clipboard, ClipboardItem }, bytes) => clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)]) })]), png)`); click **Paste**; the preview appears. The bridge-level clipboard tests already exist in `tests/electron/shippingLabel.spec.ts` (Phase 3), including a Windows test that writes a bitmap the way Snipping Tool does. Each test saves and restores the user's clipboard; keep that pattern.
3. With a fake or no printer, do not submit a real job. Only assert that `print:prepare` succeeds through the real main validation, if the existing Electron tests have a pattern for that; otherwise skip this step.

Follow the existing setup in `tests/electron/support/app.ts`.

---

## 15. Implementation phases and gates

Each phase ends with the checks in rule 0.2 and a local commit (rule 0.3).

| Phase | Work | Gate (must be true before the next phase) |
| --- | --- | --- |
| **0. Spike** | §2 (install, `vite-env.d.ts`, asset copy script); a temporary dev-only button that loads a fixture PDF with `loadPdf` and shows page 1. Generate the fixtures (§14.1). Update the CSP (§13.1). | `npm run build:app` succeeds; in `npm run dev` **and** in the built app (`npm run test:electron` with a temporary test, or `npx electron .` after build) the PDF page renders with no CSP errors in the console. Record the pdf.js version and any CSP additions in §16. **Remove the temporary button before committing.** |
| **1. Shared** | §3, §4, §5 (constants, contracts, schemas, defaults, repair, settings service, preferences store) and their unit tests. Add `contentKind: 'text'` to existing snapshot builders (§4.4). | All existing tests still pass, plus the new unit tests. |
| **2. Analysis** | §6 and §6.8 tests; `fileTypes.ts` and its test. | Unit tests pass. |
| **3. Sources** | §7 (pdfSource, imageSource, clipboard IPC, preload, mock). | Typecheck and lint pass. |
| **4. Render + stores** | §8, §9. | Typecheck, lint, and unit tests pass. |
| **5. UI** | §10, §11.1–11.4, §11.6–11.9. (Until Phase 6, a PDF load that needs the dialog may just accept the suggestion automatically; leave a `TODO(phase 6)` comment.) | Manual check in `npm run dev`: snip paste works, mode switch works, text mode unchanged. All existing UI tests pass. |
| **6. Crop dialog** | §11.5; remove the Phase 5 TODO. | Manual check with each fixture. |
| **7. Print path** | §12, §11.7 step 5. | Unit and print-document tests pass. |
| **8. Tests** | §14.3, §14.5, plus anything still missing from §14. | Full suite passes: `typecheck`, `lint`, `test:unit`, `test:ui`, `build:app`, `test:electron`. |
| **9. Docs** | Update `FUNCTIONAL_SPEC.md` §1: in "Excluded", change "Images, barcodes…" to say images are excluded **except** the 4 × 6 Shipping label mode, with a link to this spec. Add a short "Shipping labels" section to `README.md` (paste a snip or drop a PDF). Fill in §16. | Docs committed. |
| **10. Hardware (manual, owner)** | FS S20 on the real SP410. | Owner records the results. |

---

## 16. Recorded versions and decisions (fill in during implementation)

| Item | Value |
| --- | --- |
| `pdfjs-dist` version | **6.5.438** (exact pin; engines `>=22.13.0 \|\| >=24`) |
| `pdf-lib` version (dev only) | **1.17.1** |
| Worker file used | `pdfjs-dist/build/pdf.worker.min.mjs?url`, emitted as `dist/assets/pdf.worker.min-<hash>.mjs` |
| pdf.js 6 API differences from older docs | No `isEvalSupported` option. `page.render` takes `canvas` (`canvasContext` is deprecated). `PDFDocumentProxy` has no `destroy()`; call `loadingTask.destroy()`. Wrong password throws `name === 'PasswordException'`. |
| CSP additions beyond §13.1 (with reason) | None. Phase 0 (Nov 17, 2026): `ebay-letter`, `label-4x6`, `two-page`, and `encrypted` fixtures loaded in the built Electron app with zero console messages. |
| WebAssembly (`'wasm-unsafe-eval'`) | Not added. The wasm path (JBIG2/JPX image decoders) is untested because no fixture contains such images. `public/pdfjs/wasm/` includes pdf.js's non-wasm JS fallbacks. If a real label PDF fails to render its barcode image, test that first. |
| `standard_fonts` needed by any fixture or real label? | Fixtures embed Helvetica via pdf-lib, so they don't exercise it. The folder is copied and the URL is set anyway. |
| Electron clipboard API | Electron 45 has no `clipboard.readImage()`. Use `await clipboard.read()` and `item.getType('image/png')`. A Windows bitmap (CF_DIB, what Win+Shift+S leaves) is offered as `image/png`: verified in Phase 3 with .NET `Clipboard.SetImage`. |
| Rendering check | A 4 × 6 page at scale 203/72 renders to exactly 812 × 1218 px. |
| UI tests on this machine | The installed `@playwright/test` wants browser build 1255, which isn't downloaded. Either run `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome. |
| Physical test (S20): OS, driver, app version, result | _(owner)_ |

---

## 17. Troubleshooting notes for the implementer

- **The preview is blurry or barcodes look soft.** Check that `rotateCanvas` uses `setTransform` with integer offsets and that `imageSmoothingEnabled = false` is set on the rotate and compose canvases. Only the image-source scaling step (§8.2 step 3) may smooth.
- **PDF text is missing or in the wrong font.** `standardFontDataUrl` is wrong. It must end with `/` and point at the copied `pdfjs/standard_fonts/`.
- **"Setting up fake worker" warning, or the worker fails to load in the packaged app.** `workerSrc` is not set before `getDocument`, or `worker-src` is missing from the CSP.
- **Print button stays disabled after an image loads.** The fingerprint effect (§11.7 step 3) is not running, or `bumpRevision` was called after it ran without the effect re-running. The effect depends on `revision`, so it should re-run; check the selector.
- **The text editor's overflow outline flashes when switching modes.** `LabelEditor` must be unmounted in image mode (§11.4), not hidden.
- **Dropping a PDF opens it in the window.** The window `dragover` handler must call `preventDefault()` for file drags. Without that, Chromium does not fire `drop` at all.
- **Ctrl+V does nothing in Shipping label mode.** The `paste` event only fires when the document has focus. Make sure the shipping view or the toolbar holds focus (clicking anywhere in the window is enough). The listener is on `window`, not on a specific element.

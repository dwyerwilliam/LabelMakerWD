# Label Maker — Shipping Label Mode: Functional Specification

- **Version:** v1 draft · November 17, 2026
- **Applies to:** the **4 × 6** profile (iDPRT SP410 family) only
- **Companion:** [SHIPPING_LABEL_TECHNICAL_SPEC.md](SHIPPING_LABEL_TECHNICAL_SPEC.md) (how to build it)
- **Baseline:** [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md). Everything there still applies unless this document says otherwise.

## 1. Purpose

The user receives prepaid shipping labels (FedEx, UPS, USPS, eBay, Pirate Ship, and similar) in two forms:

1. **A screen snip** (Windows `Win + Shift + S`, macOS `Cmd + Shift + 4` with Control so it goes to the clipboard), taken from a label shown in a PDF viewer, email, or web page. The snip is an image on the clipboard and is usually close to 4 × 6 portrait already.
2. **A PDF file**, often an 8.5 × 11 in page where the label shares the page with other content: a packing slip (eBay), instructions and a fold line (UPS, FedEx), or a receipt. Sometimes the PDF page is already exactly 4 × 6.

Shipping Label mode turns either input into **one 4 × 6 portrait label**, printed on the SP410 at true size in pure black and white. Only the label itself prints, never the packing slip or the rest of the page.

## 2. Decisions made with the product owner

| Decision | Choice |
| --- | --- |
| Where the feature lives | A **Text / Shipping label** mode switch inside the existing **4 × 6** tab. No new tab or profile. |
| How the label is found in a PDF | **Auto-detect, then review**: the app suggests a crop box; the user can adjust it and must accept it before anything prints. |
| How the label fits on the stock | **Fill the full 4 × 6** page, keeping the aspect ratio and centering it. The text-mode ⅛ in safe inset does **not** apply. |
| Remembering crops | **Remember the last accepted crop for each PDF page size** and suggest it first next time, ahead of auto-detect. Only the geometry is stored, never images. |

## 3. Scope

Included:

- Paste an image from the clipboard (Ctrl+V / Cmd+V, or a **Paste** button).
- Drop a PDF or an image file onto the window, or choose one with **Open file…**.
- Supported files: PDF, PNG, JPEG, GIF, BMP, WebP. One file at a time.
- Auto-detect the label on a PDF page, with a crop review dialog.
- Remember the last accepted crop for each PDF page size.
- Rotate the label in 90° steps.
- Convert to pure black and white at the printer's 203 dpi, with a 5-step **Darkness** control.
- Show a preview of exactly what will print.
- Copies 1–99, the existing printer selection, status, confirmations, and print pipeline.

Excluded (v1):

- The 2 × 1 (SP310) profile. Shipping labels are 4 × 6 only.
- Printing more than one label from one PDF in a single action (for example two labels side by side on one page). The user crops and prints each one in turn.
- Password-protected PDFs.
- Editing label content (adding text, covering parts, redaction).
- Saving, exporting, or reopening shipping labels. No label image or PDF is ever written to disk.
- Reading barcodes, tracking numbers, or addresses (no OCR, no barcode decoding).
- Automatic fetching of labels from carrier or marketplace accounts.
- Landscape 6 × 4 output. Shipping labels always print portrait. A landscape source is rotated to portrait.

## 4. User experience

### 4.1 Mode switch

When the **4 × 6** tab is active, the toolbar shows a two-option segmented control right after the profile tabs:

`[ Text ]  [ Shipping label ]`

- **Text** is the existing editor, unchanged.
- **Shipping label** replaces the text editor area with the shipping-label view (§4.2). It also replaces the toolbar's Orientation, Font, Size, and Alignment controls with the shipping controls (§4.4). Copies, Settings, and **Print 4 × 6** stay where they are.
- The text draft is kept when switching to Shipping label and comes back when switching back. The undo history of the text editor may reset when the mode changes; the text itself must not change.
- The shipping image is kept while switching modes or tabs for the rest of the session.
- The selected mode is saved and restored on the next launch. The image is not.
- On the **2 × 1** tab the mode switch is hidden and the text editor is always shown.

### 4.2 Shipping-label view

**Empty state** (no image loaded): a large dashed drop zone the size of the 4 × 6 preview, reading:

> **Paste a screen snip or drop a label PDF here**
> Ctrl+V to paste (⌘V on Mac) · PDF, PNG, JPEG, GIF, BMP, WebP
> [ Paste ]  [ Open file… ]

The drop zone highlights while a file is dragged over the window.

**Loaded state**: the 4 × 6 portrait preview shows the processed black-and-white image, exactly the pixels that will be sent to the printer. It is scaled to fit the window like the text preview and has a thin page outline. Under the preview, one line of caption:

- PDF source: `From <file name>, page N · prints at NN% of original size` (or `· actual size` when 97–103%).
- Image source: `From clipboard snip · about NNN dpi` or `From <file name> · about NNN dpi`.

Warnings appear under the caption in amber when they apply (they inform; they do not block printing):

| Condition | Warning |
| --- | --- |
| Image source below 150 dpi effective | **Low-resolution snip (about N dpi). Barcodes may not scan.** For a sharper label, zoom the PDF to 200% before snipping, or drop the PDF file instead. |
| Aspect ratio more than 12% away from 4 × 6 | **This doesn't look like a 4 × 6 label.** It will print centered with white space around it. Use Adjust crop to fix the area. |
| PDF label printed below 90% or above 110% of its original size | **This label prints at NN% of its original size.** Check that the crop includes only the label. |

**Busy state**: while a file is read, a page is rendered, or the image is processed, the view shows a spinner and the text `Reading PDF…`, `Finding the label…`, or `Preparing label…`. Print is disabled while busy.

**Error state**: a red message in the view with `role="alert"`. The previous image, if any, stays loaded (see §6).

### 4.3 Getting a label in

| Action | Behavior |
| --- | --- |
| **Ctrl+V / Cmd+V** in Shipping label mode, no dialog open | If the clipboard holds an image or a supported file, load it. If it holds only text, show `The clipboard has text, not an image. Switch to Text to paste text.` |
| **Ctrl+V / Cmd+V** in Text mode on 4 × 6, inside the text editor | If the clipboard has plain text, paste the text as today. Otherwise, if it holds an image or a supported file, switch to Shipping label mode and load it. |
| **Ctrl+V / Cmd+V** in Text mode on 4 × 6, focus outside the editor | If the clipboard holds an image or a supported file, switch to Shipping label mode and load it. Otherwise nothing changes. |
| **Paste** button | Reads an image from the system clipboard. If there is none, show `No image on the clipboard. Take a screen snip first (Win+Shift+S).` (on macOS: `…(Cmd+Ctrl+Shift+4)`). |
| **Open file…** button | The system file dialog, filtered to supported types. |
| Drop a supported file anywhere on the window | Load it. On the 2 × 1 tab, or in Text mode, first switch to the 4 × 6 tab in Shipping label mode and show the notice `Shipping labels print on the 4 × 6 printer.` |
| Drop or paste an image or file on the 2 × 1 tab | Same: switch to 4 × 6 / Shipping label and load it, with the same notice. |
| Drop several files | Use the first supported file and show `Only one file at a time. Using <name>.` |
| Drop an unsupported file | `Label Maker can't open <name>. Use a PDF or an image (PNG, JPEG, GIF, BMP, WebP).` Nothing else changes. |
| Drop text, not a file | Ignored in Shipping label mode; unchanged behavior in Text mode. |
| Load while an image is already loaded | Replaces the current image without asking. Re-pasting brings it back. |

Paste, drop, and Open file are ignored while any dialog is open, and while a print job is being prepared or sent.

### 4.4 Shipping controls (toolbar, Shipping label mode only)

| Control | Behavior |
| --- | --- |
| **Paste** | As in §4.3. |
| **Open file…** | As in §4.3. |
| **Adjust crop…** | Opens the crop dialog (§4.6) on the current source. Disabled with no image. |
| **Rotate left / Rotate right** (icon buttons with accessible names) | Rotates the label 90° and re-processes. Disabled with no image. |
| **Darkness** (1–5, default 3) | A 5-step slider or segmented control labeled **Darkness**. Higher prints more pixels black (thicker text and bars). Saved as a preference. Re-processes immediately. |
| **Clear** | Removes the image and returns to the empty state. No confirmation. |
| **Copies** | Unchanged (1–99, session only). |
| **Print 4 × 6** | Unchanged label and shortcut (Ctrl+P / Cmd+P). |

### 4.5 What happens with each kind of input

**A. Clipboard snip or image file** (PNG, JPEG, …):

1. Decode the image.
2. **Trim the border automatically.** Remove outer bands of uniform color: white margins and the gray background of a PDF viewer around the page. Stop at the first band that has content or is near-black (so a label's black border is kept).
3. **Auto-rotate**: if the trimmed area is clearly wider than tall (width > 1.1 × height), rotate it 90° clockwise to portrait.
4. Fit to 4 × 6 and convert to black and white (§4.7). Show the preview. **No dialog** opens. The user trusted the snip boundary; **Adjust crop…** is there if needed.

**B. PDF whose page is already 4 × 6** (within 0.15 in, either orientation):

1. Use the whole page. Rotate 90° clockwise when the page is 6 × 4.
2. Fit, convert, preview. **No dialog** opens. **Adjust crop…** is available.

**C. Any other PDF** (letter, A4, …):

1. Choose a page and a suggested crop, in this order:
   1. If a remembered crop exists for this page size (§4.8), use it on page 1.
   2. Otherwise run auto-detect on page 1. If it finds nothing, try pages 2–5 in order and use the first page where it finds a label.
   3. If nothing is found, suggest the content area of page 1 and say `Couldn't find a 4 × 6 label on this page. Drag the box around the label.`
2. Open the **crop dialog** (§4.6) with the suggestion. Nothing prints until the user presses **Use this area**.
3. On **Use this area**, process (§4.7), show the preview, and remember the crop for this page size.
4. On **Cancel**: if there was no image before, return to the empty state; otherwise keep the previous image.

### 4.6 Crop dialog

A modal dialog titled **Choose the label area**, about 90% of the window, using the app's existing modal frame (focus trap, Escape cancels).

Layout:

- **Left / main area**: the page, rendered sharply and fitted to the space. Outside the crop box it is dimmed. The crop box has a 2 px accent border and eight square handles (corners and edge midpoints).
- **Right column**: a live **4 × 6 output preview** (a small portrait thumbnail in black and white) that updates about 200 ms after the box stops moving. Below it, a readout:
  - PDF: `Label area 4.02 × 6.01 in · prints at 100%`
  - Image: `Label area 812 × 1220 px · about 203 dpi`
- **Status line** (when relevant): `Using the area you chose last time for this page size.` / `Found a label on page 2.` / `Couldn't find a 4 × 6 label on this page. Drag the box around the label.`
- **Bottom bar**: `‹ Page 1 of 3 ›` (only for multi-page PDFs) · **Rotate left** · **Rotate right** · **Auto-detect** · **Whole page** · spacer · **Cancel** · **Use this area** (primary, focused when the dialog opens, so Enter accepts).

Interaction:

| Input | Effect |
| --- | --- |
| Drag inside the box | Move it. |
| Drag a handle | Resize from that edge or corner. |
| Drag on the page outside the box | Draw a new box. |
| Box limits | Always inside the page. Minimum 0.5 × 0.5 in for PDFs, 40 × 40 source pixels for images. |
| Focus the box (Tab), then Arrow keys | Move the box by 1% of the page. |
| Shift + Arrow keys | Move the right edge (←/→) or bottom edge (↑/↓) by 1% of the page. |
| Page ‹ › | Change page. Apply the remembered crop for that page size if there is one, otherwise run auto-detect. |
| **Auto-detect** | Run detection on the current page, ignoring any remembered crop. |
| **Whole page** | Set the box to the whole page. |
| **Rotate left / right** | Change the output rotation; the thumbnail updates. The page view itself does not rotate. |
| **Use this area** | Accept, close, process, remember (PDFs only). |
| **Cancel** / Escape | Close without changes (see §4.5 C.4). |

The crop box has `role="group"`, the accessible name **Label area**, and an `aria-describedby` hint that explains the keyboard controls.

### 4.7 Fitting and black-and-white conversion

- Output is always one portrait 4 × 6 page: **812 × 1218 printer dots** at 203 dpi.
- The cropped, rotated label is scaled **uniformly** (never stretched) to the largest size that fits 4 × 6 and is **centered**. Leftover space is white.
- No safe inset is applied. Carrier labels are designed for the full 4 × 6 and include their own margins.
- PDFs are rendered directly at the printer's resolution (vector content stays sharp). Images are resampled with smoothing, then converted.
- Conversion is a **threshold**, not dithering: each dot is black or white. This keeps barcode edges sharp. Darkness steps 1–5 set the threshold.
- The preview shows exactly this black-and-white result, so what you see is what prints.

### 4.8 Remembered crops

- When the user accepts a crop for a PDF (not for an image), the app saves: page width and height in points, the crop as fractions of the page, and the rotation.
- Up to 8 page sizes are kept, most recent first. Accepting a crop for a page size already in the list replaces that entry.
- A remembered crop is used when the new PDF's page size matches within 2 pt in both dimensions.
- **Settings → Shipping labels → Forget remembered label areas** clears the list (with a count, for example `Forget 3 remembered label areas`). **Restore defaults** also clears it and resets Darkness to 3 and the mode to Text.

### 4.9 Printing

Printing reuses the existing pipeline and its rules: queue validation, offline/paused confirmation, the uncertain-outcome guard, the duplicate-click guard, status messages (`Sent to <queue> — N label(s).`), and no automatic retry.

Differences in Shipping label mode:

- Print is disabled when no image is loaded or while processing. The tooltip says why: `Paste or drop a shipping label first` / `Preparing label…`.
- No overflow or clipping confirmation (the image always fits by construction).
- The print job is the exact 812 × 1218 black-and-white image, placed on one portrait 4 × 6 page, at 100% scale, with no margins.
- The 4 × 6 orientation preference (portrait/landscape for text) is ignored and left unchanged.

### 4.10 Closing and privacy

- The close guard treats a loaded shipping image like label text: closing asks **Discard label and close** / **Keep editing**. The message says `Label Maker does not save labels, so this label can't be reopened.`
- Shipping labels contain names and addresses. The app must never write label images, PDFs, or rendered pages to disk (no temp files, no caches, no logs), never send them anywhere except the selected print queue, and never log image or PDF contents. Diagnostic logs may record sizes, page counts, and timings only.
- Images are released from memory when cleared, replaced, or when the window closes.

## 5. States and print blockers

| State | Preview area | Print |
| --- | --- | --- |
| Empty | Drop zone | Disabled: `Paste or drop a shipping label first` |
| Loading / processing | Spinner + message | Disabled: `Preparing label…` |
| Crop dialog open | Previous image or drop zone behind the dialog | Disabled (dialog is modal) |
| Ready | B/W preview + caption (+ warnings) | Enabled if a 4 × 6 printer is selected and copies are valid |
| Error after a failed load | Previous image (or drop zone) + error message | As for the image that is shown |

The existing blockers (no printer, busy, invalid copies) still apply. Font size and text blockers do not apply in Shipping label mode.

## 6. Errors

| Failure | Message | Result |
| --- | --- | --- |
| Unsupported file type | `Label Maker can't open <name>. Use a PDF or an image (PNG, JPEG, GIF, BMP, WebP).` | Nothing changes |
| File larger than 25 MB | `<name> is too large (over 25 MB).` | Nothing changes |
| Image cannot be decoded | `<name> isn't a readable image.` (clipboard: `The clipboard image couldn't be read.`) | Nothing changes |
| PDF cannot be parsed | `<name> isn't a readable PDF.` | Nothing changes |
| Password-protected PDF | `<name> is password-protected. Open it in a PDF viewer and take a screen snip instead.` | Nothing changes |
| PDF has no pages | `<name> has no pages.` | Nothing changes |
| Page render fails | `Page N of <name> couldn't be displayed.` | Stay in the dialog; other pages usable |
| Image or crop is blank (no dark pixels after conversion) | `This area is blank. Choose the part of the page with the label.` | In the dialog: Use this area stays enabled but this warning shows. On the preview: warning, Print still allowed. |
| Clipboard has no image (Paste button) | See §4.3 | Nothing changes |

"Nothing changes" means: any previously loaded image stays loaded and the mode does not change.

## 7. Acceptance criteria

| ID | Scenario | Pass condition |
| --- | --- | --- |
| S01 | Mode switch | On 4 × 6 the Text / Shipping label switch is visible and keyboard-operable; on 2 × 1 it is hidden. Switching keeps the text and the image. The mode is restored after relaunch; the image is not. |
| S02 | Snip paste | Pasting a clipboard image in Shipping label mode shows a B/W 4 × 6 preview with no dialog. White margins and a gray viewer background are trimmed. |
| S03 | Paste in Text mode | Plain text pastes as text. An image-only clipboard switches to Shipping label and loads the image. |
| S04 | Landscape snip | A snip wider than 1.1 × its height is rotated to portrait. Rotate left/right changes it in 90° steps. |
| S05 | Low-resolution snip | A snip under 150 dpi effective shows the low-resolution warning; printing is still allowed. |
| S06 | eBay-style letter PDF | Dropping a letter page with a 4 × 6 label above a packing slip opens the crop dialog with the box around the label only. Use this area prints only the label. |
| S07 | UPS-style letter PDF | A letter page with a sideways label in the top half and instructions below a dashed fold line: the box surrounds the label and the result is rotated to portrait. |
| S08 | 4 × 6 PDF | A PDF whose page is 4 × 6 (or 6 × 4) goes straight to the preview with no dialog. |
| S09 | Multi-page PDF | When page 1 has no label and page 2 does, the dialog opens on page 2 with the status `Found a label on page 2.` Page navigation works. |
| S10 | Nothing detected | A page with no label-sized content opens the dialog with the content-area box and the "Couldn't find" status. |
| S11 | Crop editing | Mouse move, resize, redraw, keyboard move/resize, Whole page and Auto-detect all work; the box never leaves the page or goes below the minimum size; the thumbnail updates. |
| S12 | Remembered crop | After accepting a crop on one letter PDF, a second letter PDF opens with the same box and the status `Using the area you chose last time…`. A different page size is not affected. Forget and Restore defaults clear the list. |
| S13 | Darkness | Steps 1–5 visibly change the preview and are restored after relaunch. |
| S14 | Fit | The output is exactly 812 × 1218, uniformly scaled, centered, with no inset; an off-ratio crop shows the aspect warning. |
| S15 | Print | Print sends one portrait 4 × 6 page per copy with the exact preview pixels; no clipping dialog; existing offline/uncertain/duplicate rules hold. |
| S16 | Blockers | Print is disabled with no image or while processing; the tooltip explains why. Ctrl+P obeys the same rules. |
| S17 | Errors | Each row of §6 shows its message and leaves the previous state intact. |
| S18 | Close guard | With an image loaded and no text, closing asks before discarding. |
| S19 | Privacy | No label image, PDF, or page render is written to disk or logged during load, crop, preview, or print. |
| S20 | Physical | On the SP410 with 4 × 6 stock: a real carrier label printed from a PDF and from a 200%-zoom snip scans with the carrier's app or a barcode scanner app; the label edges measure 4 × 6 in within 1 mm; one label per copy with no blank trailing label. |

S01–S19 are automated where the technical spec says so. S20 is a manual hardware check, recorded with the OS, driver version, and app version. Use a real label only for the physical check, and do not keep photos or scans that show the address.

## 8. Open questions for later

- Two labels on one page (Pirate Ship letter layout): print both as two jobs from one PDF?
- A "Print" button inside the crop dialog to skip a step.
- Remember crops for snips (there is no page size to key them on today).

# Label Maker — Functional Specification

**Version:** v1 draft · November 16, 2026  
**Platform:** Windows and macOS · Electron  
**Printer:** iDPRT SP410 family over USB · 4 × 6 inch stock only

This completes the supplied draft. The user's explicit requirements are SP410/4 × 6 support, portrait-first startup, portrait and landscape views, plain text, system fonts, point sizes, WYSIWYG output, printer detection, and saved preferences. Other defaults below are proposed product decisions. This document does not claim implementation or physical validation.

## 1. Purpose and scope

A single-window app where the label is both editor and preview. Type text, select a font and size, choose orientation, and print to the USB-connected SP410. No account or internet connection is required.

Included:

- Only 4 × 6 in (101.6 × 152.4 mm) stock.
- SP410-family queue discovery, including SP410BT used over USB.
- Plain multiline text; one family and point size for the whole label.
- Portrait and landscape layout.
- Left, center, and right alignment; vertical centering when text fits.
- One to 99 identical copies per print action.
- Saved orientation, typography, alignment, and printer selection.

Alignment and copies retain the original draft's proposed controls; they are draft choices, not explicit user requirements.

Excluded:

- SP310 support and 2 × 3 labels; all other printers and stock sizes.
- Images, barcodes, QR codes, shapes, borders, colors, and mixed formatting.
- Bold/italic controls, multiple text boxes, free positioning, adjustable margins.
- Saved labels, templates, reopening previous text, history, CSV, batch merging.
- Bluetooth/network printing, direct printer commands, driver installation, calibration controls.
- PDF export, automatic updates, signing, and notarization for this personal-use first pass.

Future printer profiles may need driver-specific implementation and testing, not just data changes. Do not implement the SP310 in v1.

## 2. Hardware and geometry

The SP410 is a nominal 203 dpi direct-thermal printer. The manufacturer supplies Windows and macOS driver resources. Exact OS/driver compatibility must be tested on the target machines. [Manufacturer specifications](https://www.idprt.com/Products/Barcode-Verification-Printer/), [driver downloads](https://www.idprt.com/downloads/SP410?type=driver).

The supplied draft reports:

| Property | Reported value |
| --- | --- |
| Queue / driver | iDPRT SP410BT |
| Connection | USB001 |
| Driver resolution | 203 × 203 dpi |
| Default stock | 4.00 × 6.00 in |
| Driver hard margins | Zero |

These are observations supplied in the draft, not newly verified hardware facts. A read-only query during this specification pass could not access Windows CIM. Actual queue configuration and printable area remain verification items.

| Layout property | Portrait | Landscape |
| --- | --- | --- |
| Logical width × height | 4 × 6 in | 6 × 4 in |
| Safe inset on every edge | 0.125 in | 0.125 in |
| Text area | 3.75 × 5.75 in | 5.75 × 3.75 in |

Physical stock always feeds 4 inches across the head and 6 inches along the feed. Landscape rotates the composition on that stock, without reloading it sideways. The stock display remains “4 × 6 in” in either orientation.

At exactly 203 × 203 dpi, the nominal raster is 812 × 1218 dots. This is a reference calculation, not a requirement to rasterize output or override driver resolution. Physical dimensions govern layout. Do not substitute 100 × 150 mm, Letter, or A4.

The safe inset belongs to the app layout; do not apply it again as a driver margin. If the driver printable area intrudes into that text area, report the mismatch and block printing until corrected rather than silently shrinking the label.

## 3. First launch and window

On first launch, immediately show an empty **portrait** 4 × 6 label and scan installed queues in the background. Editing works without a printer.

On later launches, restore saved orientation and typography. A saved landscape preference overrides the first-launch portrait default. Label text is not restored.

The window has a toolbar, centered label canvas, and status bar. Proposed minimum size: 720 × 560 logical pixels. With limited available screen space or increased accessibility text size, keep controls reachable through an overflow arrangement.

| Control | Behavior |
| --- | --- |
| Stock | Read-only “4 × 6 in”; no future-size entries |
| Orientation | Portrait / Landscape |
| Font | Searchable installed-family list |
| Size | Numeric point-size input and step buttons |
| Alignment | Left / Center / Right |
| Copies | Integer 1–99; starts at 1 each launch |
| Print | Submit current label; Ctrl+P / Cmd+P |
| Status bar | Queue and status; Rescan and Settings |

Fit the preview to available space while preserving aspect ratio. Its screen dimensions need not be life size. Resizing changes only preview magnification, never wrapping or physical font size. Show stock dimensions and orientation near the canvas.

## 4. Printer discovery and selection

The user installs the driver and adds the USB printer through the OS. The app discovers installed print queues; finding a queue does not establish physical connectivity.

1. Scan at launch, on return to application focus, and on Rescan. Combine overlapping scans.
2. Match SP410/SP410BT identity in queue name or available driver/model metadata, ignoring case, spaces, hyphens, and underscores. Avoid unrelated models such as SP4100.
3. Exclude identified SP310 queues. Provide no SP310 profile or stock option.
4. Prefer the saved eligible queue. Without a saved selection, choose the first eligible queue sorted by display name. Always show the selected name; Settings permits changing it.
5. If the saved queue disappears, retain its preference and request reselection. Do not silently switch printers.
6. Revalidate the selected queue before submission. Never fall back to the OS default printer.

Exclude known network/Bluetooth queues. If transport cannot be established from metadata, ask the user in Settings to confirm that the selected SP410 queue uses USB.

For renamed printers, Settings offers **Choose a renamed SP410 queue**. List installed queues except identified SP310 queues, and require confirmation that the selected queue is the user's USB-connected SP410 with 4 × 6 stock. Remember this override. It is an identity override, not general printer support.

| State | Feedback | Print |
| --- | --- | --- |
| Initial scan | Looking for SP410… | Disabled until validated |
| Eligible queue, live status unknown | Queue name — Installed | Enabled for valid content |
| OS explicitly reports ready | Queue name — Ready | Enabled for valid content |
| OS reports offline, paused, or fault | Queue name and reported state | Enabled with confirmation |
| No eligible selection | No SP410 selected; Rescan / Settings | Disabled |
| Enumeration failure | Couldn't read printers; Retry | Disabled until validated |

For a reported fault/offline state, ask “This printer is unavailable. Send to its queue anyway?” Offer **Send to queue** and **Cancel**, explaining that queued labels may print when the device becomes available.

An installed queue can remain when USB is unplugged. Use reliable OS status information where available; do not assume a portable online/offline field. Electron exposes identity and platform-specific options. [Electron PrinterInfo](https://www.electronjs.org/docs/latest/api/structures/printer-info/).

## 5. Editing and layout

- Click the label to type; Enter inserts a newline.
- Paste plain text only. Strip formatting and embedded objects; preserve text and line breaks. Normalize newline conventions; convert each tab to four spaces.
- Preserve repeated spaces and deliberate blank lines. Wrap between words; break an overlong word within the word.
- Apply font, size, and alignment to the entire label regardless of selection.
- Use line spacing of 1.2 times font size, with no extra paragraph spacing.
- Center the complete text block vertically when it fits. Align lines within the safe area.
- Support selection, cut, copy, paste, text undo/redo, keyboard navigation, and OS text composition. Preserve insertion/selection position through toolbar changes where feasible.
- Empty or whitespace-only content disables Print. Show “Type your label” only for truly empty content; never print it.
- Use the same glyph fallback in preview and output. Keep missing-glyph boxes visible; never silently remove characters. Color emoji fidelity is outside v1 acceptance.
- Never automatically shrink text, delete characters, or spill onto another label.

### Overflow

When text exceeds the safe area, pin the block to the top and clip the preview to that boundary. Show a red outline and **“Text doesn't fit. Reduce the font size or shorten the text.”**

Retain all content in the editing model. Keyboard selection and deletion must work for text outside the visible area.

Every overflowing Print action asks **Print clipped label** or **Cancel**. Confirmation prints the visible clipped composition, on one label per copy. Do not remember clipping permission across jobs.

## 6. Fonts and sizes

List installed font families accessible to the current user, including user-installed fonts. Deduplicate, sort alphabetically, and support case-insensitive search. Show names in a readable UI font. Do not download fonts or substitute a fixed web-font list.

Use the regular face where available. Style, weight, and variable-font-axis controls are deferred.

- Initial family: **Arial if installed**, otherwise the platform's resolved default sans-serif family. Display the actual resolved name.
- Initial size: **24 pt**.
- Valid range: **6–288 pt**, in 0.5-point increments; step buttons change by 1 pt.
- Invalid, blank, or out-of-range input shows an error and disables Print. Preserve the last valid preview; Escape restores the last valid field value.
- Refresh the list at launch and through Settings → Refresh fonts.
- If a saved family is missing, visibly substitute the fallback and explain before printing. Retain the preferred family for later launches unless the user selects another.
- Await font loading before measuring or printing. Enumeration/loading failure offers retry; any usable fallback must be named visibly.

Point size describes a font's em size, not every glyph's height. At 72 pt the em is one inch; actual capital-letter height depends on the font. The prior draft's fixed Arial “H” height is not a requirement. The 6 pt minimum is an input limit, not a readability guarantee.

## 7. Orientation and WYSIWYG

Changing orientation immediately swaps logical dimensions and reflows text. Preserve content, font, size, alignment, and copies; recalculate overflow. Letters remain upright in the chosen reading orientation.

| Aspect | Requirement |
| --- | --- |
| Newlines and wrapping | Identical in preview and submitted composition |
| Size | True physical point size; no fit-to-page shrinking |
| Position | Same safe inset and alignment in preview and composition |
| Window/display scaling | Preview magnification only |
| Orientation | Both layouts occupy one physical 4 × 6 label |
| Decorations | Cursor, selection, guides, hints, focus rings, warnings, and UI never print |

Screen antialiasing differs from thermal dots. Request black text on white; the driver handles device rendering.

After correct driver setup and stock calibration, proposed physical acceptance targets are placement within **1 mm** of intended position and a 50 mm test length within **1 mm** of intended size. These are validation targets, not verified guarantees. Preview screenshots or PDFs alone cannot establish them.

## 8. Printing and errors

1. Validate visible text, font readiness, size, copies, queue, and page compatibility.
2. Obtain any overflow/offline confirmations. Cancel submits nothing.
3. Freeze a snapshot of content and settings. Edits during submission affect only the next job.
4. Submit directly to the exact selected OS queue without the system print dialog.
5. Request one physical 4 × 6 page per copy, intended orientation, actual scale, single-sided output, and no headers/footers. Apply the safe inset once.
6. Disable repeat submission while sending; show “Sending to [queue]…”. Editing remains available.
7. On submission acceptance, show **“Sent to [queue] — N label(s).”** Preserve content and copies for session reuse.

Acceptance does not prove paper emerged. Do not claim “Printed successfully” or show completed-label counts without reliable device acknowledgment.

Electron supports a named destination, page options, and a print callback. Validate actual page/orientation behavior against each target driver. [Electron printing API](https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback).

| Failure | Response |
| --- | --- |
| Queue removed | Preserve text; disable Print; offer Rescan / Settings |
| Invalid/unsupported page settings | Explain 4 × 6 requirement; retry after correction |
| Font/layout preparation failure | Submit nothing; preserve text; offer retry/font change |
| Print API failure | Readable error and expandable OS details; preserve input |
| Stalled/uncertain submission | Say outcome is unconfirmed; inspect OS queue before retrying |
| Fault after queue acceptance | Explain that the OS manages waiting jobs |

Never retry automatically: ambiguous outcomes can produce duplicate labels. Once queued, cancellation is through the OS print queue. Provide guidance to reach Windows printer settings or macOS Printers & Scanners; a direct queue shortcut is optional.

## 9. Settings and persistence

Committed toolbar changes apply immediately and become next-launch defaults for orientation, font, size, and alignment. Settings exposes those preferences, printer selection, Refresh fonts, and Restore defaults. Preferences do not save label content.

| Setting | Initial value | Persistence |
| --- | --- | --- |
| Stock | 4 × 6 in | Fixed |
| Orientation | Portrait | Saved |
| Font | Arial or resolved system sans-serif | Preferred family saved |
| Size | 24 pt | Saved |
| Horizontal alignment | Center | Saved |
| Vertical alignment / inset | Center / 0.125 in | Fixed |
| Queue / identity override | Eligible auto-detected queue | Saved after selection or successful submission |
| Copies | 1 | Session only |
| Label content | Empty | Session only |

Store versioned preferences locally in Electron's per-user application settings directory (`userData`). Write atomically and validate on load. Ignore unknown keys; reset invalid values individually. Corrupt settings load defaults with a nonblocking notice. Report write failures: “Changes apply now but couldn't be saved.”

Restore defaults requires confirmation, clears explicit queue selection, rescans, and applies initial formatting to the current label. Preserve text and recalculate overflow.

Closing with nonempty text asks **Discard label and close** or **Keep editing**, even after printing, because v1 cannot reopen text. Closing does not cancel queued jobs.

## 10. Platform and technical constraints

- Use Electron and OS printer drivers. Separate layout, printer discovery, font discovery, and persistence behind interfaces.
- Share canonical physical-unit layout between preview and output; preview zoom is an outer transform.
- Render a clean single-page print document from the frozen snapshot; await fonts and completed layout.
- Verify landscape mapping per driver. Avoid double rotation from swapping dimensions and rotating again.
- Verify system-font enumeration in the pinned Electron version on both systems; CSS fallback alone is not enumeration.
- Restrict native access to main/preload code. Treat pasted input as text, never executable HTML.
- No telemetry, remote fonts, transmission of label text, or label contents in diagnostic logs.
- Provide keyboard access, visible focus, accessible labels, and a screen-reader-accessible editor.
- Record supported OS versions, architectures, Electron version, and driver versions during implementation. Manufacturer OS support alone does not establish app compatibility.
- Signing/notarization is deferred for personal use; broader distribution requires separate packaging validation.

## 11. Acceptance criteria

These checks remain to be executed after implementation.

| ID | Scenario | Pass condition |
| --- | --- | --- |
| A01 | First launch | Empty portrait 4 × 6, default typography, detected queue shown; Print disabled until content exists |
| A02 | No printer | Editor works, only 4 × 6 shown, Print disabled; Rescan finds a newly installed queue |
| A03 | Matching | SP410/SP410BT variants match; SP310 and unrelated model numbers do not |
| A04 | Multiple/renamed queues | Correct persisted selection and explicit override; no default-printer fallback |
| A05 | Queue disappears | No rerouting; text retained; reselection offered |
| A06 | Fonts | Installed families searchable; selected family prints; missing saved family visibly substituted |
| A07 | Size | 6, 24, 72, 288 pt accepted; invalid input blocks Print; preview remains consistent |
| A08 | Editing | Plain paste, whitespace, newlines, long words, selection, undo/redo, and composition work |
| A09 | Resize/scaling | Wrapping-sensitive text retains lines at different window sizes and display scales |
| A10 | Orientation | Content preserved/reflowed; both orientations print one correctly oriented actual-size label |
| A11 | Alignment/inset | Alignments match preview; vertical centering and inset applied once |
| A12 | Overflow | Warning/clipping shown; Cancel submits nothing; confirmed output stays on one label |
| A13 | Copies/repeated clicks | 1 and 3 copies produce correct counts; invalid counts block; clicks during submission do not duplicate |
| A14 | Offline/failure | Text survives; installed, offline, accepted, failed, uncertain states distinguished; no automatic retry |
| A15 | Persistence | Preferences restored, content/copies not restored; corrupt settings recover; save failure visible; reset preserves text |
| A16 | Snapshot | Edits during submission cannot alter captured job |
| A17 | Physical output | Both orientations meet scale/placement targets; no blank trailing labels |
| A18 | Clean output | No cursor, highlight, hint, guide, UI, URL, date, header, footer |
| A19 | Offline/accessibility | No internet needed; controls/editor keyboard accessible |
| A20 | Closing | Nonempty label prompts before discard; OS retains queued jobs |

Use software fixtures for SP310 exclusion; do not connect or implement that device. Physical acceptance requires the actual SP410 with 4 × 6 stock on **both Windows and macOS**, covering fonts, orientation, dimensions, copies, and scaling. Record app, OS, queue, and driver versions. Until macOS physical checks pass, macOS printing remains unverified.

## 12. Draft decisions and remaining validation

Working defaults: Arial/fallback at 24 pt, center alignment, 0.125-inch inset, 1.2 line spacing, 6–288 pt range, 1–99 copies, automatic preference saving, and clip-with-confirmation overflow. These may change without expanding scope.

Initial implementation priorities:

1. Verify the existing SP410BT queue's USB identity, resolution, stock, and printable area.
2. Prove actual-size single-page 4 × 6 printing in both orientations before completing the editor.
3. Verify font enumeration and identical preview/print wrapping on both platforms.
4. Establish the supported OS/architecture/driver matrix and measure printed output.

SP310/2 × 3 support, saved labels, templates, and richer content belong to later specifications.


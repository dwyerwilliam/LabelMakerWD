# Label Maker — Functional Specification

- **Version:** v2 draft · November 16, 2026
- **Platform:** Windows and macOS · Electron
- **Printers:** iDPRT SP410 family over USB · 4 × 6 inch stock; iDPRT SP310 over USB · DYMO 30334 stock

This expands the supplied SP410 draft to include the iDPRT SP310 and its fixed landscape output on DYMO 30334 stock. The recommended UX uses two fixed, size-first printer-profile tabs: **4 × 6** and **2 × 1**. The existing SP410 behavior remains the default and is not replaced by automatic printer switching. Other defaults below are proposed product decisions. This document does not claim implementation or physical validation.

## 1. Purpose and scope

A single-window app where the label is both editor and preview. Type text, select a font and size, choose the supported stock profile, and print to the USB-connected printer assigned to that profile. No account or internet connection is required.

The app supports two fixed printer profiles:

| Profile tab | Printer family | Stock name | Output geometry | Orientation control |
| --- | --- | --- | --- | --- |
| **4 × 6** | iDPRT SP410 / SP410BT | 4 × 6 in | 4 × 6 portrait or 6 × 4 landscape | Portrait / Landscape |
| **2 × 1** | iDPRT SP310 | DYMO 30334 · 2¼ × 1¼ in | 2¼ × 1¼ in landscape | Fixed landscape in v1 |

The **2 × 1** label is an app profile name, not a claim about the exact manufactured dimensions. DYMO 30334 is nominally 2¼ inches on the long edge and 1¼ inches on the short edge. The SP310 always outputs it with the 2¼-inch edge horizontal; the app must not make the user reason about printer model, driver page names, or rotation flags during normal use.

Included:

- 4 × 6 in stock on the existing SP410-family workflow.
- DYMO 30334 stock on the iDPRT SP310 workflow, with fixed landscape output.
- SP410-family queue discovery, including SP410BT used over USB.
- SP310 queue discovery used over USB.
- Plain multiline text; one family and point size for the whole label.
- Portrait and landscape layout for 4 × 6; fixed landscape layout for 2 × 1.
- Left, center, and right alignment; vertical centering when text fits.
- One to 99 identical copies per print action.
- Saved active profile, profile-specific typography and alignment, orientation where applicable, and printer selection per profile.

Alignment and copies retain the original draft's proposed controls; they are draft choices, not explicit user requirements.

Excluded:

- All printers and stock sizes other than the two supported profiles.
- Images, barcodes, QR codes, shapes, borders, colors, and mixed formatting.
- Bold/italic controls, multiple text boxes, free positioning, adjustable margins.
- Saved labels, templates, reopening previous text, history, CSV, batch merging.
- Bluetooth/network printing, direct printer commands, driver installation, calibration controls.
- PDF export, automatic updates, signing, and notarization for this personal-use first pass.

Future printer profiles may need driver-specific implementation and testing, not just data changes. Do not add an arbitrary stock-size selector as part of this work.

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

At exactly 203 × 203 dpi, the nominal SP410 raster is 812 × 1218 dots. This is a reference calculation, not a requirement to rasterize output or override driver resolution. Physical dimensions govern layout. Do not substitute 100 × 150 mm, Letter, or A4.

The safe inset belongs to the app layout; do not apply it again as a driver margin. If the driver printable area intrudes into that text area, report the mismatch and block printing until corrected rather than silently shrinking the label.

### 2.1 SP310 / DYMO 30334 geometry

The SP310 profile uses DYMO 30334 stock. The stock is nominally 2¼ inches on the long edge and 1¼ inches on the short edge. The following is the proposed app geometry until the actual SP310 queue and stock are inspected:

| Layout property | SP310 landscape output |
| --- | --- |
| Logical width × height | 2¼ × 1¼ in |
| Safe inset on every edge | 0.125 in, subject to measurement |
| Text area | 2 × 1 in, subject to measurement |
| User-facing orientation | Landscape, fixed in v1 |

Do not infer the printable area from the SP410. Inspect the SP310 queue, DYMO 30334 media definition, resolution, hard margins, and feed direction separately. If the driver calls the media “2¼ × 1¼” while the label exits in landscape, the app's canonical composition remains 2¼ × 1¼ and the printer adapter owns the one required mapping. Do not rotate the composition in both the layout and driver layers.

The SP310's resolution, exact printable area, queue names, driver page-size behavior, and OS support remain verification items. A physical test must establish that one submitted page produces one 2¼ × 1¼ landscape label with no blank trailing label.

## 3. First launch and window

On first launch, immediately show an empty **portrait** 4 × 6 label and scan installed queues in the background. This preserves the existing SP410 behavior. If no eligible SP410 is found but an eligible SP310 is found, the app may select the 2 × 1 profile and show its empty fixed-landscape label so a machine with only the smaller printer is usable immediately. Editing works without a printer.

On later launches, restore the saved active profile, profile-specific typography, and 4 × 6 orientation. A saved landscape preference overrides the first-launch portrait default. Label text is not restored.

The window has profile tabs, a compact toolbar, a centered label canvas, and a status bar. Proposed minimum size: 720 × 560 logical pixels. With limited available screen space or increased accessibility text size, keep controls reachable through an overflow arrangement.

### 3.1 Recommended profile-tab UX

Use a two-option segmented tab control near the top of the window:

`[ 4 × 6 ]  [ 2 × 1 ]`

Show the printer model as secondary text or a tooltip (`SP410` / `SP310`), but make the stock size the primary tab label. This lets the user choose the media they are holding without learning model numbers. Do not use a generic printer dropdown as the main workflow; printer selection belongs in the status area and Settings.

The selected profile controls stock geometry, eligible printer queues, the active print destination, and the controls shown in the toolbar:

- The **4 × 6** tab keeps the existing Portrait / Landscape control and all existing SP410 behavior.
- The **2 × 1** tab shows a visible **Landscape** badge in place of an orientation toggle. The control is not silently omitted; the fixed orientation is explained once in a tooltip or helper text.
- The Print button includes the active stock profile, such as **Print 4 × 6** or **Print 2 × 1**, to reduce wrong-media mistakes.
- The status area shows only the active profile's queue and state, for example `SP310 — Ready`, `SP410 — Not found`, or `No SP310 selected`.
- Both tabs remain visible even when their printer is disconnected. A missing printer must not make the profile disappear or make the user hunt through Settings.

Switching profiles is reversible and does not discard text. The recommended v1 behavior is one shared label text draft with profile-specific formatting and printer settings: the text remains in the editor, the active profile's font/size/alignment are restored, and the preview reflows immediately. If the text no longer fits the smaller profile, show the existing overflow warning and require the existing print-clipping confirmation. Do not auto-shrink, truncate, or silently alter the text.

Alternatives considered:

| UX option | Assessment |
| --- | --- |
| Size-first tabs with model shown secondarily | Recommended: visible, predictable, and easy to extend to another fixed stock later. |
| One printer dropdown that changes stock and orientation | Not recommended: the same action changes several hidden layout rules and can cause accidental wrong-media jobs. |
| Auto-select a profile from whichever printer is online | Not recommended: unplugging a printer changes the editing context unexpectedly. Use saved/explicit profile selection instead. |
| Separate text drafts per tab | Defer: useful if the two printers serve unrelated workflows, but more surprising for a first two-profile release. |

| Control | Behavior |
| --- | --- |
| Profile tabs | 4 × 6 / 2 × 1; active profile controls the label geometry |
| Stock | Read-only active profile stock; no arbitrary size entries |
| Orientation | 4 × 6: Portrait / Landscape; 2 × 1: fixed Landscape |
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
2. Classify queues by exact model tokens in the queue name or available driver/model metadata, ignoring case, spaces, hyphens, and underscores. Match SP410/SP410BT to 4 × 6 and SP310 to 2 × 1; avoid unrelated models such as SP4100 or SP3100.
3. Exclude queues that cannot be associated confidently with one supported profile. Do not infer a profile from the OS default printer or from a generic queue name.
4. Prefer the saved eligible queue for the active profile. Without a saved selection, choose the first eligible queue for that profile sorted by display name. Always show the selected name; Settings permits changing it.
5. If a saved queue disappears, retain its preference and request reselection for that profile. Do not silently switch profiles or printers.
6. Revalidate the selected queue and its profile-compatible media before submission. Never fall back to the OS default printer.

Exclude known network/Bluetooth queues. If transport cannot be established from metadata, ask the user in Settings to confirm that the selected queue uses USB and belongs to the displayed profile.

For renamed printers, Settings offers a profile-specific action such as **Choose a renamed SP310 queue**. List installed queues that are not already assigned to another profile, and require confirmation that the selected queue is the user's USB-connected printer with the active profile's stock. Remember this override. It is an identity override, not general printer support.

| State | Feedback | Print |
| --- | --- | --- |
| Initial scan | Looking for [active profile] printer… | Disabled until validated |
| Eligible queue, live status unknown | Queue name — Installed | Enabled for valid content |
| OS explicitly reports ready | Queue name — Ready | Enabled for valid content |
| OS reports offline, paused, or fault | Queue name and reported state | Enabled with confirmation |
| No eligible selection | No [active profile] printer selected; Rescan / Settings | Disabled |
| Enumeration failure | Couldn't read printers; Retry | Disabled until validated |

For a reported fault/offline state, ask “This printer is unavailable. Send to its queue anyway?” Offer **Send to queue** and **Cancel**, explaining that queued labels may print when the device becomes available. Name the active profile in the confirmation so the user can catch a wrong-media selection.

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
- Initial size: **24 pt** for 4 × 6. The proposed 2 × 1 starting size is **12 pt** so a short label is immediately usable; validate this against the intended SP310 content before implementation.
- Valid range: **6–288 pt**, in 0.5-point increments; step buttons change by 1 pt.
- Invalid, blank, or out-of-range input shows an error and disables Print. Preserve the last valid preview; Escape restores the last valid field value.
- Refresh the list at launch and through Settings → Refresh fonts.
- If a saved family is missing, visibly substitute the fallback and explain before printing. Retain the preferred family for later launches unless the user selects another.
- Await font loading before measuring or printing. Enumeration/loading failure offers retry; any usable fallback must be named visibly.

Point size describes a font's em size, not every glyph's height. At 72 pt the em is one inch; actual capital-letter height depends on the font. The prior draft's fixed Arial “H” height is not a requirement. The 6 pt minimum is an input limit, not a readability guarantee.

## 7. Orientation and WYSIWYG

For the 4 × 6 profile, changing orientation immediately swaps logical dimensions and reflows text. Preserve content, font, size, alignment, and copies; recalculate overflow. Letters remain upright in the chosen reading orientation. For the 2 × 1 profile, the logical dimensions are always 2¼ × 1¼ inches and the user-facing orientation is always landscape. Switching profiles changes the active geometry but never rotates or deletes the text.

| Aspect | Requirement |
| --- | --- |
| Newlines and wrapping | Identical in preview and submitted composition |
| Size | True physical point size; no fit-to-page shrinking |
| Position | Same safe inset and alignment in preview and composition |
| Window/display scaling | Preview magnification only |
| Orientation | 4 × 6 occupies one physical 4 × 6 label in the chosen orientation; 2 × 1 occupies one physical 2¼ × 1¼ landscape label |
| Decorations | Cursor, selection, guides, hints, focus rings, warnings, and UI never print |

Screen antialiasing differs from thermal dots. Request black text on white; the driver handles device rendering.

After correct driver setup and stock calibration, proposed physical acceptance targets are placement within **1 mm** of intended position and a 50 mm test length within **1 mm** of intended size. These are validation targets, not verified guarantees. Preview screenshots or PDFs alone cannot establish them.

## 8. Printing and errors

1. Validate visible text, font readiness, size, copies, queue, and page compatibility.
2. Obtain any overflow/offline confirmations. Cancel submits nothing.
3. Freeze a snapshot of content and settings. Edits during submission affect only the next job.
4. Submit directly to the exact selected OS queue without the system print dialog.
5. Request one physical page per copy for the active profile: 4 × 6 for SP410 or 2¼ × 1¼ landscape output for SP310. Use actual scale, single-sided output, and no headers/footers. Apply the active profile's safe inset once. If the driver exposes the DYMO 30334 media using a different width/height ordering, perform the verified mapping in the printer adapter and do not add a second rotation.
6. Disable repeat submission while sending; show “Sending to [queue]…”. Editing remains available.
7. On submission acceptance, show **“Sent to [queue] — N label(s).”** Preserve content and copies for session reuse.

Acceptance does not prove paper emerged. Do not claim “Printed successfully” or show completed-label counts without reliable device acknowledgment.

Electron supports a named destination, page options, and a print callback. Validate actual page/orientation behavior against each target driver. [Electron printing API](https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback).

| Failure | Response |
| --- | --- |
| Queue removed | Preserve text; disable Print; offer Rescan / Settings |
| Invalid/unsupported page settings | Explain the active profile's stock requirement; retry after correction |
| Font/layout preparation failure | Submit nothing; preserve text; offer retry/font change |
| Print API failure | Readable error and expandable OS details; preserve input |
| Stalled/uncertain submission | Say outcome is unconfirmed; inspect OS queue before retrying |
| Fault after queue acceptance | Explain that the OS manages waiting jobs |

Never retry automatically: ambiguous outcomes can produce duplicate labels. Once queued, cancellation is through the OS print queue. Provide guidance to reach Windows printer settings or macOS Printers & Scanners; a direct queue shortcut is optional.

## 9. Settings and persistence

Committed toolbar changes apply immediately and become next-launch defaults for the active profile. Settings exposes profile-specific formatting, each profile's printer selection, Refresh fonts, and Restore defaults. Preferences do not save label content.

| Setting | Initial value | Persistence |
| --- | --- | --- |
| Active profile | 4 × 6, unless only SP310 is detected on first launch | Saved |
| Stock | Fixed by active profile: 4 × 6 or DYMO 30334 | Fixed |
| Orientation | 4 × 6: Portrait; 2 × 1: fixed Landscape | 4 × 6 preference saved; 2 × 1 fixed |
| Font | Arial or resolved system sans-serif | Preferred family saved per profile |
| Size | 4 × 6: 24 pt; 2 × 1: proposed 12 pt | Saved per profile |
| Horizontal alignment | Center | Saved per profile |
| Vertical alignment / inset | Center / profile-specific measured inset | Fixed per profile |
| Queue / identity override | Eligible auto-detected queue for each profile | Saved per profile after selection or successful submission |
| Copies | 1 | Session only |
| Label content | Empty | Session only |

Store versioned preferences locally in Electron's per-user application settings directory (`userData`). Write atomically and validate on load. Ignore unknown keys; reset invalid values individually. Corrupt settings load defaults with a nonblocking notice. Report write failures: “Changes apply now but couldn't be saved.”

Restore defaults requires confirmation, clears explicit queue selections for both profiles, rescans, resets profile-specific formatting, and returns the active profile to 4 × 6. Preserve text and recalculate overflow.

Closing with nonempty text asks **Discard label and close** or **Keep editing**, even after printing, because v1 cannot reopen text. Closing does not cancel queued jobs.

## 10. Platform and technical constraints

- Use Electron and OS printer drivers. Separate layout, printer discovery, font discovery, and persistence behind interfaces.
- Model the two formats as explicit printer profiles rather than scattered size checks. A profile owns its stock geometry, eligible queue matcher, default orientation, safe inset, and print-page mapping.
- Share canonical physical-unit layout between preview and output; preview zoom is an outer transform.
- Render a clean single-page print document from the frozen snapshot; await fonts and completed layout.
- Verify landscape mapping independently for SP410 and SP310. Avoid double rotation from swapping dimensions and rotating again.
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
| A01 | First launch | Empty portrait 4 × 6, default typography, detected queue shown; Print disabled until content exists. If only SP310 is detected, the 2 × 1 landscape profile may be selected instead. |
| A02 | No printer | Both 4 × 6 and 2 × 1 tabs remain available; editing works; Print is disabled only for profiles without a validated queue; Rescan finds a newly installed queue |
| A03 | Matching | SP410/SP410BT variants match 4 × 6; SP310 variants match 2 × 1; SP4100, SP3100, and unrelated model numbers do not |
| A04 | Multiple/renamed queues | Correct per-profile persisted selection and explicit override; no default-printer fallback or cross-profile queue assignment |
| A05 | Queue disappears | No rerouting; text retained; reselection offered |
| A06 | Fonts | Installed families searchable; selected family prints; missing saved family visibly substituted |
| A07 | Size | 6, 24, 72, 288 pt accepted; invalid input blocks Print; preview remains consistent |
| A08 | Editing | Plain paste, whitespace, newlines, long words, selection, undo/redo, and composition work |
| A09 | Resize/scaling | Wrapping-sensitive text retains lines at different window sizes and display scales |
| A10 | Orientation | 4 × 6 content is preserved/reflowed and both orientations print one correctly oriented actual-size label; 2 × 1 is visibly fixed to landscape |
| A11 | Alignment/inset | Alignments match preview; vertical centering and inset applied once |
| A12 | Overflow | Warning/clipping shown; Cancel submits nothing; confirmed output stays on one label |
| A13 | Copies/repeated clicks | 1 and 3 copies produce correct counts; invalid counts block; clicks during submission do not duplicate |
| A14 | Offline/failure | Text survives; installed, offline, accepted, failed, uncertain states distinguished; no automatic retry |
| A15 | Persistence | Preferences restored, content/copies not restored; corrupt settings recover; save failure visible; reset preserves text |
| A16 | Snapshot | Edits during submission cannot alter captured job |
| A17 | Physical output | SP410 portrait/landscape and SP310 2 × 1 landscape meet their scale/placement targets; each produces one label per submitted page with no blank trailing labels |
| A18 | Clean output | No cursor, highlight, hint, guide, UI, URL, date, header, footer |
| A19 | Offline/accessibility | No internet needed; controls/editor keyboard accessible |
| A20 | Closing | Nonempty label prompts before discard; OS retains queued jobs |
| A21 | Profile switching | Switching tabs preserves text, restores the active profile's formatting, reflows the preview, and never submits to the inactive profile's queue |
| A22 | Profile-specific status | Each tab shows its own queue state; a missing SP310 does not hide the tab or disable valid 4 × 6 printing, and vice versa |
| A23 | SP310 page mapping | The preview, submitted page, and physical DYMO 30334 label are all 2¼ × 1¼ landscape; the driver mapping is applied once and does not create a rotated or blank label |
| A24 | Profile persistence | Active tab, per-profile formatting, and per-profile queue selections restore correctly; text and copies remain session-only |

Use software fixtures for model matching, ambiguous queues, cross-profile selection, and unavailable printers. Physical acceptance requires the actual SP410 with 4 × 6 stock and the actual SP310 with DYMO 30334 stock on each supported OS, covering fonts, orientation, dimensions, copies, scaling, feed direction, and driver page mapping. Record app, OS, queue, and driver versions. Until physical checks pass on a platform, printing on that platform remains unverified.

## 12. Draft decisions and remaining validation

Working defaults: size-first 4 × 6 / 2 × 1 tabs; Arial/fallback; 24 pt for 4 × 6; proposed 12 pt for 2 × 1; center alignment; 0.125-inch inset pending per-device measurement; 1.2 line spacing; 6–288 pt range; 1–99 copies; automatic preference saving; shared text across tabs; and clip-with-confirmation overflow. These may change without expanding scope.

Initial implementation priorities:

1. Verify the existing SP410BT queue's USB identity, resolution, stock, and printable area.
2. Prove actual-size single-page 4 × 6 printing in both orientations before completing the editor.
3. Inspect the SP310 queue, DYMO 30334 media definition, resolution, feed direction, and printable area; prove one actual-size 2¼ × 1¼ landscape label per page.
4. Verify font enumeration and identical preview/print wrapping on both platforms and both profiles.
5. Establish the supported OS/architecture/driver matrix and measure printed output.

Saved labels, templates, arbitrary stock sizes, and richer content belong to later specifications. If real usage shows that 4 × 6 and 2 × 1 labels are usually unrelated jobs, revisit the deferred per-tab draft model rather than silently changing the shared-text behavior.


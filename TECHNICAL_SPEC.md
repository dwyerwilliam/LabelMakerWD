# Label Maker — Technical Specification

**Version:** v1 draft · November 16, 2026

**Status:** Architecture and implementation contract; no application code or hardware verification yet

**Functional baseline:** [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md), initial commit `5de7890`

**Targets:** Windows and macOS only. Linux is deferred.

## 1. Architecture decision

Use **Electron + React + TypeScript + Vite + Zustand**, with **electron-builder** for packaging, **Vitest** for unit/service tests, and **Playwright** for UI and Electron integration tests.

This continues the useful conventions in the sibling Restiprocity project while keeping Label Maker small. Zustand coordinates a label draft, settings, printer discovery, and print progress. It is not a database or a second print engine. Native printing remains in Electron's main process; typography and layout use Chromium on both platforms.

No backend, cloud account, SQLite, rich-text framework, CodeMirror, updater, or Linux packaging is needed.

### Restiprocity reference

Inspected the sibling worktree on November 16, 2026; its HEAD reported `94fc3b6`. File observations describe the worktree read, not a claim that every file matched that commit.

| Observed source | Pattern to reuse |
| --- | --- |
| `../Restiprocity/package.json` | React 19, Zustand 5, TypeScript, Vite, Electron, electron-builder, Playwright |
| `../Restiprocity/vite.config.ts` | Vite with vite-plugin-electron; distinct main/preload bundles |
| `../Restiprocity/tsconfig.json` | Strict TypeScript and tier aliases |
| `../Restiprocity/src/preload/index.ts` | Typed window.api methods; module:action IPC names |
| `../Restiprocity/src/main/ipc/trustedSender.ts` | Validate the app page and top-frame sender before native work |
| `../Restiprocity/src/renderer/stores/index.ts` | Zustand state with explicit actions |
| `../Restiprocity/src/main/stores/collectionStore.ts` | Main-owned settings; serialized temporary-file/rename writes |
| `../Restiprocity/AGENTS.md` | Separate browser, real Electron, and packaged-app verification |

Reuse architecture and conventions, not its entire dependency list, product-specific code, permissions, release automation, Linux workarounds, or exact runtime versions. In particular, the reference currently declares Electron 39; select a supported stable Electron release for this new app. Electron supports its latest three stable major lines. [Electron release policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

## 2. Platform and dependency baseline

| Item | Decision |
| --- | --- |
| Windows | Initial delivery target: Windows 11 x64 |
| macOS | Initial delivery target: macOS 14 or newer on Apple silicon; Intel x64 is a separate build/validation target |
| Linux | No implementation, package, CI runner, Docker environment, or support claim in v1 |
| Host tooling | Pin a mutually supported Node LTS patch in .node-version and package engines at scaffolding |
| UI | React 19, Zustand 5, strict TypeScript |
| Build | Vite + vite-plugin-electron, following the reference build structure |
| Styling | Tailwind for application chrome; isolated plain CSS for label geometry and printing |
| Packaging | electron-builder; NSIS on Windows, DMG on macOS |
| Dependencies | npm and committed package-lock.json; clean installs use npm ci |

These OS/architecture entries are intended targets, not verified compatibility claims. The pinned Electron and iDPRT driver must both support a target before it is advertised. Windows ARM64 is deferred. A Mac x64 artifact is not called supported until native and physical tests run on that architecture.

At scaffolding, record exact versions of Electron, Node, React, Zustand, TypeScript, Vite/plugins, Tailwind, electron-builder, and test tools in the manifest/lockfile and build-matrix document. Choose compatible supported releases, prove a clean install on each target, then pin the resolved toolchain. Do not inherit Restiprocity's extraction override unless the failure reproduces here. Do not install dependencies during this documentation task.

Build macOS artifacts on macOS and Windows artifacts on Windows. Native helpers must match the target architecture. [electron-builder platform guidance](https://www.electron.build/v26/docs/features/multi-platform-build/).

## 3. Process boundaries and source organization

```text
src/
  main/
    index.ts
    window.ts
    protocol.ts
    ipc/{handlers,trustedSender}.ts
    services/{printerService,printService,settingsService}.ts
    platform/{printerAdapter,windowsAdapter,macosAdapter}.ts
  preload/
    index.ts
    print.ts
  renderer/
    main.tsx
    App.tsx
    components/{Toolbar,LabelEditor,PrinterStatus,SettingsDialog}.tsx
    stores/{labelStore,deviceStore,preferencesStore,uiStore}.ts
    fonts/fontCatalog.ts
    editor/{textModel,history,selection}.ts
    label/{LabelSurface,layout,geometry,label.css}
    print/{main,PrintDocument}.tsx
  shared/
    {contracts,schemas,defaults,channels,errors}.ts
native/
  windows/                 # read-only printer-inspection helper
  macos/                   # read-only printer-inspection helper
tests/
  unit/
  ui/
  electron/
  fixtures/
docs/
  validation/
scripts/
```

The visible renderer owns editing and preview. Main owns queue selection validation, native printer information, persisted preferences, submission sequencing, and application lifecycle. A separate hidden print renderer renders a frozen label snapshot; it has no editing UI.

Use `@main`, `@preload`, `@renderer`, and `@shared` aliases. Only shared contracts/pure logic cross process tiers. Renderer code cannot import Node/Electron modules. The print entry imports shared label rendering/CSS but no Zustand store.

Use one application instance. A second launch focuses the existing window. Windows closes/exits after confirmed discard; macOS can keep the app running with no visible window, but reopening creates a fresh empty draft. Cmd+Q follows the same discard/submission guard.

## 4. Data contracts and ownership

Illustrative TypeScript contracts; runtime validation is mandatory at IPC and disk boundaries:

```ts
type Orientation = 'portrait' | 'landscape';
type Alignment = 'left' | 'center' | 'right';

interface LabelDraft {
  revision: number;
  text: string;                 // LF newlines; tabs expanded to four spaces
  orientation: Orientation;
  preferredFontFamily: string;
  resolvedFontFamily: string;   // actual family used in preview
  fontSizePt: number;
  alignment: Alignment;
  copies: number;               // session only
}

interface PrinterChoice {
  deviceName: string;           // exact OS queue identifier, never display name
  platform: 'win32' | 'darwin';
  identityFingerprint: string;  // model/driver/port metadata when available
  manualSp410Confirmed: boolean;
  usbConfirmed: boolean;
}

interface PreferencesV1 {
  schemaVersion: 1;
  orientation: Orientation;
  fontFamily: string;
  fontSizePt: number;
  alignment: Alignment;
  printer: PrinterChoice | null;
}

interface PrintSnapshot {
  requestId: string;
  draftRevision: number;
  text: string;
  orientation: Orientation;
  resolvedFontFamily: string;
  fontSizePt: number;
  alignment: Alignment;
  copies: number;
  expectedLayout: LayoutFingerprint;
}

interface LayoutFingerprint {
  logicalWidthPt: number;
  logicalHeightPt: number;
  lineRectsPt: Array<{ x: number; y: number; width: number; height: number }>;
  lineTextOffsets: number[];
  overflow: boolean;
}

type PrintState =
  | 'idle' | 'preparing' | 'awaiting-confirmation'
  | 'submitting' | 'submitted' | 'failed' | 'uncertain';
```

The printer service additionally returns a normalized queue record: display name, OS identifier, model, driver, transport (`usb | bluetooth | network | unknown`), status (`ready | offline | paused | error | unknown`), paper dimensions, hard margins, resolution when known, and a capability-query timestamp. Missing data stays unknown.

- `labelStore`: committed draft, revision, measured layout and font readiness.
- `deviceStore`: discovery state, normalized queues, selected queue and faults.
- `preferencesStore`: hydrated preferences plus pending/saved/error status.
- `uiStore`: dialogs and numeric input drafts; invalid field text is separate from the last valid label value.
- Main `PrintService`: authoritative request registry and submission lock.

Subscribe to small Zustand selectors; avoid rerendering the editor for unrelated printer/status updates. Use shallow comparison where selectors return composite values. Do not use Zustand persist/localStorage for settings or text. [Zustand selector guidance](https://zustand.docs.pmnd.rs/guides/prevent-rerenders-with-use-shallow).

## 5. Local settings

Main reads `path.join(app.getPath('userData'), 'settings.json')`; renderer receives validated values. No hardcoded user paths. There is no label-content persistence.

Defaults remain those in the functional specification: portrait, Arial or named fallback, 24 pt, center alignment, no explicit printer preference. Copies reset to 1; text resets empty.

Boot renders a usable shell immediately. Before hydration completes, disable preference-changing controls briefly so startup cannot overwrite the user's first edit. Printer discovery runs independently.

Serialize preference writes. Debounce committed changes by 250 ms; include monotonically increasing revision acknowledgments so an older response cannot mark newer changes saved. Write a unique sibling temporary file, close it, then rename over the target; retain the previous file on failure. This is atomic replacement, not a power-loss durability promise.

Validate enum values, finite point sizes, half-point steps, queue identifiers, and schema version. Ignore unknown keys. Preserve corrupt data as a diagnostic backup without label text; load defaults and show a notice. A future schema version is read without destructive overwrite: use session defaults and require explicit reset before replacing the file.

Flush pending preferences on normal close. A failed save keeps current-session values and shows a retryable warning. Reset passes through the same write queue; apply defaults to formatting, preserve text, reset copies, clear explicit queue confirmation, and rescan. Missing preferred fonts do not overwrite the persisted preference automatically.

## 6. Font discovery

Primary approach: Chromium's **Local Font Access API** in the visible trusted renderer. Use `queryLocalFonts()`, group results by family, retain face metadata, deduplicate, and sort for the picker. No font binaries are uploaded, embedded in settings, or bundled from the user's machine. The API exposes family/style/PostScript metadata. [Chrome Local Font Access](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts).

Serve packaged assets through a standard, secure custom scheme such as `labelmaker://app`. Register the scheme before ready, map only known bundled assets, and reject traversal or other hosts. Development uses one fixed loopback origin. This provides a consistent trusted origin rather than granting permissions to arbitrary file URLs. [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol).

Main installs both permission-check and permission-request handlers. Allow `local-fonts` only for the visible app's trusted main frame; deny unrelated permissions and all external origins. Verify packaged startup and refresh without an unexpected permission dead-end. [Electron permission handlers](https://www.electronjs.org/docs/latest/api/session).

This API choice is a phase-0 gate, not an assumption of tested Electron compatibility. If packaged startup or enumeration fails on either platform, implement font enumeration in the existing platform helper (DirectWrite on Windows, CoreText on macOS), behind the same FontCatalog interface. Do not ship a fixed list as a substitute.

Select regular/normal face when available and use the same family/face policy in editor and print renderer. Default to installed Arial; otherwise ask the platform helper for its named default sans-serif family and resolve/load that actual face. A generic CSS alias is not a reported resolved family.

Await `document.fonts.load(...)` for the selected font and text, then `document.fonts.ready`, in both windows. Verify the family still exists before submission; a mid-session removal triggers visible fallback and a new preview revision. A font-load promise alone does not prove every glyph exists. Preserve visible fallback/missing-glyph behavior.

## 7. Editor and canonical layout

Use a plain-text `contenteditable` surface with `role="textbox"`, `aria-multiline="true"`, and an accessible label. Keep its DOM under the editor controller's ownership; React must not replace its text on each keystroke. Styling updates change layout properties without rebuilding the text node.

Represent content canonically as plain text plus selection offsets. Normalize browser-generated line-break/block nodes into LF after input; preserve a trailing blank line using an editing sentinel excluded from serialization. Paste/drop accepts text only. IME composition is allowed to complete before normalization or snapshotting.

Keep an explicit text-edit undo/redo history of before/after text and selection, coalescing adjacent typing and treating paste/composition as single edits. This avoids relying on browser undo after DOM normalization. Toolbar controls preserve selection; global formatting is outside the text undo history in v1. Handle input, composition, selection, and undo shortcuts through one editor controller.

Canonical geometry:

| Value | Portrait | Landscape |
| --- | --- | --- |
| Page, points | 288 × 432 | 432 × 288 |
| Page, CSS px at 96 px/in | 384 × 576 | 576 × 384 |
| Safe inset | 9 pt / 12 CSS px | 9 pt / 12 CSS px |
| Text rectangle, points | 270 × 414 | 414 × 270 |

Use explicit regular font style/weight, `font-synthesis: none`, numeric point size, line-height = 1.2 × point size, `white-space: break-spaces`, `overflow-wrap: anywhere`, no hyphenation, no paragraph margins, and black text on white.

A shared LabelSurface module builds the same text DOM, style properties, and measurement routine for preview and print. Measure untransformed logical coordinates after fonts settle; collect line breaks and rectangles with DOM ranges. Include glyph overhang/ink-boundary cases in the layout spike; do not equate text length with fit. Clip all painted content at the safe rectangle.

Center fitting text vertically. For overflow, align to the top and keep the same clip used in output. Preserve off-canvas text in the model. Prevent browser automatic scrolling from changing the print-preview framing; keyboard editing still addresses the complete model. An accessible full-text editing view may be exposed within the same window if needed to keep clipped content manageable; it must not replace the canonical preview.

A ResizeObserver computes only the outer canvas scale; browser zoom stays fixed at 1 for document layout. Pixel snapping applies to preview UI, not physical text coordinates. Disable spellcheck/autocorrection on label content.

Collect a layout fingerprint per draft revision. On print preparation, the hidden renderer independently recomputes it. Require matching line offsets, overflow, page dimensions, and rectangles within 0.05 pt numerical tolerance; mismatch aborts before spooling and requests preview refresh. This catches layout drift but does not prove physical printer accuracy.

## 8. Printer adapter and capability inspection

Electron `getPrintersAsync()` provides the queue list. Normalize metadata without treating presence as “online.” Match model identity carefully, prefer driver/model identifiers, and reject SP310 identity even if a queue name misleadingly contains SP410. Manual selection uses the confirmed override from the functional specification.

Reconcile each discovered queue with an OS adapter using its exact queue identifier. Changed driver/model/port fingerprint invalidates old manual/USB confirmations. Do not compare by display name alone.

Electron's portable printer record is insufficient to promise paper/hard-margin inspection. Plan a small **read-only native helper per OS**:

- Windows: C++ helper using Winspool for queue/port identity and GDI driver capability inspection. Construct a per-job 4 × 6 DEVMODE, let the driver validate it, then obtain physical size, printable extent, offsets, and resolution from a printer DC. Never change global printer defaults. [Windows device capabilities](https://learn.microsoft.com/en-us/windows/win32/gdi/retrieving-device-data), [GetDeviceCaps](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getdevicecaps).
- macOS: Swift helper using Core Printing for printer/paper information and validated page format. Read paper margins and effective dimensions; query queue transport/status through supported OS printing APIs. [Core Printing](https://developer.apple.com/documentation/applicationservices/core_printing), [PMPaperGetMargins](https://developer.apple.com/documentation/applicationservices/1461994-pmpapergetmargins).

Helpers take bounded JSON over stdin and emit versioned JSON over stdout. Main launches an absolute bundled path with `spawn`, `shell: false`, and hidden windows on Windows. No shell command interpolation, arbitrary paths, print content, raw printer commands, or privileged installation. Build helpers on each native CI runner and package them outside ASAR as resources. They avoid coupling the app to a native Node ABI.

A query has a 10-second timeout; terminate a stuck helper and report an inspection error without freezing editing. Discovery can show “Installed,” but Print stays disabled until required page geometry is validated. Transport/status may remain unknown and follow the functional confirmation rules; unknown page geometry is not silently accepted.

Compare effective media to 101.6 × 152.4 mm within 0.1 mm driver-rounding tolerance; 100 × 150 mm fails. Verify the app's 3.175 mm inset contains the entire reported unprintable boundary. Prefer explicit custom media rather than paper display-name matching. Cache capabilities per queue fingerprint and invalidate on rescan/settings change; revalidate before each print.

Capability inspection establishes the intended driver configuration. It cannot guarantee that Electron and the spooler will honor it identically; the physical driver gate remains mandatory.

## 9. Print pipeline and orientation

Use a hidden BrowserWindow with a restricted print preload and the same bundled LabelSurface code/CSS. Wait for DOM/font readiness and the layout fingerprint before invoking the print API. Keep print content in memory; do not save temporary PDFs or label files.

**Chosen orientation strategy:** always send a portrait 4 × 6 physical sheet. Rotate the landscape composition inside that sheet by 90 degrees clockwise. Do not also enable driver landscape.

- Portrait physical root: 384 × 576 CSS px.
- Landscape logical content: 576 × 384 CSS px.
- Landscape transform: `transform-origin: 0 0; transform: translateX(384px) rotate(90deg)`.
- That transform maps logical x/y to physical (384 − y, x), fitting exactly inside the portrait stock.
- The logical safe area rotates with the content.
- Physical print CSS uses `@page { size: 4in 6in; margin: 0 }`; html/body have zero margins and one fixed page.

Baseline Electron options, validated against the pinned runtime/driver:

```ts
{
  silent: true,
  deviceName: selectedQueue.deviceName,
  pageSize: { width: 101600, height: 152400 }, // micrometres
  landscape: false,                         // rotation is in composition
  margins: { marginType: 'none' },
  scaleFactor: 100,                         // percentage, not PDF scale=1
  color: false,
  copies: snapshot.copies,
  pagesPerSheet: 1,
  duplexMode: 'simplex',
  header: '',
  footer: ''
}
```

Do not rely on the printer default page size, force a guessed DPI, or hide pagination bugs with a first-page-only range. Physical tests must prove no blank trailing page and the correct copy count. The API uses the OS device name; an empty destination can select the default printer, so main rejects it. [Electron print API](https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback).

### Submission protocol

1. Main reserves the request ID and global print lock.
2. Validate snapshot and selected queue; inspect current capabilities.
3. Prepare hidden renderer; independently measure layout.
4. Return an opaque preparation token bound to the immutable snapshot, queue fingerprint, and warnings. If clipping/offline confirmation is required, show that snapshot summary while the editor can continue changing. With no warnings, the originating Print action immediately confirms its token; no second user action is needed.
5. Confirmation uses the token, not arbitrary renderer booleans. Expire tokens after 60 seconds or a queue change. Revalidate queue identity and relevant status/capabilities at confirmation; changed warnings require a new confirmation. Cancel destroys preparation without spooling.
6. Mark `submitting` before the one call to `webContents.print`.
7. Callback success becomes `submitted`, with “Sent to [queue]”. Failure becomes `failed` with safe details.
8. Clean up hidden contents and release locks after the result is known. Retain small in-memory request outcomes for duplicate-ID handling; retain no label history.

Preparation deadline: 15 seconds after capability inspection. Submission watchdog: 30 seconds. A pre-submit timeout can safely fail; a post-submit timeout is **uncertain**, never automatically retried. Keep handling a late callback. Require acknowledgment that the user inspected the OS queue before permitting a new attempt after an uncertain result. This cannot establish exactly-once printing across app crashes.

Closing during preparation cancels preparation. Closing during submission warns that the queue outcome may be unknown; an accepted queued job is never canceled by closing the app.

## 10. IPC and security contract

Expose named methods through `window.api`, never raw invoke/send:

| Method/channel | Purpose |
| --- | --- |
| preferences:get / preferences:update / preferences:reset | Validated defaults and serialized persistence |
| printers:scan / printers:select | Discovery and confirmed selection |
| print:prepare | Freeze, validate, measure; return token/warnings or submission-ready state |
| print:confirm / print:cancel | Resolve one bound preparation |
| print:status | Query a request after reconnect/uncertain UI response |
| print:state event | Status events with request ID and sequence number |
| app:request-close | Flush preferences and run lifecycle guard |

The UI uses the same print action for toolbar and menu shortcut. Subscribe/unsubscribe functions are idempotent; strip IPC event objects before invoking renderer callbacks. Ignore stale request IDs or event sequences.

Validate payloads in main using a small shared schema layer (Zod is the proposed dependency). Restrict point sizes to 6–288 in half-point steps, copies to integers 1–99, orientation/alignment enums, font identity, and the exact selected queue. Bound each text IPC payload to 1 MiB UTF-8; reject oversized edits/pastes visibly without truncating existing content. This is an engineering resource limit added by this draft.

Check the exact trusted origin, expected webContents ID, and top frame for every handler. The print window can only receive its assigned snapshot and report readiness; it cannot choose printers, mutate preferences, or submit jobs.

Both windows use context isolation, disabled Node integration, sandboxing, and denied navigation/new windows/webviews. Serve assets from a fixed manifest under the app protocol. Apply a CSP allowing bundled scripts/styles and local font use, with no remote connections or unsafe script evaluation; allow only the narrowly required dynamic style attributes for geometry. Development exceptions are loopback-only and disabled in packaged builds.

Disable spellcheck and dictionary downloads on sessions before loading content. Do not log text, font inventories, or full IPC payloads. Diagnostics record error code, platform/build/driver versions, geometry, request state, and timings. Unknown errors are sanitized before display.

## 11. Error model

Return discriminated results, not thrown objects serialized through IPC:

```ts
type AppErrorCode =
  | 'INVALID_INPUT' | 'PRINTER_NOT_FOUND' | 'PRINTER_INSPECTION_FAILED'
  | 'UNSUPPORTED_MEDIA' | 'UNPRINTABLE_AREA' | 'FONT_UNAVAILABLE'
  | 'LAYOUT_MISMATCH' | 'SETTINGS_READ_FAILED' | 'SETTINGS_WRITE_FAILED'
  | 'PRINT_PREPARATION_FAILED' | 'PRINT_SUBMISSION_FAILED'
  | 'PRINT_OUTCOME_UNCERTAIN' | 'REQUEST_BUSY' | 'UNSUPPORTED_PLATFORM';
```

Each error supplies a readable message, optional sanitized detail, and an action such as retry discovery, choose font, inspect queue, or correct driver settings. Preserve draft text on every recoverable error. Do not suggest retry for an ambiguous submission without the duplicate-label warning.

## 12. Build, packaging, and CI

Proposed scripts:

| Command | Purpose |
| --- | --- |
| npm run dev | One command: Vite + Electron |
| npm run typecheck | All process tiers and contracts |
| npm run test:unit | Vitest pure logic, adapters with fixtures, settings, state machine |
| npm run test:ui | Playwright browser tests with mocked bridge |
| npm run build:native | Host-platform inspection helper |
| npm run build:app | Main, preload, visible renderer, print renderer |
| npm run test:electron | Real Electron and IPC using built assets |
| npm run package:win / package:mac | Explicit host-platform package, publish disabled |
| npm run test:packaged | Launch packaged artifact; verify assets, helper, bridge, font access |

Single repository and package; no monorepo. Keep manifests/lockfile, specs, source, native-helper source, and tests under Git. Ignore node_modules, generated bundles/helpers, installers, test output, and local diagnostic files.

CI uses Windows and macOS runners only. Jobs run clean install, typecheck, unit/UI tests, native compilation, app build, real Electron tests, packaging, and packaged smoke. UI fixtures must not call real print submission. Physical printing is a separate opt-in hardware test requiring an explicitly configured SP410 queue.

Use read-only CI permissions, commit-pinned actions, and artifact uploads. No remote publication or auto-update configuration in v1. Personal-use installers may be unsigned; macOS arm64 still needs valid ad-hoc signing of executable content. Verify helper execution and first launch in the packaged app rather than assuming development success establishes installation success.

## 13. Verification and functional traceability

| Test layer | Main checks | Functional criteria |
| --- | --- | --- |
| Unit | Units/rotation, limits, defaults, model matching, queue fingerprint invalidation | A01–A05, A07, A10 |
| Unit/service | Preference race/error/reset, request idempotency, timeout and late callback | A13–A16, A20 |
| Browser UI | Editing/IME/undo/paste, font selection, alignment, clipping, resize, accessibility | A06–A12, A18–A19 |
| Real Electron | Trusted IPC, actual font catalog, queue enumeration, hidden layout fingerprint, lifecycle | A02–A06, A14–A16, A20 |
| Packaged | Custom protocol, helper resources, permissions, clean install/start, no network dependencies | A06, A19 |
| Physical SP410 | Portrait/landscape, exact paper, copies, wrap, safe margins, scale, no trailing labels | A10–A14, A17–A18 |

Geometry fixtures must cover 6/24/72/288 pt, 0.5-point values, trailing newlines, long unbroken words, repeated spaces, tabs, missing glyphs, proportional/monospace fonts, mixed scripts, and clipping. IME and selection tests must run in actual Electron as well as browser tests when behavior differs.

Use isolated test userData with an explicit test-only setting. Never read or mutate the user's real preferences in automation. Use fake queues for SP310 exclusion; no SP310 hardware work.

Hardware evidence records OS/architecture, Electron/app/driver versions, queue transport, effective media/margins/resolution, test snapshot identifier, measurements, and photos. Check 50 mm length and 1 mm placement targets, repeated feeding, 1 and 3 copies, both orientations, and offline reconnect behavior. Do not record real user label content in diagnostic evidence.

The same selected font must match preview and print on a given machine. Identical typography across Windows and macOS is not promised when installed fonts or fallback glyphs differ.

## 14. Implementation sequence and release gates

1. **Platform spike:** scaffold pinned toolchain; validate packaged Local Font Access; compile inspection helpers; prove effective 4 × 6 geometry; print portrait and rotated landscape on Windows and macOS. Record exact versions and measured outcomes.
2. **Layout/editor spike:** prove shared layout and fingerprints, whitespace, IME/undo, clipped text editing, and font fallback. Resolve glyph bounds before claiming WYSIWYG.
3. **Core app:** implement window, toolbar, stores, typed bridge, printer selection, settings, and lifecycle.
4. **Print integration:** implement immutable preparations, confirmations, single-flight submission, timeouts, late callbacks, and error messages.
5. **Delivery:** run automated matrix, package/native smoke, and physical acceptance; document supported configurations.

Stop expanding UI work if the first spike cannot achieve actual-size one-page output. A driver-specific adjustment belongs inside the adapter and must preserve the canonical layout; do not silently weaken WYSIWYG or add a second manual export workflow.

Open validation items are specific experiments, not alternative stacks: exact compatible version pins; packaged font enumeration; driver metadata completeness; helper capability equivalence to actual Electron output; glyph-bound measurements; and physical alignment on each supported platform.

A Windows-only success is an implementation milestone, not completion of this Windows/macOS specification. Linux and SP310 each require later scope, adapters, packaging, and acceptance work.

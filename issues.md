# Label Maker — issue log

Working log of problems found in this repository, kept up to date while they are fixed.
Started **2026-11-17 01:44 EST**. Fixes reach `main` (the default branch, renamed from `build-v1` on 2026-11-17) through pull requests; see the run log.

**Severity:** P0 breaks printing, loses data or is a security hole · P1 wrong behavior against the
specs in common use · P2 edge case or hardening · P3 hygiene or polish.
**Status:** Open · Fixed (verified by the check named in the entry) · Decision (needs a product call) · Won't fix.

## Scoreboard

| ID | Sev | Area | Title | Status |
| --- | --- | --- | --- | --- |
| LM-001 | P1 | Print | No submission watchdog; a lost print callback locks Print until restart | Fixed |
| LM-002 | P1 | Print | Paused or errored queues print without the required confirmation | Fixed |
| LM-003 | P2 | Print | Preview/print line-geometry mismatch only logs a warning | Fixed (asks the user; see LM-058) |
| LM-004 | P1 | Printers | A vanished saved queue is silently replaced by another queue (A05) | Fixed |
| LM-005 | P1 | Printers | Failed capability queries report the queue as Ready | Fixed |
| LM-006 | P2 | Printers | No rescan when the window regains focus | Fixed |
| LM-007 | P1 | Fonts | Missing saved font is substituted silently; Refresh Fonts does nothing (A06) | Fixed |
| LM-008 | P1 | Editor | Drag-and-drop bypasses the plain-text sanitizer | Fixed |
| LM-009 | P1 | Editor | Invalid font size or copies revert silently and never block Print (A07, A13) | Fixed |
| LM-010 | P2 | Security | No navigation or new-window guards on either window | Fixed |
| LM-011 | P2 | Security | Sender trust is a string prefix and the dev origin is trusted in packaged builds | Fixed |
| LM-012 | P1 | Security | Printer name is interpolated into a PowerShell script | Fixed |
| LM-013 | P2 | Settings | Corrupt settings load defaults with no notice (A15) | Fixed |
| LM-014 | P2 | Accessibility | Dialogs lack dialog role, focus trap and Escape (A19) | Fixed |
| LM-015 | P1 | CI | No CI on pull requests; UI tests, lint and a real packaged smoke test are missing | Fixed (CI untested until pushed) |
| LM-016 | P3 | CI | No Dependabot for npm and pinned actions | Fixed |
| LM-017 | P3 | Docs | README lacks setup, unsigned-build, testing and limitation notes | Fixed |
| LM-018 | P3 | Repo | No .gitattributes, untracked worktrees/, stale branches | Fixed |
| LM-019 | P2 | Tests | UI tests start a real Electron on the real settings folder; browser path not configurable | Fixed |
| LM-020 | P2 | Printers | Effective media (SP310 default 76.2 × 127 mm) is never validated against the profile | Closed by decision (fixed stock per printer) |
| LM-021 | P2 | Startup | A machine with only an SP310 still opens on 4 × 6 (A01) | Fixed |
| LM-022 | P3 | Print | Preparation tokens and request statuses are never pruned | Fixed |
| LM-023 | P2 | Print | `printer_unverified` confirmation reason was produced but never handled (removed) | Fixed |
| LM-024 | P3 | Deps | `npm audit`: vitest/tinypool (critical) and electron-builder/minimatch (moderate), both dev tooling | Fixed |
| LM-025 | P0 | Editor | A blank line shows once in the editor but prints twice (WYSIWYG break) | Fixed |
| LM-026 | P2 | Security | Pasted HTML is parsed with innerHTML on the live document | Fixed |
| LM-027 | P3 | Performance | Layout measurement reads every character, so a very large label makes each keystroke slow | Fixed |
| LM-028 | P1 | Print | Ctrl+P / Cmd+P ignored the toolbar's disabled state (no printer, invalid fields) | Fixed |
| LM-029 | P1 | Print | When clipping and an unavailable printer both apply, only the first question was asked | Fixed |
| LM-030 | P1 | Print | A stale status timer from an earlier print cleared the busy state of a newer print | Fixed |
| LM-031 | P2 | Print | Users saw raw IPC error text ("Error invoking remote method ...") | Fixed |
| LM-032 | P1 | Print | A confirmation token could print a different, newer label than the one confirmed | Fixed |
| LM-033 | P2 | Print | Two overlapping prepare calls shared the single print window | Fixed |
| LM-034 | P3 | Tests | Test files are not type-checked (tsconfig covers src only) | Fixed |
| LM-035 | P2 | Printers | Paused and errored queues were shown as "Installed" in the status bar | Fixed |
| LM-036 | P2 | Fonts | When the system font list could not be read, a fixed wish list of 14 fonts was offered whether installed or not | Fixed |
| LM-037 | P2 | Settings | One invalid value threw away the whole settings file (spec: reset invalid values individually) | Fixed |
| LM-038 | P3 | Settings | A settings file from a newer version was treated as corrupt and later overwritten | Fixed |
| LM-039 | P2 | Accessibility | Ctrl+P prepared a second label while a confirmation dialog was open | Fixed |
| LM-040 | P2 | Security | The print window's ready report was accepted from any sender without validating its content | Fixed |
| LM-041 | P3 | Security | printers:select, print:cancel and print:status payloads were not validated | Fixed |
| LM-042 | P2 | CI | `test:packaged` was a no-op that listed files and exited 0 | Fixed (macOS untested) |
| LM-043 | P2 | Print | A job sent while the hidden print page was still loading was lost (15 s timeout) | Fixed |
| LM-044 | P2 | Accessibility | Toolbar controls were named "▲", "▼", "L", "C", "R" and had no selected state | Fixed |
| LM-045 | P3 | Accessibility | The font list could not be closed with Escape | Fixed |
| LM-046 | P3 | Security | The content security policy lacked object-src, base-uri and form-action | Fixed |
| LM-047 | P2 | Tests | Nothing checked the page the print window hands to the driver (size, one page, rotation) | Fixed (not physical) |
| LM-048 | P3 | Tests | Second-instance hand-over was untested | Fixed |
| LM-049 | P2 | Tooling | No linter; static analysis found 87 problems, including real bugs | Fixed |
| LM-050 | P2 | Startup | The splash screen could stay on screen with no way to close it if the app page failed to load | Fixed |
| LM-051 | P2 | Printers | Output of the native helpers and PowerShell was parsed untyped and trusted | Fixed |
| LM-052 | P3 | Startup | A failure while starting up was swallowed: no window, no message | Fixed |
| LM-053 | P1 | CI | The first CI run failed on Windows: two test workers raced to download the Electron binary | Fixed |
| LM-054 | P2 | CI / Printers | The first CI run failed on macOS: the printer test fixture had no connection data, and the app ignored the macOS device URI | Fixed (macOS untested) |
| LM-055 | P3 | Deps | Build tools a major version behind (Vite 6, Tailwind 3, plugin-react 4) and Node 22 as the baseline | Fixed |
| LM-056 | P1 | Print | After a 4 × 6 landscape label was the first one shown, the print window reported "fits" for every later label, so the clipped-label question was never asked | Fixed |
| LM-057 | P2 | Print | The print window could measure before React had drawn the new label | Fixed (not reproduced in isolation) |
| LM-058 | P2 | Print | A label that wraps differently on paper than in the preview printed without a word | Fixed |
| LM-059 | P3 | Tests | Spec A09 (same wrapping at any window size and display scale) had no test | Fixed (no defect found) |
| LM-060 | P2 | Accessibility | The Tab key was trapped in the label editor (it typed four spaces), so keyboard users could not leave it | Fixed |
| LM-061 | P2 | Accessibility | The Size and Copies fields showed no sign of keyboard focus | Fixed |
| LM-062 | P2 | Accessibility | Text colours below the 4.5:1 contrast minimum in both themes; the font button turned unreadable under the mouse in the dark theme | Fixed |
| LM-063 | P3 | Accessibility | Each printer choice in Settings was a button holding a radio button (two controls for one choice) | Fixed |
| LM-064 | P3 | Repo | package.json had no author or license, and the packager warned about it on every build | Fixed |
| LM-065 | P2 | CI | The first PR run failed on macOS: four UI tests pressed Ctrl+P, but the app listens for Cmd+P there | Fixed (macOS Electron tests not yet run) |

## Details

### LM-001 · P1 · Print · Fixed
**Where:** `src/main/services/printService.ts` `confirm`.
**Problem:** `isSubmitting` was cleared only inside the print callback, so a callback that never came locked printing until restart.
**Fix:** A 30 s watchdog (configurable for tests). On expiry the result is `PRINT_OUTCOME_UNCERTAIN` and an `uncertain` state event, the lock is released, nothing is retried, and a late callback still produces `submitted` or `failed`. The renderer keeps the warning on screen and, before the next print, asks the user to check the printer queue ("Check the Printer Queue First").
**Verified:** PrintService unit tests with fake timers (before 30 s still busy, at 30 s uncertain and free, late answer handled); UI test for the follow-up question.

### LM-002 · P1 · Print · Fixed
**Where:** `printService.ts` `prepare`.
**Problem:** Only an `offline` queue asked for confirmation; `paused` and `error` printed without asking.
**Fix:** All three add the `printer_unavailable` reason (renamed from `printer_offline`). The dialog names the profile ("4 × 6 (SP410)"), the queue and the reported state.
**Verified:** `it.each(['offline','paused','error'])` unit test; UI tests for the dialog text.

### LM-003 · P2 · Print · Fixed (asks the user; see LM-058)
**Where:** `printService.ts` `prepare`, `layout.ts` `compareFingerprints`.
**Problem:** Technical spec §7 says a fingerprint mismatch aborts before spooling. The code relaxed it to a log line (commit "Allow canonical print renderer geometry") because the editor and the print window disagreed, mostly for 4 × 6 landscape.
**Finding:** The disagreement was not a rounding difference. Both sides were measuring the wrong element in landscape (LM-056), so every landscape label reported one line. A parity run of 405 labels (3 fonts, 3 sizes, 3 layouts, alignments, 11 awkward texts) matched exactly in 377 cases before the fixes; the other 28 were the landscape defect (21) and a stale measurement (7). After the fixes all 405 match within 0.05 pt.
**Fix:** See LM-058. A moved line box is still only logged, a different wrap or overflow answer now asks the user, and a wrong page size still stops the print.

### LM-004 · P1 · Printers · Fixed
**Where:** `src/shared/printerSelection.ts` (new `resolveQueueSelection`), `deviceStore.ts`, `PrinterStatus.tsx`, `SettingsDialog.tsx`.
**Problem:** If the printer the user had chosen was gone, the first other queue for the profile was selected silently, so a label could go to a printer the user never picked.
**Fix:** A saved choice that is missing or unusable yields no selection and a `savedProblem`. The status bar says `Saved SP410 printer "X" not found` (or `needs to be confirmed again`), Settings explains that the choice is remembered, and the user picks another printer explicitly. With nothing saved, auto-selection works as before. Main and the renderer share the same function.
**Verified:** 4 unit tests, including the shape of the real saved settings (fingerprint `"::"`, USB queue) which stays selected; UI test where another SP410 exists but Print stays disabled until the user chooses it; real Electron probe with the real settings shape prepares both profiles.

### LM-005 · P1 · Printers · Fixed
**Where:** `windowsAdapter.ts` `createDefaultCapabilities`, `macosAdapter.ts`.
**Problem:** A failed or timed-out inspection reported the queue as `ready`.
**Fix:** Those paths report `unknown`, shown as "Installed". Real answers from the helper or PowerShell are unchanged.

### LM-006 · P2 · Printers · Fixed
**Where:** `App.tsx`, `deviceStore.ts`.
**Problem:** Queues were scanned at launch and on Rescan only.
**Fix:** Regaining window focus triggers a background scan unless one finished in the last 5 s. Overlapping scans share one request, and a background scan does not flash "Scanning…" in the status bar.
**Verified:** UI test with a fake clock (no scan within 5 s; a printer connected later is found on focus).

### LM-007 · P1 · Fonts · Fixed
**Where:** `fontCatalog.ts`, new `fontStore.ts`, `App.tsx`, `Toolbar.tsx`, `SettingsDialog.tsx`, `LabelEditor.tsx`, `labelStore.ts`.
**Problem:** A saved font that is no longer installed was rendered with the browser's fallback with no notice, and the label printed that way. Refresh Fonts re-read the list and threw the answer away; the toolbar read it once.
**Fix:** One shared font store, read at launch and by Refresh Fonts (which now reports how many families it found). The label's real family is resolved against the installed list: a missing one is replaced by Arial (or the platform default) and an amber notice above the label names both fonts. The saved preference is kept, so the font applies again when it is reinstalled; the print snapshot carries the resolved family.
**Verified:** unit tests for resolution; UI tests (notice, print snapshot uses the replacement, choosing an installed font clears the notice, Refresh brings back a font that was installed meanwhile); real Electron test with a missing saved font and the real font list (more than the 14-name fallback).

### LM-008 · P1 · Editor · Fixed
**Where:** `LabelSurface.tsx`, `LabelEditor.tsx`.
**Problem:** Dropping text, a link or HTML onto the label used the browser's default handler.
**Fix:** The label now uses `contenteditable="plaintext-only"`, so drops (and anything else) insert plain text only, and `handleInput` rewrites tabs and CR characters that arrive that way into the same text that prints.
**Verified:** a real mouse drag of a payload carrying both HTML and plain text inserts only the plain text with the tab expanded; an HTML-only drop inserts nothing; no script ran (UI test `dropping rich text onto the label…`).

### LM-009 · P1 · Editor · Fixed
**Where:** `Toolbar.tsx`, new `src/shared/inputValidation.ts`, new `src/renderer/hooks/usePrintBlockers.ts`.
**Problem:** Invalid size or copies silently snapped back (or, for a size like 24.3, silently rounded) and never blocked Print.
**Fix:** Entries are validated exactly (no rounding or clamping). An invalid entry is kept, marked `aria-invalid`, shown with an inline message, and disables Print and Ctrl+P; Escape restores the last valid value.
**Verified:** 17 unit assertions over valid and invalid strings; UI tests for size and copies, including that Ctrl+P does not call prepare.

### LM-010 · P2 · Security · Fixed
**Where:** `src/main/index.ts` (`web-contents-created`).
**Problem:** Neither window denied `window.open` or navigation. A real click on a `target=_blank` link opened a new Electron window.
**Fix:** Every web contents denies new windows and webviews and cancels navigation (and redirects) to anything that is not the app itself; DevTools in development is left alone.
**Verified:** real Electron test that clicks a popup link and sets `location.href` to a foreign address (fails with the guards removed: 3 windows instead of 2); a navigation to the app's own page still works.

### LM-011 · P2 · Security · Fixed
**Where:** `src/main/ipc/trustedSender.ts`, new `src/shared/appOrigin.ts`, permission handlers in `index.ts`.
**Problem:** Trust was `url.startsWith('labelmaker://app')`, so `labelmaker://app.evil.com/` or `labelmaker://app@evil.com/` passed; the Vite dev origin was trusted in packaged builds; any frame of any app window could call any channel; the error message echoed the sender's URL.
**Fix:** URLs are parsed and compared exactly; the dev origin is trusted only when unpackaged; a message must come from the expected window (the editor for editor channels, the hidden print window for its one channel), from its top frame, and from an app page. Permission checks use the same test.
**Verified:** 14 unit tests (look-alike URLs, dev origin, role separation, sub-frames, closed windows).

### LM-012 · P1 · Security · Fixed
**Where:** `windowsAdapter.ts` `queryPrinterViaPowerShell`.
**Problem:** The queue name was placed inside a PowerShell script with only ASCII quotes doubled. PowerShell also ends a string at typographic quotes (U+2018 to U+201B), so a queue named like `a’; New-Item ...; Get-Printer -Name ‘b` **ran the embedded command**; a harmless name such as `Bob’s Printer` made the script fail to parse, so its status was never read. Reproduced: the test created a file from a crafted name against the old code.
**Fix:** The name is passed in an environment variable and read as `$env:LABELMAKER_QUEUE_NAME`; the error branch uses `ConvertTo-Json`.
**Verified:** Windows-only unit test fails against the old code and passes now; the real SP410BT queue is still read correctly through the new path.

### LM-013 · P2 · Settings · Fixed
**Where:** `settingsService.ts` (`getLoadProblem`), IPC `app:get-launch-info`, `App.tsx`.
**Problem:** A corrupt or unreadable settings file was backed up and defaults loaded, with no message.
**Fix:** The launch info carries a `settingsProblem` (`corrupt`, `newer` or `repaired`, the fields reset, and the name of the saved copy). The app shows a dismissible notice under the toolbar.
**Verified:** unit tests for each kind; real Electron test with a damaged file (notice shown, defaults in use, copy kept, notice dismissible).

### LM-014 · P2 · Accessibility · Fixed
**Where:** new `ModalFrame.tsx`, `ConfirmDialog.tsx`, `SettingsDialog.tsx`.
**Problem:** Dialogs had no dialog role, accessible name or description, no focus handling, no Escape, and the close button had no label.
**Fix:** One shared frame: `role="dialog"` and `aria-modal`, named by the title and described by the message, focus moves in (confirmations start on Cancel so a stray Enter cannot send a label or discard work), Tab and Shift+Tab stay inside, Escape cancels, focus returns to the opener.
**Verified:** three UI tests (Settings Escape and focus return; 80 Tab presses stay inside; confirmation starts on Cancel and Escape cancels).

### LM-015 · P1 · CI · Fixed (CI untested until pushed)
**Where:** new `.github/workflows/ci.yml`, `.github/workflows/build-release.yml`, `scripts/packaged-smoke.mjs`, `vite.config.ts`, `playwright.config.ts`.
**Problem:** Nothing ran on push or pull request; `test:ui` never ran in CI (two UI tests were broken unnoticed); the UI tests' dev server opened a real Electron window.
**Fix:** `ci.yml` runs on every pull request and on pushes to `build-v1`/`main`, on Windows and macOS: install, typecheck (now including tests), unit tests, native helper build (strict), app build, Playwright browser install, UI tests, Electron tests, with traces uploaded on failure. The UI tests' web server now serves only the renderer (`LABELMAKER_NO_ELECTRON=1`), so CI does not need a desktop window for them. The release workflow also smoke-tests each packaged build (non-blocking on macOS, which is untested).
**Verified locally:** every command in the workflow passes here and the YAML parses; the workflow itself has not run on GitHub yet.

### LM-016 · P3 · CI · Fixed
**Fix:** `.github/dependabot.yml` for npm and GitHub Actions, weekly, minor and patch updates grouped.

### LM-017 · P3 · Docs · Fixed
**Fix:** README gained printer setup, what "sent" means, unsigned-installer warnings for Windows and macOS, a Testing section (including the Chromium requirement and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`), a Known limitations list, and accurate feature bullets (font substitution, print safety, settings recovery).

### LM-018 · P3 · Repo · Fixed
**Fixed:** `.gitattributes` (LF everywhere); `worktrees/`, `.worktrees/` and `.claude/worktrees/` ignored. On the owner's go-ahead the stale local branches and their worktrees were removed: `main` (fully contained in `build-v1`), `claude/dazzling-dirac-65c965` (merged) and `codex/label-maker-mvp`. The last carried two commits (`8e7374f`, `1c2d995`) older than the current code, and uncommitted icon edits that are identical to what `build-v1` already has (same PNG hash, same `package.json`, `window.ts` and `index.html` lines). None of these branches existed on origin.
**Left behind:** an empty `.claude/worktrees/dazzling-dirac-65c965` folder that another process holds open; delete it once that session is closed. The nine `dependabot/*` branches on origin belong to open Dependabot pull requests and were not touched.

### LM-019 · P2 · Tests · Fixed
**Where:** `playwright.config.ts`.
**Problem:** The UI test web server opened a real Electron window on the real settings folder, and the Chromium build could not be chosen.
**Fix:** The web server gets an isolated `LABELMAKER_USER_DATA_DIR`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an installed Chromium.
**Verified:** `npx playwright test` passes with the variable set; the real settings file is untouched.

### LM-020 · P2 · Printers · Closed by decision
**Evidence:** The native helper reports the SP310 queue's default paper as 76.2 × 127 mm (3 × 5 in), not DYMO 30334 (57.15 × 31.75 mm). Printing works because Electron is given an explicit page size.
**Decision (owner, 2026-11-17):** Each printer has one fixed stock for now: 4 × 6 in for the SP410 and 2.25 × 1.25 in for the SP310. There is no paper selection and no validation of the driver's default media. Printing on both real printers was checked and looked right.
**If this changes:** paper choice would need the helper's media numbers (already reported by `inspect_printer`) compared with the profile, and a policy for a mismatch.

### LM-021 · P2 · Startup · Fixed
**Where:** new IPC `app:get-launch-info`, `settingsService.ts` `isFreshInstall`, `App.tsx`.
**Problem:** A machine with only an SP310 opened on 4 × 6 with no printer.
**Fix:** If the app starts with no settings file, finds no usable SP410 and finds an SP310, it opens on 2 × 1 and saves that. Later launches restore the saved profile.
**Verified:** three UI tests (SP310 only on first launch; later launch; SP410 present).

### LM-022 · P3 · Print · Fixed
**Where:** `printService.ts`.
**Problem:** Expired preparation tokens stayed in memory until confirmed; request statuses were never removed.
**Fix:** Expired tokens are pruned on every `prepare` and `confirm`; only the 50 most recent request statuses are kept.
**Verified:** unit tests (expired token rejected; 60 jobs keep 50 statuses).

### LM-023 · P2 · Print · Fixed
**Where:** `printService.ts`, `contracts.ts`, `App.tsx`.
**Problem:** The `printer_unverified` reason could be returned but the UI never handled it, so such a job would have been submitted without asking.
**Fix:** Queues whose connection type is unknown can no longer be selected without the USB confirmation in Settings (earlier fix), so the reason was dead. It is removed. The UI now asks every returned confirmation in order.

### LM-024 · P3 · Deps · Fixed
**Evidence:** `npm audit` reported 9 findings (2 critical, 7 moderate): `vitest` and `tinypool` (prototype pollution leading to code execution in test workers), `@vitest/mocker`, and `minimatch` (denial of service) under `electron-builder`. All are build and test tooling, not the shipped app.
**Fix:** `vitest` 3.2.7 to 5.1.0 (its peer ranges allow the current Vite 6 and Node 22); `electron-builder` 26.15 to 26.18.1; `overrides` send the `minimatch` that `app-builder-lib` and `@electron/universal` ask for (9 and 10) to 11.0.1 or later, the first fixed release. `npm audit fix --force` was not used: it proposed an electron-builder 25.1.0 downgrade.
**Verified:** `npm audit` reports 0 vulnerabilities; typecheck, lint, 130 unit, 44 UI and 12 Electron tests pass; `electron-builder --win --dir` builds and the packaged smoke test passes.

### LM-025 · P0 · Editor · Fixed
**Where:** `LabelEditor.tsx`, `LabelSurface.tsx` (the label text was read with `innerText`).
**Problem:** Pressing Enter in a rich `contenteditable` stores a blank line as `<div><br></div>`, and `innerText` reports that as two newlines. The model, the print renderer and the overflow check all used the inflated text, while the editor itself showed the real number of lines. Measured: `a`, Enter, Enter, `b` is 3 lines in the editor (115 px) but 4 lines in the print geometry (154 px); two blank lines were 4 lines in the editor and 6 printed. Anyone who put a blank line in a label got a bigger gap on paper than on screen, and an overflow warning could appear that the preview did not explain.
**Fix:** The editor is now `contenteditable="plaintext-only"`, so Enter inserts a newline character and the DOM text is the model. Text is read with a new `serializeEditableText` (`textModel.ts`) that counts each block as one line and a lone `<br>` as one empty line, which also covers text inserted as blocks by `fill`, dictation or paste tools.
**Verified:** editor height equals print-geometry height for typed Enter sequences in Chromium (UI tests) and in the real Electron app (Electron test); 7 serializer unit tests.

### LM-026 · P2 · Security · Fixed
**Where:** `textModel.ts` `sanitizePastedHtml`.
**Problem:** Clipboard HTML (used when the clipboard has no plain text) was set as `innerHTML` on an element of the live page, so an `<img onerror>` would start loading and its handler could run. The packaged CSP blocks inline handlers, but the dev build has no CSP.
**Fix:** Parse with `DOMParser` into an inert document, then serialize.
**Verified:** UI test pastes `<img src=x onerror=…>` and checks that nothing ran and no markup entered the label.

### LM-027 · P3 · Performance · Fixed
**Where:** `src/renderer/label/layout.ts` `measureLayoutFingerprint`.
**Problem:** Every text change measured every character with its own `Range.getBoundingClientRect()`. About 6,000 characters took ~45 ms; 36,000 characters took ~340 ms (filling the editor until Print was enabled), so pasting a huge block made typing sluggish.
**Fix:** Past `MAX_MEASURED_CHARACTERS` (6,000) the per-character pass is skipped and only the overflow height is read. A label holds well under 6,000 characters even at 6 pt, so such a text is always clipped, and the editor and the print window use the same function so they still agree. The line list for those labels is the single-line fallback.
**Measured:** 36,000 characters now settle in ~46 ms, the same as 1,000.
**Verified:** UI test (just under the limit still measures every line; far over it reports one reading, overflow true, and Print still works); it fails without the cap.

### LM-028 · P1 · Print · Fixed
**Where:** `App.tsx` `handlePrintClick`.
**Problem:** The Print button was disabled when no printer was selected, but Ctrl+P / Cmd+P called the same handler with weaker checks. With no queue it ended in a raw error; with an invalid copies or size entry it would have printed.
**Fix:** One hook, `usePrintBlockers`, decides for both the button and the shortcut (no text, busy, no printer, layout pending, invalid size, invalid copies).
**Verified:** UI tests press Ctrl+P with invalid fields and assert prepare is never called.

### LM-029 · P1 · Print · Fixed
**Where:** `App.tsx` `handlePrintClick` / `handleConfirmClipped`.
**Problem:** If the text was clipped and the printer was also offline, the app showed the clipping question only; confirming it submitted to the offline queue without asking the second question the spec requires.
**Fix:** Confirmations are asked in order (clipped, then unavailable). Cancel at any step discards the preparation and prints nothing.
**Verified:** UI tests for both-reasons, cancel at the second question, and unavailable alone.

### LM-030 · P1 · Print · Fixed
**Where:** `App.tsx` state-event handler.
**Problem:** After a successful print the app scheduled `setPrintBusy(false, '')` for 5 s later (6 s for a failure). If a new print started in that window, the old timer cleared its busy flag mid-submission, re-enabling Print while a job was being sent.
**Fix:** `flashPrintStatus` only clears its own message and only while nothing is busy.
**Verified:** UI test with a fake clock (and confirmed to fail against the old behavior).

### LM-031 · P2 · Print · Fixed
**Problem:** Errors thrown in main reached the status bar as `Preparation error: Error invoking remote method 'print:prepare': Error: ...`.
**Fix:** `describeIpcError` (also used by Settings) strips Electron's wrapper.

### LM-032 · P1 · Print · Fixed
**Where:** `printService.ts`.
**Problem:** The hidden print window holds one label, but tokens for several preparations could exist at once. Confirming an older token after a newer prepare would print the newer label while reporting the older request.
**Fix:** `confirm` only proceeds if the confirmed request is the one currently loaded in the print window; otherwise "The label changed after it was prepared. Print it again."
**Verified:** unit test (and confirmed to fail without the check).

### LM-033 · P2 · Print · Fixed
**Problem:** `prepare` only refused while submitting, so a second call during measurement overwrote the job in the print window.
**Fix:** A preparation lock; a second `prepare` is refused with "in progress".
**Verified:** unit test.

### LM-034 · P3 · Tests · Fixed
**Fix:** `tsconfig.tests.json`; `npm run typecheck` now checks the application and the tests (it found three real type errors in the Electron spec, where a variable named `window` shadowed the page global).

### LM-035 · P2 · Printers · Fixed
**Where:** `PrinterStatus.tsx`.
**Problem:** Only `ready` and `offline` had their own text; `paused` and `error` fell through to "Installed", hiding a real fault.
**Fix:** They read "— Paused" and "— Error" with the warning color.
**Verified:** UI test.

### LM-036 · P2 · Fonts · Fixed
**Where:** `fontCatalog.ts` `enumerateSystemFonts`.
**Problem:** If `queryLocalFonts` was unavailable or denied, 14 common family names were offered as if installed, so picking one that is not installed silently produced the browser's fallback font. The functional spec says not to substitute a fixed list.
**Fix:** Each fallback name is checked against what the machine really has (canvas width probe, because `document.fonts.check` reports true for unknown names) and only installed ones are shown; Settings says when the real list could not be read.
**Verified:** UI test checks every offered name is truly installed.

### LM-037 · P2 · Settings · Fixed
**Where:** `settingsService.ts` `load`, new `src/shared/preferencesRepair.ts`.
**Problem:** Any validation failure (for example a hand-edited font size of 7.3) discarded every saved setting. The spec says to reset invalid values individually and ignore unknown keys.
**Fix:** A version 2 file keeps each valid value and resets only the invalid or missing ones; the notice lists them and a copy of the original is saved.
**Verified:** 6 unit tests.

### LM-038 · P3 · Settings · Fixed
**Problem:** A file with `schemaVersion` above 2 failed both schemas, was treated as corrupt, and the next save replaced it.
**Fix:** It is reported as "saved by a newer version" and a copy is kept before defaults are used. (The spec's stricter rule, keep the file untouched until an explicit reset, is not implemented; the copy means nothing is lost.)

### LM-039 · P2 · Accessibility · Fixed
**Where:** `App.tsx` shortcut handler.
**Problem:** Ctrl+P while a confirmation question was open prepared another label behind it.
**Fix:** The shortcut does nothing while any dialog is open.
**Verified:** UI test (prepare count stays 1).

### LM-040 · P2 · Security · Fixed
**Where:** `ipc/handlers.ts` `print-window:ready`.
**Problem:** `ipcMain.on` accepted the layout report from any sender and trusted its shape.
**Fix:** Only the hidden print window may send it, and the payload is validated (`requestId` UUID, layout fingerprint); a bad report is ignored and the preparation times out.
**Verified:** unit tests for the role check and the schema.

### LM-041 · P3 · Security · Fixed
**Problem:** `printers:select` destructured raw input; `print:cancel` and `print:status` read fields without validation.
**Fix:** zod schemas for all three, with length limits.
**Verified:** unit tests.

### LM-042 · P2 · CI · Fixed (macOS untested)
**Where:** `scripts/packaged-smoke.mjs`.
**Problem:** The script printed the artifact list and exited 0, even when there was nothing to test.
**Fix:** It starts the packaged app (fuses and all) in an isolated profile and drives the renderer over Chromium's debugging port (Playwright's Electron launcher cannot attach because the package disables Node inspector flags). It checks: start-up, the app protocol and assets, title, editor and tabs, the preload bridge, sandbox (no Node globals), installed-font access, a printer scan, a fresh profile, and the bundled helper. It fails if no package exists.
**Verified:** passes against a locally built Windows package.

### LM-043 · P2 · Print · Fixed
**Where:** `printService.ts`, `PrintDocument.tsx`, `preload/print.ts`, `ipc/handlers.ts`.
**Problem:** The hidden print page registers its job listener after it mounts. A job sent before that was dropped, and the preparation failed after 15 s with "layout preparation timed out". It showed up as an intermittent failure of a new Electron test under load; a user who printed within the first moments on a slow machine could hit it.
**Fix:** The print page announces `print-window:listening` once subscribed; `prepare` waits for it (15 s limit, clear message) and the gate closes again whenever the page reloads.
**Verified:** three unit tests (waits, gives up, waits again after a reload); the Electron suite passes five times in a row where it failed one run in two before.

### LM-044 · P2 · Accessibility · Fixed
**Where:** `Toolbar.tsx`.
**Problem:** The accessibility tree listed the size and copies steppers as "▲" and "▼", alignment as "L", "C", "R", and orientation and alignment had no selected state.
**Fix:** Descriptive names ("Increase font size by 1 point", "Align left", "Font family: Arial"...), `aria-pressed` on the orientation and alignment toggles, `aria-expanded` on the font button.
**Verified:** UI tests read the roles and states and reject single-character names.

### LM-045 · P3 · Accessibility · Fixed
**Fix:** Escape closes the font list and returns focus to its button.

### LM-046 · P3 · Security · Fixed
**Fix:** `object-src 'none'; base-uri 'none'; form-action 'none'` added to both pages. The Electron suite, UI suite and packaged smoke test still pass.

### LM-047 · P2 · Tests · Fixed (not physical)
**Where:** new `tests/electron/printLayout.spec.ts`.
**Problem:** Nothing checked what the print window produces. A regression in the page rules or the rotation would only show up on paper.
**Fix:** The label is rendered in the real print window and exported with the same page rules; the PDF is inspected. Checks: exactly one page for every profile and orientation, including text that overflows; page size 288 × 432 pt for 4 × 6 portrait and landscape (landscape is composed sideways on portrait stock) and 162 × 90 pt for the 2 × 1; the landscape text runs top to bottom (a single clockwise quarter turn, not two); all text stays inside the safe inset.
**Limit:** This is the document handed to the driver, not the printer's output. Physical acceptance (A17, A23) still needs the printers.
**Physical check:** On 2026-11-17 the owner printed with both real printers (SP410 and SP310) from `build-v1` at 6b09da4 and reported that it looked good. Not recorded per case: SP310 stock match (LM-020) and the individual print-flow prompts.

### LM-048 · P3 · Tests · Fixed
**Verified:** a second process started with the same settings folder quits by itself with exit code 0, no extra window opens, and the minimised window is restored.

### LM-049 · P2 · Tooling · Fixed
**Where:** new `eslint.config.js`, `npm run lint`, CI step.
**Problem:** The repository had no linter. Running one (ESLint with typescript-eslint's type-aware rules and the full React Hooks rule set) reported 87 problems.
**Fix:** All fixed, and `npm run lint` runs in CI. Real defects it exposed: 8 promises started without handling (a failure would vanish: see LM-050, LM-052), an unnecessary hook dependency, a ref written during render in `ModalFrame`, untyped external data (LM-051), `any` in the preload event bridge, an unused import and dead assignments. The Node requirement is now 22.13 or newer, which ESLint 10 needs.
**Verified:** `npm run lint` clean; all suites pass.

### LM-050 · P2 · Startup · Fixed
**Where:** `src/main/window.ts`.
**Problem:** The frameless splash window closes only when the main window reports ready. If the app page failed to load, it stayed on screen, always on top of nothing, with no title bar to close it.
**Fix:** The main window is shown and the splash closed on a load failure, or after 20 s regardless.

### LM-051 · P2 · Printers · Fixed
**Where:** new `src/main/platform/helperOutput.ts`, both adapters.
**Problem:** `JSON.parse` of the helper, PowerShell and registry output was used as `any`. A malformed answer could put wrong types into queue records.
**Fix:** zod schemas parse all three; unknown statuses and transports become `unknown`; invalid rows are skipped; an error report or garbage means no answer.
**Verified:** 13 unit tests, including the helper's real output for the SP310.

### LM-052 · P3 · Startup · Fixed
**Where:** `src/main/index.ts`.
**Problem:** `app.whenReady().then(bootstrap)` had no failure path, so an error while starting left a running process with no window and no message.
**Fix:** The error is logged, shown in an error box, and the app quits.

### LM-053 · P1 · CI · Fixed
**Where:** `package.json` (`pretest:electron`), CI run 44087775714.
**Problem:** Electron 45 no longer downloads its binary when the package is installed; it fetches it the first time something starts it. `npm run test:electron` runs two Playwright workers that start the app at the same moment, so on a fresh runner both downloaded into the same folder and one failed (`Cannot create a file when that file already exists`, then `Access is denied`). Two print-layout tests failed on Windows. Locally the binary was already there, so it never showed.
**Fix:** `pretest:electron` runs Electron's own installer once before the workers start (a no-op when the binary is present).
**Verified:** all 12 Electron tests pass locally. The fresh-runner case can only be confirmed by a CI run.

### LM-054 · P2 · CI / Printers · Fixed (macOS untested)
**Where:** `printerAdapter.ts` `detectTransport`, `printerService.ts` `scan`, `tests/unit/printerService.test.ts`.
**Problem:** CI on macOS failed `rejects network and Bluetooth queues even when the user confirms them`. The test's fake Electron printer list had no connection data, and on macOS the app only looked at a Windows-style port name, which Electron does not report. A network queue therefore had an unknown connection and could be confirmed as USB. The same gap exists for real macOS users: an unrecognised queue could be confirmed as USB even when CUPS says it is `ipp://` or `socket://`.
**Fix:** On macOS the CUPS `device-uri` from Electron's printer options now stands in for the port, and `detectTransport` reads its scheme (`usb`, `bluetooth`, `ipp`, `ipps`, `http`, `https`, `socket`, `lpd`, `dnssd`, `mdns`, `smb`). A host name such as `usb-hub.local` inside a network URI is not taken for USB. The printer service tests now run once as `win32` and once as `darwin`.
**Verified:** the `darwin` run fails when the URI mapping is removed and passes with it; 130 unit tests pass. No Mac was available: that Electron passes the CUPS `device-uri` option through in `options` is assumed from how CUPS destinations are reported, not observed. If the key is absent the behaviour is as before (unknown connection, USB confirmation required).

### LM-055 · P3 · Deps · Fixed
**Evidence:** Nine Dependabot pull requests opened on the first push (Vite 8, Tailwind 4, plugin-react 6, both electron plugins, @types/node 26, four GitHub Actions). CI, `.node-version` and `engines` were on Node 22, while Electron 45 embeds Node 24.22 and the owner develops on Node 26.
**Fix (all local, nothing merged on GitHub):**
- Vite 6 to 8.3.8, `@vitejs/plugin-react` 6.3.0, `vite-plugin-electron` 1.2.0, `vite-plugin-electron-renderer` 1.0.0. The config uses `import.meta.dirname` and `codeSplitting: false`, which removes the two Vite 8 warnings.
- Tailwind 3.4 to 4.3.5 with `@tailwindcss/postcss`; `autoprefixer` and the empty `tailwind.config.js` are gone. Class names whose meaning changed were renamed (`rounded` to `rounded-sm`, `shadow-sm` to `shadow-xs`, `focus:outline-none` to `focus:outline-hidden`; 31 uses). Two Tailwind 3 defaults the app relied on are kept in `index.css`: the default border colour and the pointer cursor on buttons. Sources are limited to `index.html`, `print.html` and `src/`.
- Node: `.node-version` 26.13.0 (what CI now runs and what the suites were verified on), `engines` `>=24`, `@types/node` 24 (Electron's Node, not the CI Node). The README says so.
- Held on purpose: TypeScript stays on 5.9 (typescript-eslint supports up to 6.0) and `@types/node` on 24; Dependabot is told to skip those two majors.
**Verified:** typecheck, lint, 130 unit, 44 UI, 12 Electron tests and the packaged smoke test; `npm audit` 0 vulnerabilities. Pixel comparison of ten screenshots (light and dark: editor, 2 × 1, settings, font list, confirmation) before and after Tailwind 4: identical layout everywhere. Colours shift slightly because Tailwind 4 uses a new palette (the Print button blue is a little brighter, dark backgrounds differ by a few levels), and the font-list arrow moves by a pixel.
**Not covered:** the four GitHub Actions bumps (checkout 7, setup-node 7, upload-artifact 7, download-artifact 8) were not applied. They are pinned by commit SHA and can only be tested by a CI run; Dependabot's pull requests are the way to take them once CI on `build-v1` is green.

### LM-056 · P1 · Print · Fixed
**Where:** `src/renderer/label/LabelSurface.tsx` (`useImperativeHandle(ref, …, [])`).
**Problem:** The label's measuring handle was created once, when the component first mounted. React reuses DOM elements by position, so when a different layout is shown (4 × 6 portrait, 4 × 6 landscape in print mode, 2 × 1) the text box becomes a new element, or the old one becomes the safe-area wrapper. In the hidden print window, if the first label ever shown was 4 × 6 landscape, the handle pointed at an element that was removed afterwards. Every later label was measured as an empty, detached element: overflow `false`, one line. The `overflow_clipped` question (spec A12) is decided from that report, so a clipped label printed without asking until the app was restarted. If the first label was portrait, landscape was measured on the wrong element (the wrapper), which gave the right overflow answer by luck but one line only. The editor's own measuring copy had the same flaw, hidden because the app always starts on portrait.
**Fix:** The handle is refreshed on every render, so it always points at the real text element.
**Verified:** UI test sends landscape first, then portrait and 2 × 1 labels, and checks overflow and line count each time (fails on the old code: `Expected: true, Received: false`); the same check against the real hidden window in Electron (also fails on the old code); the parity test below fails on the old code with `measured 1 lines for 30 typed`.

### LM-057 · P2 · Print · Fixed (not reproduced in isolation)
**Where:** `src/renderer/print/PrintDocument.tsx`.
**Problem:** The print page measured the label from the job callback: it set the new label, waited for the font and one frame, then measured whatever element was there. If React had not yet drawn the new label, the report described the label shown before. In the parity run this happened in 7 of 405 cases, always a one-line label followed by a big one (the report repeated the previous label's line count).
**Fix:** Measurement now runs in an effect that depends on the job, so it starts only after the page shows that job, and a newer job cancels it.
**Limit:** An isolated test that alternates one-line and 100-line labels did not reproduce the stale report with the old code (it appeared only with two pages taking turns in front), so no test guards this part on its own.

### LM-058 · P2 · Print · Fixed
**Where:** `printService.ts`, `layout.ts` (`compareFingerprints` now says what differs), `App.tsx`, `contracts.ts`.
**Problem:** When the print window wrapped the text differently from the preview, the label printed anyway and only a log line recorded it. The preview is the promise of this app.
**Fix:** A different line count, different line starts or a different overflow answer adds the confirmation `layout_differs` (asked first): "Label May Print Differently … Print it anyway?" with Print Anyway or Cancel. Cancel submits nothing. A small shift of a line box (rectangles beyond 0.05 pt) is only logged, so display scaling and sub-pixel differences cannot block printing, and a page of the wrong size still stops the print. This follows the spirit of spec §7 ("mismatch aborts") but lets the owner decide instead of blocking.
**Verified:** 4 unit tests (wrap differs; overflow differs and the order of the questions; a 0.4 pt shift does not ask; wrong page size still refuses), UI test for the dialog (Cancel and Print Anyway). The parity test (2 fonts × 3 layouts × 2 sizes × alignments × 7 texts, 132 labels) proves that today the editor and the print window agree, so the question only appears when something really diverges.

### LM-059 · P3 · Tests · Fixed (no defect found)
**Where:** new `tests/ui/layoutStability.spec.ts`.
**Check:** Spec A09 asks for the same wrapping at different window sizes and display scales. The same multi-line text (with a blank line and a very long word) is measured at 800 × 600, 1100 × 760, 1600 × 900 and at 150 % and 200 % scale for each of 4 × 6 portrait, 4 × 6 landscape and 2 × 1: the line starts, the overflow answer and every line box agree within 0.05 pt in all 15 combinations.
**Not covered:** the real hidden print window at a non-100 % Windows display scale; the Electron suite runs at the machine's own scale.

### LM-060 · P2 · Accessibility · Fixed
**Where:** `LabelEditor.tsx` `handleKeyDown`.
**Problem:** Tab and Shift+Tab were intercepted to insert four spaces. A keyboard user who reached the label could never move on to the toolbar or the Print button (WCAG 2.1.2 No Keyboard Trap; spec A19). A label has no use for tab stops, and typed or pasted tabs are turned into spaces anyway.
**Fix:** The key handling is removed; Tab and Shift+Tab move focus as usual.
**Verified:** UI test (fails on the old code: focus stays in the editor and nothing else changes).
**Note for the owner:** the Tab key no longer indents text in the label.

### LM-061 · P2 · Accessibility · Fixed
**Where:** `Toolbar.tsx` (Size and Copies fields).
**Problem:** Both text fields hid the browser's focus outline and had no replacement, so there was no visible sign that they had keyboard focus (WCAG 2.4.7).
**Fix:** The box around each field gets a blue border and ring while it has focus.
**Verified:** a test tabs through every control of the main window in both themes and through the Settings dialog and requires a visible outline or ring on each; it fails on the old toolbar for exactly these two fields.

### LM-062 · P2 · Accessibility · Fixed
**Where:** `Toolbar.tsx`, `SettingsDialog.tsx`.
**Problem:** axe-core reported colour-contrast failures of 2.4:1 to 3.9:1: the grey "Stock:" label and the "pt" unit in the light theme, the "Size:", "Copies:" and help texts in the dark theme, and the blue text of the selected tab and orientation button in the dark theme. Separately, hovering the font button in the dark theme turned it near-white while its text stayed light (1.2:1, unreadable).
**Fix:** Darker greys in the light theme, lighter greys (`dark:text-slate-400`) in the dark theme, `blue-300` for the selected buttons in the dark theme, and a dark hover colour for the font button.
**Verified:** axe-core (new dev dependency `@axe-core/playwright`) now runs on the main window, the 2 × 1 profile, the open font list, the Settings dialog and a confirmation dialog in both themes: 10 tests, no violations at WCAG 2.1 A and AA.

### LM-063 · P3 · Accessibility · Fixed
**Where:** `SettingsDialog.tsx`.
**Problem:** Each printer choice was a `<button>` with an `<input type="radio">` inside it: two tab stops and two announcements for one choice (axe: nested-interactive).
**Fix:** Each row is one `role="radio"` button with `aria-checked`, inside a `role="radiogroup"` named "Printer for 4 × 6 labels" (or 2 × 1); the circle is drawn, not a control.
**Verified:** the axe test above, and the existing printer-selection UI tests (updated to find the rows as radio buttons).

### LM-064 · P3 · Repo · Fixed
**Where:** `package.json`.
**Problem:** electron-builder printed "author is missed in the package.json" on every build, and the installer metadata had no publisher name.
**Fix:** `author` is `dwyerwilliam` (the name in LICENSE) and `license` is `MIT`.
**Verified:** the packager no longer warns.

### LM-065 · P2 · CI · Fixed (macOS Electron tests not yet run)
**Where:** `tests/ui/fieldValidation.spec.ts`, `tests/ui/dialogs.spec.ts`.
**Problem:** On macOS the print shortcut is Cmd+P (`App.tsx` checks `metaKey` there). Four tests pressed `Control+p`, so on the macOS runner `Ctrl+P prints when every field is valid` found no print and failed, and the `test:electron` step after it was skipped. Windows passed all steps on the same run. This is a test portability slip, not an app defect; the other three tests passed vacuously on macOS.
**Fix:** The tests press `ControlOrMeta+p`.
**Also:** the branch `build-v1` was renamed `main` on GitHub on the owner's request, so `ci.yml` no longer lists `build-v1`.
**Limit:** the macOS `test:electron` step has not yet run on any macOS runner, so more failures may appear there.

## Run log

- 2026-11-17 01:44 EST — file created from the first code review plus the zod upgrade work.
- 2026-11-17 01:57 EST — LM-019, LM-008, LM-025, LM-026 fixed; LM-027 logged. Editor audit probes showed live and printed heights differ for any blank line.
- 2026-11-17 02:03 EST — LM-001, LM-002, LM-009, LM-022, LM-023 fixed; LM-028 to LM-033 found and fixed while testing the print flow; LM-034 logged.
- 2026-11-17 02:07 EST — LM-004, LM-005, LM-006, LM-021 fixed; LM-035 found and fixed. Real saved settings (fingerprint "::") still select both printers.
- 2026-11-17 02:10 EST — LM-007 and LM-036 fixed (font resolution, shared font store, working Refresh Fonts).
- 2026-11-17 02:12 EST — LM-013, LM-014 fixed; LM-037, LM-038, LM-039 found and fixed (settings repair, dialog accessibility).
- 2026-11-17 02:19 EST — LM-010, LM-011, LM-012 fixed (LM-012 turned out to be real command injection through a printer name); LM-040, LM-041 found and fixed.
- 2026-11-17 02:22 EST — LM-015 to LM-018, LM-034, LM-042: CI workflow, Dependabot, .gitattributes, real packaged smoke test, README, tests included in typecheck.
- 2026-11-17 02:33 EST — LM-043 to LM-048: print-page handshake (intermittent lost job), toolbar accessibility, stricter CSP, print-document PDF tests, second-instance test.
- 2026-11-17 07:47 EST — LM-049 to LM-052: ESLint added (87 findings fixed), splash failsafe, typed helper output, startup failure handling. Full suite green: 123 unit, 12 Electron, 44 UI, packaged smoke.
- 2026-11-17 09:08 EST — Owner tested both real printers (SP410, SP310) from `build-v1` at 6b09da4: "looks good". Pushed to origin earlier; CI run 44087775714 not yet checked.
- 2026-11-17 09:17 EST — Owner confirmed both printers print correctly and decided: fixed stock per printer (4 × 6 and 2.25 × 1.25), no paper selection, stale branches may go, audit flags and version bumps wanted. First CI run (44087775714) had failed: LM-053 and LM-054 found and fixed. LM-018 (branches), LM-020 (closed by decision) and LM-024 (0 vulnerabilities) done.
- 2026-11-17 09:25 EST — LM-055: Vite 8, Tailwind 4 and Node 26/24 baseline done and verified (0 audit findings). Visual baseline compared before and after Tailwind 4.
- 2026-11-17 10:08 EST — LM-056 to LM-059: a layout-parity experiment (405 labels) found that the print window measured the wrong element after a landscape-first session (clipped-label question skipped) and sometimes measured before the new label was drawn. Fixed; the spec's preview/print mismatch check is back as a question to the user (LM-003 closed). New tests: layout parity, print document, resize and display scale, overflow indicator, real-Electron overflow report.
- 2026-11-17 10:10 EST — LM-027 fixed (measurement capped at 6,000 characters; 36,000 characters 340 ms to 46 ms).
- 2026-11-17 10:16 EST — LM-060 to LM-063 from keyboard and axe-core checks: Tab trap in the editor, no focus ring on Size/Copies, contrast failures in both themes (and an unreadable hovered font button in the dark theme), nested radio-in-button. Fixed with permanent tests.
- 2026-11-17 11:17 EST — PR 10 merged. The default branch `build-v1` was renamed `main` on GitHub and locally. First PR run: Windows passed every step; macOS failed one UI test (LM-065), fixed here.

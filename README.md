# Label Maker

[![Build installers and release](https://github.com/dwyerwilliam/LabelMakerWD/actions/workflows/build-release.yml/badge.svg)](https://github.com/dwyerwilliam/LabelMakerWD/actions/workflows/build-release.yml)
[![Latest release](https://img.shields.io/github/v/release/dwyerwilliam/LabelMakerWD?label=latest)](https://github.com/dwyerwilliam/LabelMakerWD/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A single-window desktop application for editing and direct thermal printing of 4 × 6 labels to the **iDPRT SP410** family and fixed-landscape 2 × 1 labels to the **iDPRT SP310** using DYMO 30334 stock over USB.

Based on [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) and [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md).

## Platform and label support

This application has only been tested on Windows 11. It has not been tested on other Windows versions or operating systems. The macOS build is experimental and currently untested; it may be tested and confirmed in the future. A macOS installer does not imply that printing or other features work on macOS.

The supported label profiles are 4 × 6 for the iDPRT SP410 and 2 × 1 for the iDPRT SP310 with DYMO 30334 stock (actual size 2.25 × 1.25 inches). Additional label sizes are not planned.

## Downloads

- [Latest release](https://github.com/dwyerwilliam/LabelMakerWD/releases/latest)
- [Release history](https://github.com/dwyerwilliam/LabelMakerWD/releases)

Choose `LabelMaker-Setup-<version>.exe` for Windows 11 x64, or the `arm64` (Apple Silicon) or `x64` (Intel) DMG for macOS. The Windows and macOS installers are built without publisher signing; macOS packages are not notarized, and the operating system may warn or block them. macOS support remains unverified. Releases include `SHA256SUMS.txt` for checking download integrity.

## Building releases

To make a release, update the version in `package.json` and `package-lock.json`, commit and push the changes, then push a matching tag (for example, `v0.1.0`). The release workflow builds all three installers, checks the tag against the package version, and publishes them with SHA-256 checksums only after every build succeeds. A manual **Build installers and release** workflow run builds downloadable Actions artifacts without publishing a release; these artifacts expire after 14 days.

## Architecture & Technology Stack

- **Framework:** Electron (isolated, context-isolated, secure custom scheme `labelmaker://app`)
- **UI:** React 19, strict TypeScript, Zustand 5
- **Build:** Vite + `vite-plugin-electron`
- **Styling:** Tailwind CSS for application chrome, isolated plain CSS (`label.css`) for physical geometry and printing
- **Testing:** Vitest for pure logic & contract schemas, Playwright for browser UI & real Electron tests

## Features

- **Strict 4 × 6 Inch Geometry:** Fixed physical dimensions (288 × 432 pt / 384 × 576 CSS px) with safe 0.125-inch margin on all edges.
- **Fixed 2 × 1 Profile:** UX profile name for the SP310/DYMO 30334 stock, rendered at the actual 2.25 × 1.25 inch landscape geometry.
- **Portrait & Landscape:** Single-sheet physical orientation with automatic 90-degree rotational mapping for landscape layout.
- **WYSIWYG Editor:** Direct editing on the label surface with vertical centering when text fits, and automatic clipping with warning when text overflows.
- **Local Font Discovery:** Accesses installed system fonts via Chromium's Local Font Access API with case-insensitive search and fallback substitution.
- **Direct USB Printer Profiles:** Automatically recognizes SP410/SP410BT and SP310 queues, assigns them to the matching size profile, and provides profile-specific confirmation for renamed queues.
- **Atomic Settings Persistence:** Versioned atomic writes to Electron's per-user `userData/settings.json`, including migration from the original SP410-only preferences.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run unit tests
npm run test:unit

# Run type check
npm run typecheck

# Build application bundles
npm run build:app

# Run real Electron integration test
npm run test:electron

# Build installer for Windows
npm run package:win
```

## License

This project is licensed under the [MIT License](LICENSE).

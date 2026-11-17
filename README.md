# Label Maker

A single-window desktop application for editing and direct thermal printing of 4 × 6 labels to the **iDPRT SP410** family and fixed-landscape 2 × 1 labels to the **iDPRT SP310** using DYMO 30334 stock over USB.

Based on [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) and [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md).

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

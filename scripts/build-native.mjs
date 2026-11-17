import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// The directory name must match both the lookup paths in
// src/main/platform/*Adapter.ts and the `native-bin/${platform}` entry in the
// electron-builder extraResources config (process.platform: win32 / darwin).
const outputDir = path.resolve('native-bin', process.platform);

// CI and release builds must never silently ship without the inspection
// helper. Local development may fall back to the PowerShell/JS queries.
const requireNative = process.env.CI === 'true' || process.env.REQUIRE_NATIVE === '1';

function failOrWarn(message, error) {
  const detail = error?.message ? `: ${error.message}` : '';
  if (requireNative) {
    console.error(`${message}${detail}`);
    process.exit(1);
  }
  console.warn(`${message}${detail} - continuing without the native helper (JS fallback).`);
}

if (!isWin && !isMac) {
  console.log(`No native inspection helper for ${process.platform}; nothing to build.`);
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });

if (isWin) {
  const src = path.resolve('native/windows/inspect_printer.cpp');
  const out = path.resolve(outputDir, 'inspect_printer.exe');
  // Link into the temp directory first and copy the result. Linking straight
  // into the repository folder failed with "cannot open output file" on a
  // Windows 11 machine while the same link into a temp folder succeeded.
  const staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'labelmaker-native-')), 'inspect_printer.exe');

  // Check for g++ in MSYS2 or PATH
  let gxx = 'g++';
  if (fs.existsSync('C:\\msys64\\mingw64\\bin\\g++.exe')) {
    gxx = 'C:\\msys64\\mingw64\\bin\\g++.exe';
  } else if (fs.existsSync('C:\\msys64\\ucrt64\\bin\\g++.exe')) {
    gxx = 'C:\\msys64\\ucrt64\\bin\\g++.exe';
  }

  try {
    console.log(`Compiling Windows inspection helper with ${gxx}...`);
    execFileSync(
      gxx,
      [
        '-O2',
        // The helper's entry point is wmain (wide-character argv).
        '-municode',
        // Do not depend on MinGW runtime DLLs being present on the user's machine.
        '-static',
        '-static-libgcc',
        '-static-libstdc++',
        src,
        '-o',
        staged,
        '-lwinspool',
        '-lgdi32',
      ],
      {
        stdio: 'inherit',
        // MinGW's compiler needs its own bin directory on PATH to find its DLLs.
        env: path.isAbsolute(gxx)
          ? { ...process.env, PATH: `${path.dirname(gxx)}${path.delimiter}${process.env.PATH ?? ''}` }
          : process.env,
      }
    );
    fs.copyFileSync(staged, out);
    console.log(`Successfully built ${out}`);
  } catch (error) {
    fs.rmSync(out, { force: true });
    failOrWarn('Windows inspection helper build failed', error);
  } finally {
    fs.rmSync(path.dirname(staged), { recursive: true, force: true });
  }
} else if (isMac) {
  const src = path.resolve('native/macos/inspect_printer.swift');
  const out = path.resolve(outputDir, 'inspect_printer');
  try {
    console.log('Compiling macOS inspection helper with swiftc...');
    execFileSync('swiftc', ['-O', src, '-o', out, '-framework', 'ApplicationServices'], { stdio: 'inherit' });
    console.log(`Successfully built ${out}`);
  } catch (error) {
    fs.rmSync(out, { force: true });
    failOrWarn('macOS inspection helper build failed', error);
  }
}

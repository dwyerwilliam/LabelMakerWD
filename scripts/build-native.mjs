import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const outputDir = path.resolve('native-bin', isWin ? 'win32' : isMac ? 'darwin' : 'linux');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

if (isWin) {
  const src = path.resolve('native/windows/inspect_printer.cpp');
  const out = path.resolve(outputDir, 'inspect_printer.exe');

  // Check for g++ in MSYS2 or PATH
  let gxx = 'g++';
  if (fs.existsSync('C:\\msys64\\mingw64\\bin\\g++.exe')) {
    gxx = 'C:\\msys64\\mingw64\\bin\\g++.exe';
  } else if (fs.existsSync('C:\\msys64\\ucrt64\\bin\\g++.exe')) {
    gxx = 'C:\\msys64\\ucrt64\\bin\\g++.exe';
  }

  try {
    console.log(`Compiling Windows inspection helper with ${gxx}...`);
    execSync(`"${gxx}" -O2 "${src}" -o "${out}" -lwinspool -lgdi32`, { stdio: 'inherit' });
    console.log(`Successfully built ${out}`);
  } catch (err) {
    console.warn('Native Windows compiler not found or build failed, using JS fallback');
  }
} else if (isMac) {
  const src = path.resolve('native/macos/inspect_printer.swift');
  const out = path.resolve(outputDir, 'inspect_printer');
  try {
    console.log('Compiling macOS inspection helper with swiftc...');
    execSync(`swiftc -O "${src}" -o "${out}" -framework ApplicationServices`, { stdio: 'inherit' });
    console.log(`Successfully built ${out}`);
  } catch (err) {
    console.warn('Swift compiler not available, using fallback');
  }
}

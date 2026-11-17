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

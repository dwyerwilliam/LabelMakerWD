// Generates the synthetic shipping-label PDFs in tests/fixtures/shipping/.
// Run with `npm run fixtures:shipping` and commit the output. Nothing here is a real label:
// every page says SAMPLE — NOT A REAL LABEL and uses made-up addresses.
//
// Coordinates below are written from the TOP-LEFT of the page, in points; `box()` and `text()`
// convert them to pdf-lib's bottom-left origin.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const outDir = path.resolve(import.meta.dirname, '..', 'tests', 'fixtures', 'shipping');
mkdirSync(outDir, { recursive: true });

const LETTER = [612, 792];
const BLACK = rgb(0, 0, 0);

function helpers(page, font) {
  const H = page.getHeight();
  const box = (x, y, w, h, opts = {}) =>
    page.drawRectangle({ x, y: H - y - h, width: w, height: h, color: opts.fill === false ? undefined : BLACK, borderColor: opts.border ? BLACK : undefined, borderWidth: opts.border ?? 0 });
  const text = (s, x, y, size = 10) => page.drawText(s, { x, y: H - y - size, size, font, color: BLACK });
  const hline = (x1, x2, y, thickness = 0.5, dash) =>
    page.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness, color: BLACK, dashArray: dash });
  return { box, text, hline };
}

/** Deterministic barcode-like bars filling w × h at (x, y). */
function barcode(box, x, y, w, h, seed = 7) {
  let cx = x;
  let s = seed;
  let dark = true;
  while (cx < x + w) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const bw = 1 + (s % 4);
    if (dark) box(cx, y, Math.min(bw, x + w - cx), h);
    cx += bw;
    dark = !dark;
  }
}

/** A fake 2D code: a grid of filled cells. */
function matrixCode(box, x, y, size, seed = 3) {
  const n = 20;
  const cell = size / n;
  let s = seed;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const finder = (r < 5 && c < 5) || (r < 5 && c >= n - 5) || (r >= n - 5 && c < 5);
      if (finder ? r % 4 === 0 || c % 4 === 0 || (r % 5 === 2 && c % 5 === 2) : s % 2 === 0) box(x + c * cell, y + r * cell, cell, cell);
    }
  }
}

/** Portrait 4 × 6 label content (288 × 432 pt) with its top-left at (x, y). */
function portraitLabel(h, x, y, { border = true } = {}) {
  const { box, text, hline } = h;
  if (border) box(x, y, 288, 432, { fill: false, border: 1 });
  text('SAMPLE — NOT A REAL LABEL', x + 14, y + 12, 11);
  text('FROM: Test Sender, 1 Example Way, Nowhere, ZZ 00000', x + 14, y + 32, 7);
  matrixCode(box, x + 14, y + 52, 80);
  text('PRIORITY', x + 110, y + 60, 22);
  hline(x, x + 288, y + 145, 2);
  text('SHIP TO:', x + 14, y + 158, 9);
  text('PAT EXAMPLE', x + 30, y + 174, 12);
  text('123 FICTIONAL STREET APT 4', x + 30, y + 190, 12);
  text('SAMPLETOWN ZZ 00000-0000', x + 30, y + 206, 12);
  hline(x, x + 288, y + 240, 2);
  text('TRACKING # (FAKE)', x + 80, y + 252, 9);
  barcode(box, x + 44, y + 268, 200, 60);
  text('0000 0000 0000 0000 0000 00', x + 60, y + 334, 10);
  hline(x, x + 288, y + 360, 1);
  text('Not valid for postage. Test fixture only.', x + 40, y + 380, 8);
}

/** Landscape 6 × 4 label content (432 × 288 pt) with its top-left at (x, y). */
function landscapeLabel(h, x, y) {
  const { box, text, hline } = h;
  box(x, y, 432, 288, { fill: false, border: 1 });
  text('SAMPLE — NOT A REAL LABEL', x + 14, y + 12, 11);
  text('SHIP TO: PAT EXAMPLE', x + 14, y + 40, 12);
  text('123 FICTIONAL STREET, SAMPLETOWN ZZ 00000', x + 14, y + 56, 10);
  matrixCode(box, x + 330, y + 20, 80, 11);
  hline(x, x + 432, y + 120, 2);
  barcode(box, x + 30, y + 140, 370, 70, 19);
  text('TRACKING (FAKE) 1Z 000 000 00 0000 0000', x + 90, y + 220, 10);
  text('Not valid for postage. Test fixture only.', x + 120, y + 260, 8);
}

function packingSlip(h, top) {
  const { text, hline } = h;
  text('PACKING SLIP (SAMPLE)', 36, top, 14);
  for (let i = 0; i < 5; i++) {
    const y = top + 30 + i * 28;
    hline(36, 576, y, 0.5);
    text(`Item ${i + 1} — Example product description, qty 1`, 40, y + 8, 10);
    text(`$${(i + 1) * 3}.00`, 520, y + 8, 10);
  }
  hline(36, 576, top + 30 + 5 * 28, 0.5);
}

async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle('Synthetic shipping label fixture');
  doc.setProducer('Label Maker fixtures');
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  return { doc, font };
}

async function save(doc, name) {
  const bytes = await doc.save({ useObjectStreams: false });
  writeFileSync(path.join(outDir, name), bytes);
  console.log(`wrote ${name} (${bytes.length} bytes)`);
}

// ebay-letter.pdf: label top-left, packing slip below.
{
  const { doc, font } = await newDoc();
  const page = doc.addPage(LETTER);
  const h = helpers(page, font);
  portraitLabel(h, 36, 36);
  packingSlip(h, 500);
  await save(doc, 'ebay-letter.pdf');
}

// ups-letter.pdf: landscape label in the top half, dashed fold line, instructions below.
{
  const { doc, font } = await newDoc();
  const page = doc.addPage(LETTER);
  const h = helpers(page, font);
  landscapeLabel(h, 90, 40);
  h.hline(0, 612, 396, 1, [6, 4]);
  for (let i = 0; i < 12; i++) {
    h.text('Instructions (sample): fold the page along the line, place the label in a pouch.', 40, 430 + i * 26, 10);
  }
  await save(doc, 'ups-letter.pdf');
}

// label-4x6.pdf and label-6x4.pdf: the page is the label.
{
  const { doc, font } = await newDoc();
  const page = doc.addPage([288, 432]);
  portraitLabel(helpers(page, font), 0, 0, { border: false });
  await save(doc, 'label-4x6.pdf');
}
{
  const { doc, font } = await newDoc();
  const page = doc.addPage([432, 288]);
  const h = helpers(page, font);
  landscapeLabel(h, 0, 0);
  await save(doc, 'label-6x4.pdf');
}

// two-page.pdf: page 1 only a packing slip, page 2 the eBay-style label.
{
  const { doc, font } = await newDoc();
  packingSlip(helpers(doc.addPage(LETTER), font), 60);
  const p2 = helpers(doc.addPage(LETTER), font);
  portraitLabel(p2, 36, 36);
  packingSlip(p2, 500);
  await save(doc, 'two-page.pdf');
}

// no-label.pdf: one wide text block, nothing label-shaped.
{
  const { doc, font } = await newDoc();
  const page = doc.addPage(LETTER);
  const h = helpers(page, font);
  for (let i = 0; i < 9; i++) h.text('This page has a short wide paragraph and no shipping label on it at all.', 54, 300 + i * 16, 11);
  await save(doc, 'no-label.pdf');
}

// encrypted.pdf: pdf-lib cannot encrypt, so this is a minimal hand-written PDF whose
// trailer has a Standard security handler /Encrypt dictionary. Its /U value does not match
// the empty password, so readers (pdf.js included) ask for a password.
{
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <${'11'.repeat(32)}> /U <${'22'.repeat(32)}> >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 4 0 R /ID [<${'ab'.repeat(16)}> <${'ab'.repeat(16)}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(path.join(outDir, 'encrypted.pdf'), out, 'latin1');
  console.log(`wrote encrypted.pdf (${out.length} bytes)`);
}

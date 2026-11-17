import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi';
import { installPrintApi, sendJob, makeJob } from './support/printPage';
import { compareFingerprints } from '../../src/renderer/label/layout';
import type { LayoutFingerprint } from '../../src/shared/contracts';

// The label you see in the editor must wrap, fit and overflow exactly as the page that is
// printed. The editor measures an off-screen copy of the label; the print window measures its
// own. This sends the same label to both and compares what they measured, for every layout,
// several fonts and sizes, and texts that are awkward to wrap.

const FONTS = ['Arial', 'Times New Roman'];
const SIZES = [12, 48];
const TEXTS: Record<string, string> = {
  word: 'Hello',
  sentence: 'The quick brown fox jumps over the lazy dog and keeps running',
  blankLine: 'Top\n\nBottom',
  longWord: 'Supercalifragilisticexpialidocious_and_more_characters_without_spaces',
  trailingSpaces: 'Trailing spaces   \nNext line   ',
  unicode: 'Ünïcödé — 日本語 テキスト 😀 émoji',
  manyLines: Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n'),
};
const ALIGNMENTS = [
  ['Align left', 'left'],
  ['Align center', 'center'],
  ['Align right', 'right'],
] as const;
const LAYOUTS = [
  { name: '4 × 6 portrait', tab: '4 × 6', orientation: 'Portrait', button: 'Print 4 × 6', profile: '4x6', orientationValue: 'portrait' },
  { name: '4 × 6 landscape', tab: '4 × 6', orientation: 'Landscape', button: 'Print 4 × 6', profile: '4x6', orientationValue: 'landscape' },
  { name: '2 × 1', tab: '2 × 1', orientation: null, button: 'Print 2 × 1', profile: '2x1', orientationValue: 'landscape' },
] as const;

for (const font of FONTS) {
  test(`${font}: the print window lays every label out like the editor`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    try {
      const editorPage = await context.newPage();
      await installMockApi(editorPage, {
        queues: ['4x6', '2x1'],
        savedFont: font,
        installedFonts: ['Arial', 'Times New Roman', 'Courier New'],
      });
      await editorPage.goto('/');
      const printPage = await context.newPage();
      await installPrintApi(printPage);
      await printPage.goto('/print.html');

      const problems: string[] = [];
      let cases = 0;

      for (const layout of LAYOUTS) {
        await editorPage.bringToFront();
        await editorPage.getByRole('tab', { name: layout.tab }).click();
        if (layout.orientation) await editorPage.getByRole('button', { name: layout.orientation, exact: true }).click();

        for (const size of SIZES) {
          const sizeBox = editorPage.getByRole('textbox', { name: 'Size:' });
          await sizeBox.fill(String(size));
          await sizeBox.press('Enter');

          for (const [alignButton, alignment] of ALIGNMENTS) {
            await editorPage.getByRole('button', { name: alignButton, exact: true }).click();

            for (const [textName, text] of Object.entries(TEXTS)) {
              // Alignment only moves a line sideways; two texts are enough to cover it.
              if (alignment !== 'center' && textName !== 'sentence' && textName !== 'blankLine') continue;

              // A page in the background does not lay out or measure, so the editor goes back to the front each time.
              await editorPage.bringToFront();
              const editor = editorPage.getByRole('textbox', { name: 'Label text editor' });
              await editor.click();
              await editor.fill(text);
              await editorPage.getByRole('button', { name: layout.button, exact: true }).click();
              const snapshot = await editorPage.evaluate(
                () => (window as unknown as { __mock: { lastSnapshot: unknown } }).__mock.lastSnapshot
              ) as { expectedLayout: LayoutFingerprint; fontSizePt: number; resolvedFontFamily: string };

              await printPage.bringToFront();
              const measured = await sendJob(
                printPage,
                makeJob(layout.profile, layout.orientationValue, text, {
                  fontSizePt: size,
                  fontFamily: snapshot.resolvedFontFamily,
                  alignment,
                })
              );

              cases += 1;
              const comparison = compareFingerprints(snapshot.expectedLayout, measured as LayoutFingerprint, 0.05);
              // Both sides can only agree on nonsense if they measure the wrong thing, so also check the
              // measurement is sane: a label has at least one line for each line of text typed.
              const typedLines = text.split(String.fromCharCode(10)).length;
              const measuredLines = (measured as LayoutFingerprint).lineTextOffsets.length;
              if (measuredLines < typedLines) {
                problems.push(`${layout.name} / ${size} pt / ${alignment} / ${textName}: measured ${measuredLines} lines for ${typedLines} typed`);
              }
              if (!comparison.match) {
                problems.push(`${layout.name} / ${size} pt / ${alignment} / ${textName}: ${comparison.reason}`);
              }
            }
          }
        }
      }

      expect(cases, 'cases compared').toBeGreaterThan(60);
      expect(problems, `layouts that differ between editor and print window:\n${problems.join('\n')}`).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

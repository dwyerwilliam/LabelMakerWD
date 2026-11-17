import { test, expect, type Page } from '@playwright/test';
import { installMockApi, lastSnapshot } from './support/mockApi';

const printButton = (page: Page) => page.getByRole('button', { name: 'Print 4 × 6', exact: true });
const notice = (page: Page) => page.getByRole('status').filter({ hasText: 'is not installed on this computer' });

async function liveFontFamily(page: Page): Promise<string> {
  return page.evaluate(() => {
    const live = [...document.querySelectorAll<HTMLElement>('.label-text-container')].find((box) => box.isContentEditable)!;
    return getComputedStyle(live).fontFamily;
  });
}

test('a saved font that is not installed is replaced visibly, and the label prints in the replacement', async ({ page }) => {
  await installMockApi(page, { savedFont: 'Papyrus', installedFonts: ['Arial', 'Verdana'] });
  await page.goto('/');

  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText('"Papyrus"');
  await expect(notice(page)).toContainText('"Arial"');
  // The saved preference is still what the toolbar shows.
  await expect(page.getByTitle('Select Font Family')).toContainText('Papyrus');
  expect(await liveFontFamily(page)).toContain('Arial');

  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.fill('Hello');
  await printButton(page).click();
  await expect.poll(() => lastSnapshot(page)).toMatchObject({ resolvedFontFamily: 'Arial' });
});

test('choosing an installed font removes the notice', async ({ page }) => {
  await installMockApi(page, { savedFont: 'Papyrus', installedFonts: ['Arial', 'Verdana'] });
  await page.goto('/');
  await expect(notice(page)).toBeVisible();

  await page.getByTitle('Select Font Family').click();
  await page.getByRole('button', { name: 'Verdana', exact: true }).click();

  await expect(notice(page)).toHaveCount(0);
  expect(await liveFontFamily(page)).toContain('Verdana');
});

test('an installed saved font shows no notice', async ({ page }) => {
  await installMockApi(page, { savedFont: 'Verdana', installedFonts: ['Arial', 'Verdana'] });
  await page.goto('/');

  await expect(page.getByTitle('Select Font Family')).toContainText('Verdana');
  await expect(notice(page)).toHaveCount(0);
});

test('Refresh Fonts re-reads the installed fonts and the missing font returns', async ({ page }) => {
  await installMockApi(page, { savedFont: 'Papyrus', installedFonts: ['Arial', 'Verdana'] });
  await page.goto('/');
  await expect(notice(page)).toBeVisible();

  // The user installs two fonts, one of them the missing one.
  await page.evaluate(() => {
    (window as unknown as { __installedFonts: string[] }).__installedFonts.push('Papyrus', 'Georgia');
  });

  await page.getByTitle('Printer & App Settings').click();
  await page.getByRole('button', { name: 'Refresh Fonts' }).click();
  await expect(page.getByText('Found 4 installed font families.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(notice(page)).toHaveCount(0);
  expect(await liveFontFamily(page)).toContain('Papyrus');

  // The picker lists the newly installed font too.
  await page.getByTitle('Select Font Family').click();
  await expect(page.getByRole('button', { name: 'Georgia', exact: true })).toBeVisible();
});

test('without the system font list only installed common fonts are offered', async ({ page }) => {
  await installMockApi(page, { savedFont: 'Arial' });
  await page.goto('/');

  await page.getByTitle('Select Font Family').click();
  const offered = await page.locator('button[style*="font-family"]').allInnerTexts();
  expect(offered.length).toBeGreaterThan(0);

  // Every offered name really is installed (not just a fixed wish list).
  const allInstalled = await page.evaluate((names) => {
    const canvas = document.createElement('canvas').getContext('2d')!;
    const width = (family: string) => {
      canvas.font = `72px ${family}`;
      return canvas.measureText('mmmmmmmmmmlli1WwQq').width;
    };
    return names.every((name) => width(`"${name}", monospace`) !== width('monospace') || width(`"${name}", serif`) !== width('serif'));
  }, offered);
  expect(allInstalled).toBe(true);
});

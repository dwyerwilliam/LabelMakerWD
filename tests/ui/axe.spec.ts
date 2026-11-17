import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { configureMock, installMockApi } from './support/mockApi';

// Automated WCAG 2.1 A and AA checks (names, roles, nesting, colour contrast) of every screen
// the app has, in the light and the dark theme. They find what can be measured; they do not
// replace a pass with a screen reader.

async function violations(page: Page) {
  // Colours animate for a moment after a hover or a theme change; check them once settled.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `  ${node.target.join(' ')}: ${node.any[0]?.message ?? node.failureSummary}`).join('\n')
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await installMockApi(page, { queues: ['4x6', '2x1'] });
      await page.goto('/');
      await page.getByRole('textbox', { name: 'Label text editor' }).fill('Hello');
      await expect(page.getByRole('button', { name: 'Print 4 × 6', exact: true })).toBeEnabled();
    });

    test('the main window has no accessibility violations', async ({ page }) => {
      expect(await violations(page)).toEqual([]);
    });

    test('the 2 × 1 profile has no accessibility violations', async ({ page }) => {
      await page.getByRole('tab', { name: '2 × 1' }).click();
      expect(await violations(page)).toEqual([]);
    });

    test('the font list has no accessibility violations', async ({ page }) => {
      await page.getByRole('button', { name: /^Font family: Arial$/ }).click();
      expect(await violations(page)).toEqual([]);
    });

    test('the Settings dialog has no accessibility violations', async ({ page }) => {
      await page.getByRole('button', { name: 'Printer and app settings' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('a confirmation dialog has no accessibility violations', async ({ page }) => {
      await configureMock(page, (mock) => {
        mock.prepareReasons = ['overflow_clipped'];
      });
      await page.getByRole('button', { name: 'Print 4 × 6', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

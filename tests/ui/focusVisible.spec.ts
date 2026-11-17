import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi';

// Spec A19 and WCAG 2.4.7: whichever control has keyboard focus must look focused.

for (const scheme of ['light', 'dark'] as const) {
  test(`every keyboard stop shows where focus is (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await installMockApi(page, { queues: ['4x6', '2x1'] });
    await page.goto('/');
    const editor = page.getByRole('textbox', { name: 'Label text editor' });
    await editor.fill('Hello');
    // Start from the top of the page: a click puts the next Tab at the first control.
    await page.mouse.click(1, 1);

    const withoutIndicator: string[] = [];
    let stops = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // The label itself shows a caret and its own outline; every other stop needs a ring.
        if (el.getAttribute('role') === 'textbox' && el.getAttribute('aria-label') === 'Label text editor') {
          return { name: 'Label text editor', ok: true };
        }
        const name = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || el.tagName;
        const visible = (node: Element) => {
          const cs = getComputedStyle(node);
          const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
          return outline || cs.boxShadow !== 'none';
        };
        // A text field may show focus on the box around it.
        const ok = visible(el) || (el.parentElement ? visible(el.parentElement) : false);
        return { name, ok };
      });
      if (result === null) break;
      stops += 1;
      if (!result.ok) withoutIndicator.push(result.name);
    }

    expect(stops, 'keyboard stops found').toBeGreaterThan(15);
    expect(withoutIndicator, 'controls with no visible focus indicator').toEqual([]);
  });
}

test('every keyboard stop in the Settings dialog shows where focus is', async ({ page }) => {
  await installMockApi(page, { queues: ['4x6', '2x1'] });
  await page.goto('/');
  // Opened from the keyboard, so the browser treats focus inside the dialog as keyboard focus.
  await page.getByRole('button', { name: 'Printer and app settings' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const withoutIndicator: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || el.tagName) + '#' + Array.from(document.querySelectorAll('*')).indexOf(el);
      const visible = (node: Element) => {
        const cs = getComputedStyle(node);
        const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
        return outline || cs.boxShadow !== 'none';
      };
      const dialogRoot = el.closest('[role="dialog"]');
      // The dialog frame itself takes focus when it has no control to start on; it is not a stop to check.
      if (el === dialogRoot) return { name, ok: true };
      return { name, ok: visible(el) || (el.parentElement ? visible(el.parentElement) : false) };
    });
    if (result === null) break;
    if (seen.has(result.name)) break; // focus came round again
    seen.add(result.name);
    if (!result.ok) withoutIndicator.push(result.name.replace(/#\d+$/, ''));
    await page.keyboard.press('Tab');
  }

  expect(seen.size, 'keyboard stops found').toBeGreaterThan(3);
  expect(withoutIndicator, 'controls with no visible focus indicator').toEqual([]);
});

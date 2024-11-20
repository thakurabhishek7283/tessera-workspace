import { expect, test } from '@playwright/test';

test('types text, opens the slash menu and inserts a heading', async ({ page }) => {
  await page.goto('/?tab=editor&storage=memory');
  const area = page.locator('tessera-editor .tiptap');
  await area.waitFor();
  await area.click();
  await expect(area).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('/');

  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  await menu.getByRole('option', { name: 'Heading 2' }).click();
  await page.keyboard.type('Weekly notes');

  await expect(area.locator('h2')).toHaveText('Weekly notes');
  await expect(page.locator('#md')).toHaveValue(/## Weekly notes/);
});

test('sanitizes pasted HTML', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?tab=editor&storage=memory');
  const area = page.locator('tessera-editor .tiptap');
  await area.waitFor();
  await area.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p>safe <b>bold</b><img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script></p>',
    );
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    document
      .querySelector('playground-app')
      ?.shadowRoot?.querySelector('tessera-editor')
      ?.shadowRoot?.querySelector('.tiptap')
      ?.dispatchEvent(event);
  });
  await expect(area).toContainText('safe bold');
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  await expect(area.locator('script, [onerror]')).toHaveCount(0);
});

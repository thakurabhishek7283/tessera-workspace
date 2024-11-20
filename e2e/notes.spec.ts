import { expect, test } from '@playwright/test';

test('adds a note, edits it and finds it again after a reload', async ({ page }) => {
  await page.goto('/?tab=notes&storage=indexeddb');
  await page
    .getByRole('button', { name: /add note|new note/i })
    .first()
    .click();
  const note = page.locator('tessera-notes tessera-note').first();
  await expect(note).toBeVisible();
  await note.locator('.tiptap').click();
  await page.keyboard.type('Remember the milk');
  // The note saves after a short pause.
  await expect(note).toContainText('Remember the milk');
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.locator('tessera-notes tessera-note').first()).toContainText(
    'Remember the milk',
  );
});

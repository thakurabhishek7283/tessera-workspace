import { expect, type Locator, type Page, test } from '@playwright/test';

const url = '/?tab=kanban&storage=indexeddb';

/** Every test starts from an empty IndexedDB: each Playwright context is a fresh profile. */
async function createBoard(page: Page, title: string): Promise<void> {
  await page.goto(url);
  await page.getByPlaceholder('New board name').fill(title);
  await page.getByRole('button', { name: 'Create board' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

async function addColumn(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder('New column').fill(title);
  await page.getByRole('button', { name: 'Add column', exact: true }).click();
  await expect(page.getByRole('list', { name: title })).toBeVisible();
}

async function addCard(page: Page, column: string, title: string): Promise<void> {
  const section = page.getByRole('group', { name: column });
  const composer = page.getByLabel(`New card in ${column}`);
  // The composer stays open after a card is added, ready for the next one.
  if (!(await composer.isVisible()))
    await section.getByRole('button', { name: 'Add a card' }).click();
  await composer.fill(title);
  await page.keyboard.press('Enter');
  await expect(composer).toHaveValue('');
  await expect.poll(() => titlesIn(page, column)).toContain(title);
}

async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('nothing to drag');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 12 });
  await page.mouse.up();
}

const titlesIn = (page: Page, column: string): Promise<string[]> =>
  page
    .getByRole('list', { name: column })
    .getByRole('listitem')
    .evaluateAll((cards) =>
      cards.map((c) => c.shadowRoot?.querySelector('.title')?.textContent?.trim() ?? ''),
    );

test('builds a board, drags a card between columns and keeps it after a reload', async ({
  page,
}) => {
  await createBoard(page, 'Sprint');
  await addColumn(page, 'Review');
  await addCard(page, 'To do', 'Write the docs');
  await addCard(page, 'To do', 'Ship it');

  await drag(
    page,
    page.getByRole('listitem').filter({ hasText: 'Ship it' }),
    page.getByRole('list', { name: 'Done' }),
  );
  await expect.poll(() => titlesIn(page, 'Done')).toEqual(['Ship it']);
  await expect.poll(() => titlesIn(page, 'To do')).toEqual(['Write the docs']);

  await page.reload();
  await page.getByRole('button', { name: 'Sprint' }).click();
  await expect.poll(() => titlesIn(page, 'Done')).toEqual(['Ship it']);
  await expect.poll(() => titlesIn(page, 'To do')).toEqual(['Write the docs']);
});

test('moves a card with the keyboard only and undoes it', async ({ page }) => {
  await createBoard(page, 'Keyboard');
  await addCard(page, 'To do', 'Only card');

  await page.getByRole('listitem').filter({ hasText: 'Only card' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(() => titlesIn(page, 'In progress')).toEqual(['Only card']);

  await page.keyboard.press('Control+z');
  await expect.poll(() => titlesIn(page, 'To do')).toEqual(['Only card']);
  await expect.poll(() => titlesIn(page, 'In progress')).toEqual([]);
});

test('shows a change made in a second tab without reloading', async ({ context, page }) => {
  await createBoard(page, 'Shared');

  const other = await context.newPage();
  await other.goto(url);
  await other.getByRole('button', { name: 'Shared' }).click();
  await expect(other.getByRole('list', { name: 'To do' })).toBeVisible();

  await addCard(page, 'To do', 'From the first tab');
  await expect(other.getByText('From the first tab')).toBeVisible();

  await addCard(other, 'To do', 'From the second tab');
  await expect(page.getByText('From the second tab')).toBeVisible();
});

test('refuses a move into a full column and says why', async ({ page }) => {
  await createBoard(page, 'Limits');
  await addCard(page, 'To do', 'Too much');
  await addCard(page, 'In progress', 'First');

  const column = page.getByRole('group', { name: 'In progress' });
  await column.getByRole('button', { name: 'Settings for In progress' }).click();
  await column.getByLabel('Card limit').fill('1');
  await page.keyboard.press('Enter');
  await expect(column.getByLabel('Card limit')).toBeHidden();
  await expect(column.getByText('1 / 1')).toBeVisible();

  await drag(
    page,
    page.getByRole('listitem').filter({ hasText: 'Too much' }),
    page.getByRole('list', { name: 'In progress' }),
  );
  await expect(page.getByText('"In progress" is full (1 cards).')).toBeVisible();
  await expect.poll(() => titlesIn(page, 'In progress')).toEqual(['First']);
  await expect.poll(() => titlesIn(page, 'To do')).toEqual(['Too much']);
});

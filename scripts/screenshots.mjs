// Captures the README screenshots from the built playground. Usage: `pnpm screenshots`.
// Starts `vite preview` itself, so the playground must already be built (`pnpm build`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4173/';
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const out = (name) => new URL(`../docs/media/${name}.png`, import.meta.url).pathname;
mkdirSync(new URL('../docs/media/', import.meta.url), { recursive: true });

const server = spawn('pnpm', ['--filter', 'playground', 'preview'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: scheme,
    });
    const page = await context.newPage();
    await page.goto(`${base}?tab=kanban&storage=memory`);
    await page.getByRole('button', { name: 'Add demo data' }).click();
    await page.locator('tessera-kanban tessera-kanban-column').first().waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: out(`kanban-${scheme}`) });

    // The card dialog, with its rich text description.
    await page.getByText('Keyboard support for the board').click();
    await page.locator('tessera-kanban-card-dialog tessera-editor .tiptap').waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: out(`card-dialog-${scheme}`) });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Notes' }).click();
    await page.locator('tessera-notes tessera-note').first().waitFor();
    await page.getByRole('button', { name: 'Free layout' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: out(`notes-${scheme}`) });

    await page.getByRole('button', { name: 'Editor' }).first().click();
    await page.locator('tessera-editor .tiptap').waitFor();
    await page.locator('tessera-editor .tiptap').click();
    // ProseMirror reads the browser selection asynchronously; a person is never faster than this.
    await page.waitForTimeout(250);
    // Replace the sample text with a short note and open the block menu on a new line.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Weekly notes');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.locator('tessera-editor [role=listbox]').waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: out(`editor-${scheme}`) });
    await context.close();
  }
  await browser.close();
} finally {
  stop();
}

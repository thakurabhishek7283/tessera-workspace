import { createTestInstance, type TestInstance } from '@tessera/testing';
import type { Note, NotesApi, NotesController } from '../src/index.js';

export interface Env extends TestInstance {
  api: NotesApi;
}

export async function makeEnv(notes: Record<string, unknown> = {}): Promise<Env> {
  const test = await createTestInstance(
    { appId: 'notes-test', features: { notes: { enabled: true, ...notes } } },
    { notes: () => import('../src/plugin.js') },
  );
  const api = test.instance.feature('notes');
  if (!api) throw new Error('notes did not start');
  return { ...test, api };
}

export const doc = (text: string): Note['content'] => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export const texts = (c: NotesController): string[] =>
  c.state.get().visible.map((n) => n.content.content?.[0]?.content?.[0]?.text ?? '');

export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

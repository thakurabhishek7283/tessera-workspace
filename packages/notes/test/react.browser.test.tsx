import { TesseraProvider } from '@tessera-kit/react';
import { createTestInstance } from '@tessera-kit/testing';
import '@tessera-kit/elements/define';
import { cleanup, until } from '@tessera-internal/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { TesseraNotesElement } from '../src/elements/notes.js';
import { Notes, useNotesBoard } from '../src/react/index.js';
import { plugins } from './ui-helpers.js';

afterEach(cleanup);

function Count() {
  const { controller, state } = useNotesBoard('react');
  return (
    <div>
      <output>{state ? `${state.visible.length} notes` : 'loading'}</output>
      <button type="button" onClick={() => void controller?.create()}>
        add
      </button>
    </div>
  );
}

async function instance() {
  const { instance } = await createTestInstance(
    { appId: 'notes-react', features: { notes: { enabled: true }, editor: { enabled: true } } },
    plugins,
  );
  return instance;
}

describe('React notes bindings', () => {
  it('useNotesBoard follows a board and exposes its controller', async () => {
    const tessera = await instance();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={tessera}>
        <Count />
      </TesseraProvider>,
    );
    await until(() => container.querySelector('output')?.textContent === '0 notes');
    await userEvent.click(await until(() => container.querySelector('button')));
    await until(() => container.querySelector('output')?.textContent === '1 notes');
  });

  it('<Notes> shows a board and forwards its events', async () => {
    const tessera = await instance();
    const api = tessera.feature('notes');
    const controller = await api?.open('shared');
    const onCreate = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={tessera}>
        <Notes board="shared" onNoteCreate={onCreate} />
      </TesseraProvider>,
    );
    const el = await until(() => container.querySelector<TesseraNotesElement>('tessera-notes'));
    await until(() => el.controller);
    await controller?.create();
    await until(() => onCreate.mock.calls.length);
    expect(onCreate.mock.calls[0]?.[0].detail.note.boardId).toBe('shared');
    await until(() => el.shadowRoot?.querySelector('tessera-note'));
  });
});

import { TesseraProvider } from '@tessera/react';
import { createTestInstance } from '@tessera/testing';
import '@tessera/elements/define';
import { cleanup, until } from '@tessera-internal/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { TesseraKanbanElement } from '../src/elements/board.js';
import { Kanban, useKanbanBoard } from '../src/react/index.js';
import { plugins } from './ui-helpers.js';

afterEach(cleanup);

function Cards({ boardId }: { boardId: string }) {
  const { controller, state } = useKanbanBoard(boardId);
  return (
    <div>
      <output>
        {state
          ? state.columns
              .map((c) => `${c.title}:${state.cardsByColumn.get(c.id)?.length ?? 0}`)
              .join(' ')
          : 'loading'}
      </output>
      <button
        type="button"
        onClick={() =>
          controller &&
          void controller.addCard(controller.state.get().columns[0]?.id as string, {
            title: 'From hook',
          })
        }
      >
        add
      </button>
    </div>
  );
}

describe('React kanban bindings', () => {
  it('useKanbanBoard follows a board and exposes its controller', async () => {
    const { instance } = await createTestInstance(
      { appId: 'kanban-hook', features: { kanban: { enabled: true } } },
      plugins,
    );
    const api = instance.feature('kanban');
    const board = await api?.createBoard({ title: 'T', columns: ['One', 'Two'] });
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Cards boardId={board?.id as string} />
      </TesseraProvider>,
    );
    const out = await until(
      () =>
        container.querySelector('output')?.textContent?.includes('One:0') &&
        container.querySelector('output'),
    );
    expect(out.textContent).toBe('One:0 Two:0');
    await userEvent.click(await until(() => container.querySelector('button')));
    await until(() => container.querySelector('output')?.textContent === 'One:1 Two:0');
  });

  it('<Kanban> shows a board and forwards its events', async () => {
    const { instance } = await createTestInstance(
      { appId: 'kanban-comp', features: { kanban: { enabled: true }, editor: { enabled: true } } },
      plugins,
    );
    const api = instance.feature('kanban');
    const board = await api?.createBoard({ title: 'T', columns: ['One'] });
    const controller = await api?.open(board?.id as string);
    const onCreate = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Kanban board={board?.id} onCardCreate={onCreate} members={[{ id: 'u1', name: 'Ada' }]} />
      </TesseraProvider>,
    );
    const el = await until(() => container.querySelector<TesseraKanbanElement>('tessera-kanban'));
    await until(() => el.shadowRoot?.querySelector('tessera-kanban-column'));
    expect(api?.runtime.get().members).toEqual([{ id: 'u1', name: 'Ada' }]);
    await controller?.addCard(controller.state.get().columns[0]?.id as string, { title: 'x' });
    await until(() => onCreate.mock.calls.length);
    expect(onCreate.mock.calls[0]?.[0].detail.card.title).toBe('x');
  });
});

import { cleanup, deepQuery, expectAccessible } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { toastRegionText } from './toast.js';
import {
  card,
  cardTitles,
  centerOf,
  column,
  columns,
  dragTo,
  frames,
  list,
  mount,
  must,
  settleBoard,
  until,
} from './ui-helpers.js';

afterEach(cleanup);

const _labelled = (root: ParentNode | null | undefined, label: string): HTMLElement =>
  must(
    [...(root?.querySelectorAll<HTMLElement>('[aria-label]') ?? [])].find(
      (e) => e.getAttribute('aria-label') === label,
    ),
    label,
  );

describe('<tessera-kanban>', () => {
  it('renders columns and cards with accessible names, counts and is accessible', async () => {
    const { el } = await mount({ cards: { A: ['Write docs', 'Fix bug'], B: ['Ship it'] } });
    expect(columns(el).map((c) => c.column?.title)).toEqual(['A', 'B', 'C']);
    expect(cardTitles(el, 'A')).toEqual(['Write docs', 'Fix bug']);
    expect(card(el, 'Ship it').getAttribute('aria-label')).toBe('Ship it');
    expect(card(el, 'Ship it').getAttribute('role')).toBe('listitem');
    expect(list(el, 'A').getAttribute('role')).toBe('list');
    expect(column(el, 'A').renderRoot.querySelector('.count')?.textContent).toBe('2');
    await expectAccessible(el);
  });

  it('adds cards from the composer, keeps it open for the next one and closes with Escape', async () => {
    const { el, data, ids } = await mount();
    const col = column(el, 'A');
    await userEvent.click(must(col.renderRoot.querySelector<HTMLElement>('button.add')));
    const box = await until(() => col.renderRoot.querySelector<HTMLTextAreaElement>('textarea'));
    await userEvent.click(box);
    await userEvent.keyboard('First{Enter}Second{Enter}');
    await until(() => cardTitles(el, 'A').length === 2);
    expect(cardTitles(el, 'A')).toEqual(['First', 'Second']);
    expect(data.state.get().cardsByColumn.get(ids.A as string)).toHaveLength(2);
    expect(col.renderRoot.querySelector('textarea')?.value).toBe('');
    await userEvent.keyboard('{Escape}');
    await until(() => !col.renderRoot.querySelector('textarea'));
    await userEvent.click(must(col.renderRoot.querySelector<HTMLElement>('button.add')));
    await userEvent.keyboard('{Enter}');
    expect(cardTitles(el, 'A')).toEqual(['First', 'Second']);
  });

  it('shows the board for a second tab: changes made elsewhere appear live', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['one'] } });
    await data.addCard(ids.B as string, { title: 'from elsewhere' });
    await until(() => cardTitles(el, 'B').includes('from elsewhere'));
    await data.moveCard(ids.one as string, ids.C as string, 0);
    await until(() => cardTitles(el, 'C').includes('one'));
  });

  it('opens the card dialog from a click or Enter, and edits are saved and undoable', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['Plan'] } });
    const onOpen = vi.fn();
    el.addEventListener('card-open', (e) => onOpen((e as CustomEvent).detail.card.title));
    await userEvent.click(card(el, 'Plan'));
    const dialog = await until(() => el.dialog?.open && el.dialog);
    expect(onOpen).toHaveBeenCalledWith('Plan');
    await settleBoard(el);
    const title = must(dialog.renderRoot.querySelector<HTMLInputElement>('input.title'));
    expect(title.value).toBe('Plan');
    await userEvent.fill(title, 'Plan v2');
    await userEvent.keyboard('{Enter}');
    await until(() => data.getCard(ids.Plan as string)?.title === 'Plan v2');

    const due = must(dialog.renderRoot.querySelector<HTMLInputElement>('input[type=date]'));
    await userEvent.fill(due, '2026-05-01');
    await until(() => data.getCard(ids.Plan as string)?.dueDate === '2026-05-01');
    await userEvent.click(
      must(dialog.renderRoot.querySelector<HTMLElement>('tessera-button[variant=primary]')),
    );
    await until(() => !el.dialog?.open);
    await userEvent.keyboard('{Control>}z{/Control}');
    await until(() => data.getCard(ids.Plan as string)?.dueDate === undefined);
  });

  it('labels, assigns, checklist and cover work in the dialog', async () => {
    const { el, data, ids } = await mount({
      cards: { A: ['Plan'] },
      members: [{ id: 'u1', name: 'Ada Lovelace' }],
      kanban: {
        cardFields: [
          'description',
          'labels',
          'assignees',
          'dueDate',
          'checklist',
          'coverColor',
          'estimate',
        ],
      },
    });
    await userEvent.click(card(el, 'Plan'));
    const dialog = await until(() => el.dialog?.open && el.dialog);
    await settleBoard(el);
    const root = dialog.renderRoot;

    // Create a label and tag the card with it.
    await userEvent.click(must(root.querySelector<HTMLElement>('summary')));
    await userEvent.fill(
      must(root.querySelector<HTMLInputElement>('input[placeholder="Label name"]')),
      'Urgent',
    );
    await userEvent.click(
      must(
        [...root.querySelectorAll<HTMLElement>('tessera-button')].find((b) =>
          b.textContent?.includes('Add label'),
        ),
      ),
    );
    await until(() => data.state.get().board?.labels.length === 1);
    await until(() => root.querySelector('button.chip[aria-pressed]'));
    await userEvent.click(must(root.querySelector<HTMLElement>('button.chip[aria-pressed]')));
    await until(() => data.getCard(ids.Plan as string)?.labelIds.length === 1);

    await userEvent.click(must(root.querySelector<HTMLElement>('button.member')));
    await until(() => data.getCard(ids.Plan as string)?.assigneeIds.includes('u1'));

    const item = must(root.querySelector<HTMLInputElement>('input[placeholder="Add an item"]'));
    await userEvent.fill(item, 'Write tests');
    await userEvent.keyboard('{Enter}');
    await until(() => data.getCard(ids.Plan as string)?.checklist.length === 1);
    await userEvent.click(
      must(root.querySelector<HTMLElement>('ul.checklist input[type=checkbox]')),
    );
    await until(() => data.getCard(ids.Plan as string)?.checklist[0]?.done === true);

    await userEvent.click(must(root.querySelector<HTMLElement>('.swatch[data-color=red]')));
    await until(() => data.getCard(ids.Plan as string)?.coverColor === 'red');

    // The card on the board reflects all of it.
    await userEvent.click(must(root.querySelector<HTMLElement>('tessera-button[variant=primary]')));
    await settleBoard(el);
    const preview = card(el, 'Plan').renderRoot;
    expect(preview.querySelector('.chip')?.textContent).toBe('Urgent');
    expect(preview.querySelector('.cover')).not.toBeNull();
    expect(preview.textContent).toContain('1/1');
    expect(preview.querySelector('tessera-avatar-stack')).not.toBeNull();
  });

  it('marks overdue cards', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['Late', 'Soon'] } });
    await data.updateCard(ids.Late as string, { dueDate: '2000-01-01' });
    await data.updateCard(ids.Soon as string, { dueDate: '2999-01-01' });
    await until(() => card(el, 'Late').renderRoot.querySelector('.due'));
    expect(card(el, 'Late').renderRoot.querySelector('.due')?.classList.contains('overdue')).toBe(
      true,
    );
    expect(card(el, 'Soon').renderRoot.querySelector('.due')?.classList.contains('overdue')).toBe(
      false,
    );
    expect(card(el, 'Late').renderRoot.textContent).toContain('Overdue');
  });

  it('filters cards by text and shows a message for empty results', async () => {
    const { el } = await mount({ cards: { A: ['Apple pie', 'Banana'], B: ['Cherry'] } });
    const filters = must(el.shadowRoot?.querySelector('tessera-kanban-filters'));
    const search = must(filters.shadowRoot?.querySelector<HTMLInputElement>('input[type=search]'));
    await userEvent.fill(search, 'apple');
    await until(() => cardTitles(el, 'A').length === 1);
    expect(cardTitles(el, 'B')).toEqual([]);
    expect(column(el, 'B').renderRoot.textContent).toContain('No matching cards');
    expect(column(el, 'A').renderRoot.querySelector('.count')?.textContent).toBe('2');
    await userEvent.keyboard('{Escape}');
    await until(() => cardTitles(el, 'A').length === 2);
  });

  it('moves a card between columns by dragging with the pointer', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['1', '2'], B: ['x'] } });
    const target = centerOf(card(el, 'x'));
    await dragTo(card(el, '2'), { x: target.x, y: target.y - 20 });
    await until(() => cardTitles(el, 'B').length === 2);
    expect(cardTitles(el, 'B')).toEqual(['2', 'x']);
    expect(cardTitles(el, 'A')).toEqual(['1']);
    expect(data.getCard(ids['2'] as string)?.columnId).toBe(ids.B);
    expect(el.shadowRoot?.querySelector('[role=status]')?.textContent).toContain('Dropped 2');
  });

  it('lets a listener veto a drag with the cancelable card-move event', async () => {
    const { el } = await mount({ cards: { A: ['1'], B: ['x'] } });
    const seen = vi.fn();
    el.addEventListener('card-move', (e) => {
      seen((e as CustomEvent).detail);
      e.preventDefault();
    });
    const target = centerOf(card(el, 'x'));
    await dragTo(card(el, '1'), { x: target.x, y: target.y });
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ toIndex: expect.any(Number) });
    expect(cardTitles(el, 'A')).toEqual(['1']);
    expect(cardTitles(el, 'B')).toEqual(['x']);
  });

  it('refuses a move into a full column and tells the user', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['1'], B: ['x'] } });
    await data.setWipLimit(ids.B as string, 1);
    await until(() => column(el, 'B').column?.wipLimit === 1);
    const target = centerOf(card(el, 'x'));
    await dragTo(card(el, '1'), { x: target.x, y: target.y + 10 });
    await until(() => toastRegionText().includes('is full'));
    expect(cardTitles(el, 'B')).toEqual(['x']);
    expect(column(el, 'B').renderRoot.querySelector('.count')?.classList.contains('full')).toBe(
      true,
    );
    expect(column(el, 'B').renderRoot.querySelector('.count')?.textContent).toBe('1 / 1');
  });

  it('moves a card with the keyboard and announces each step', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['1', '2'], B: ['x'] } });
    card(el, '1').focus();
    await userEvent.keyboard(' ');
    const live = must(el.shadowRoot?.querySelector('[role=status]'));
    await until(() => live.textContent?.includes('Picked up 1'));
    await userEvent.keyboard('{ArrowRight}');
    await until(() => live.textContent?.includes('in B'));
    await userEvent.keyboard(' ');
    await until(() => data.getCard(ids['1'] as string)?.columnId === ids.B);
    await until(() => cardTitles(el, 'B').includes('1'));
    expect(live.textContent).toContain('Dropped 1');
    await frames(3);
    expect((column(el, 'B').renderRoot as ShadowRoot).activeElement).toBe(card(el, '1'));
  });

  it('keeps Enter for opening a card instead of lifting it', async () => {
    const { el } = await mount({ cards: { A: ['1'] } });
    card(el, '1').focus();
    await userEvent.keyboard('{Enter}');
    await until(() => el.dialog?.open);
  });

  it('reorders columns with the grip and the keyboard', async () => {
    const { el, data } = await mount();
    const grip = must(column(el, 'C').renderRoot.querySelector<HTMLElement>('.grip'));
    grip.focus();
    await userEvent.keyboard(' {ArrowLeft}{ArrowLeft} ');
    await until(() => data.state.get().columns[0]?.title === 'C');
    await until(() => columns(el)[0]?.column?.title === 'C');
  });

  it('adds a column and renames one inline', async () => {
    const { el, data } = await mount();
    const input = must(el.shadowRoot?.querySelector<HTMLInputElement>('.add-column input'));
    await userEvent.fill(input, 'Review');
    await userEvent.keyboard('{Enter}');
    await until(() => data.state.get().columns.length === 4);
    const heading = must(column(el, 'A').renderRoot.querySelector<HTMLElement>('h2 button'));
    await userEvent.click(heading);
    const edit = await until(() =>
      column(el, 'A').renderRoot.querySelector<HTMLInputElement>('h2 input'),
    );
    await userEvent.fill(edit, 'Backlog');
    await userEvent.keyboard('{Enter}');
    await until(() => data.state.get().columns.some((c) => c.title === 'Backlog'));
  });

  it('edits column settings: limit, colour and delete with moving the cards', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['1', '2'] } });
    const col = column(el, 'A');
    await userEvent.click(
      must(col.renderRoot.querySelector<HTMLElement>('tessera-icon-button[icon=more-horizontal]')),
    );
    const dialog = await until(() => col.renderRoot.querySelector('tessera-dialog'));
    const limit = await until(() => dialog.querySelector<HTMLInputElement>('input[name=limit]'));
    await userEvent.fill(limit, '5');
    await userEvent.click(must(dialog.querySelector<HTMLElement>('.swatch[data-color=red]')));
    await until(() => data.state.get().columns[0]?.color === 'red');
    await userEvent.click(
      must(
        [...dialog.querySelectorAll<HTMLElement>('tessera-button')].find((b) =>
          b.textContent?.includes('Save'),
        ),
      ),
    );
    await until(() => data.state.get().columns[0]?.wipLimit === 5);

    await userEvent.click(
      must(col.renderRoot.querySelector<HTMLElement>('tessera-icon-button[icon=more-horizontal]')),
    );
    await settleBoard(el);
    const select = await until(() => dialog.querySelector<HTMLSelectElement>('select[name=move]'));
    select.value = ids.B as string;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await userEvent.click(
      must(
        [...dialog.querySelectorAll<HTMLElement>('tessera-button')].find((b) =>
          b.textContent?.includes('Delete column'),
        ),
      ),
    );
    await until(() => data.state.get().columns.length === 2);
    expect(
      data.state
        .get()
        .cardsByColumn.get(ids.B as string)
        ?.map((c) => c.title),
    ).toEqual(['1', '2']);
  });

  it('deletes with Delete after a confirmation, and offers undo', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['Gone'] } });
    card(el, 'Gone').focus();
    await userEvent.keyboard('{Delete}');
    const dialog = await until(() => {
      const d = [...(el.shadowRoot?.querySelectorAll('tessera-dialog') ?? [])].find((x) => x.open);
      return d;
    });
    await userEvent.click(
      must(
        [...dialog.querySelectorAll<HTMLElement>('tessera-button')].find((b) =>
          b.textContent?.includes('Delete card'),
        ),
      ),
    );
    await until(() => data.getCard(ids.Gone as string) === undefined);
    await until(() => toastRegionText().includes('Deleted "Gone"'));
    const region = must(deepQuery(document.body, 'tessera-toast-region'));
    const undoButton = must(
      [...(region.shadowRoot?.querySelectorAll<HTMLElement>('tessera-button') ?? [])].find((b) =>
        b.textContent?.includes('Undo'),
      ),
    );
    await userEvent.click(undoButton);
    await until(() => cardTitles(el, 'A').includes('Gone'));
  });

  it('has undo and redo buttons wired to the history', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['1'] } });
    const undo = must(el.shadowRoot?.querySelector<HTMLElement>('tessera-icon-button[icon=undo]'));
    const redo = must(el.shadowRoot?.querySelector<HTMLElement>('tessera-icon-button[icon=redo]'));
    expect(redo.hasAttribute('disabled')).toBe(true);
    await data.moveCard(ids['1'] as string, ids.B as string, 0);
    await until(() => cardTitles(el, 'B').length === 1);
    await frames(2);
    // The element has its own history; moves made through another controller are not in it.
    expect(undo.hasAttribute('disabled')).toBe(true);
    await userEvent.click(card(el, '1'));
    await until(() => el.dialog?.open);
  });

  it('hides editing controls when read only and does not drag', async () => {
    const { el } = await mount({ cards: { A: ['1'], B: [] }, readonly: true });
    expect(column(el, 'A').renderRoot.querySelector('button.add')).toBeNull();
    expect(column(el, 'A').renderRoot.querySelector('.grip')).toBeNull();
    expect(el.shadowRoot?.querySelector('.add-column')).toBeNull();
    const target = centerOf(list(el, 'B'));
    await dragTo(card(el, '1'), target);
    expect(cardTitles(el, 'A')).toEqual(['1']);
    await userEvent.click(card(el, '1'));
    const dialog = await until(() => el.dialog?.open && el.dialog);
    await settleBoard(el);
    expect(dialog.renderRoot.querySelector<HTMLInputElement>('input.title')?.disabled).toBe(true);
  });

  it('follows the capability switches in the config', async () => {
    const { el } = await mount({
      cards: { A: ['1'] },
      kanban: {
        allow: {
          createCard: false,
          createColumn: false,
          reorderColumns: false,
          deleteColumn: false,
          renameColumn: false,
        },
      },
    });
    expect(column(el, 'A').renderRoot.querySelector('button.add')).toBeNull();
    expect(column(el, 'A').renderRoot.querySelector('.grip')).toBeNull();
    expect(el.shadowRoot?.querySelector('.add-column')).toBeNull();
    expect(column(el, 'A').renderRoot.querySelector('h2 button')).toBeNull();
    expect(
      column(el, 'A').renderRoot.querySelector('tessera-icon-button[icon=more-horizontal]'),
    ).toBeNull();
  });

  it('shows only the configured card fields and custom fields', async () => {
    const { el } = await mount({
      cards: { A: ['1'] },
      kanban: {
        cardFields: ['dueDate'],
        customFields: [
          { key: 'points', label: 'Points', type: 'number', showOnCard: true },
          { key: 'kind', label: 'Kind', type: 'select', options: ['bug', 'feature'] },
        ],
      },
    });
    await userEvent.click(card(el, '1'));
    const dialog = await until(() => el.dialog?.open && el.dialog);
    await settleBoard(el);
    const root = dialog.renderRoot;
    expect(root.querySelector('tessera-editor')).toBeNull();
    expect(root.querySelector('ul.checklist')).toBeNull();
    const points = must(root.querySelector<HTMLInputElement>('input[type=number]'));
    await userEvent.fill(points, '8');
    await userEvent.keyboard('{Tab}');
    await until(() => card(el, '1').card?.custom?.points === 8);
    await userEvent.click(must(root.querySelector<HTMLElement>('tessera-button[variant=primary]')));
    await settleBoard(el);
    expect(card(el, '1').renderRoot.querySelector('.custom')?.textContent).toBe('8');
  });

  it('uses the rich text editor for descriptions when the editor feature is on', async () => {
    const { el, data, ids } = await mount({ cards: { A: ['1'] } });
    await userEvent.click(card(el, '1'));
    const dialog = await until(() => el.dialog?.open && el.dialog);
    await settleBoard(el);
    const editor = must(
      dialog.renderRoot.querySelector<HTMLElement & { editorReady: Promise<unknown> }>(
        'tessera-editor',
      ),
    );
    await editor.editorReady;
    await userEvent.click(must(editor.shadowRoot?.querySelector<HTMLElement>('.tiptap')));
    await userEvent.keyboard('Some **details**');
    await until(() => data.getCard(ids['1'] as string)?.description !== undefined);
    await until(() =>
      JSON.stringify(data.getCard(ids['1'] as string)?.description).includes('details'),
    );
    // Typing did not reset the editor underneath the cursor.
    expect(editor.shadowRoot?.querySelector('.tiptap')?.textContent).toContain('Some');
  });
});

describe('keyboard shortcuts', () => {
  it('n opens the composer in the focused column, / focuses the search box', async () => {
    const { el } = await mount({ cards: { B: ['x'] } });
    card(el, 'x').focus();
    await userEvent.keyboard('n');
    const box = await until(() =>
      column(el, 'B').renderRoot.querySelector<HTMLTextAreaElement>('textarea'),
    );
    expect((column(el, 'B').renderRoot as ShadowRoot).activeElement).toBe(box);
    await userEvent.keyboard('{Escape}');
    card(el, 'x').focus();
    await userEvent.keyboard('/');
    const filters = must(el.shadowRoot?.querySelector('tessera-kanban-filters'));
    await until(() => filters.shadowRoot?.activeElement?.matches('input[type=search]'));
  });

  it('does not steal keys while typing in a field', async () => {
    const { el } = await mount();
    const filters = must(el.shadowRoot?.querySelector('tessera-kanban-filters'));
    const search = must(filters.shadowRoot?.querySelector<HTMLInputElement>('input[type=search]'));
    await userEvent.click(search);
    await userEvent.keyboard('n/');
    expect(search.value).toBe('n/');
    expect(column(el, 'A').renderRoot.querySelector('textarea')).toBeNull();
  });

  it('undoes and redoes the changes made from this board with Ctrl+Z and Ctrl+Shift+Z', async () => {
    const { el } = await mount();
    const col = column(el, 'A');
    await userEvent.click(must(col.renderRoot.querySelector<HTMLElement>('button.add')));
    await userEvent.click(
      await until(() => col.renderRoot.querySelector<HTMLTextAreaElement>('textarea')),
    );
    await userEvent.keyboard('Undo me{Enter}{Escape}');
    await until(() => cardTitles(el, 'A').length === 1);
    const root = must(el.shadowRoot?.querySelector<HTMLElement>('.root'));
    root.focus();
    card(el, 'Undo me').focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    await until(() => cardTitles(el, 'A').length === 0);
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await until(() => cardTitles(el, 'A').length === 1);
    const undo = must(el.shadowRoot?.querySelector<HTMLElement>('tessera-icon-button[icon=undo]'));
    await until(() => !undo.hasAttribute('disabled'));
    await userEvent.click(undo);
    await until(() => cardTitles(el, 'A').length === 0);
  });
});

describe('board picker', () => {
  it('lists boards, opens one and goes back, and creates a new board', async () => {
    const { el, api } = await mount({ picker: true });
    await until(() => el.shadowRoot?.querySelector('.picker li button'));
    expect(el.shadowRoot?.querySelector('.picker li button')?.textContent).toBe('Roadmap');
    await userEvent.click(must(el.shadowRoot?.querySelector<HTMLElement>('.picker li button')));
    await until(() => columns(el).length === 3);
    await userEvent.click(
      must(
        [...(el.shadowRoot?.querySelectorAll<HTMLElement>('tessera-button') ?? [])].find((b) =>
          b.textContent?.includes('Boards'),
        ),
      ),
    );
    await until(() => el.shadowRoot?.querySelector('.picker'));
    const input = must(el.shadowRoot?.querySelector<HTMLInputElement>('.picker input'));
    await userEvent.fill(input, 'Second');
    await userEvent.keyboard('{Enter}');
    await until(() => columns(el).length === 3);
    expect((await api.listBoards()).map((b) => b.title)).toEqual(['Roadmap', 'Second']);
  });

  it('does not offer to create a board when createBoard is off', async () => {
    const { el } = await mount({ picker: true, kanban: { allow: { createBoard: false } } });
    await until(() => el.shadowRoot?.querySelector('.picker li button'));
    expect(el.shadowRoot?.querySelector('.picker form')).toBeNull();
  });
});

describe('layout', () => {
  it('switches to one column at a time on narrow screens, with a tab bar', async () => {
    const { el } = await mount({ style: 'display:block;width:420px' });
    await until(() => el.hasAttribute('narrow'));
    const tabs = await until(() => el.shadowRoot?.querySelectorAll<HTMLElement>('.tabs button'));
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('true');
    await userEvent.click(must(tabs[2]));
    await until(
      () =>
        el.shadowRoot?.querySelectorAll('.tabs button')[2]?.getAttribute('aria-current') === 'true',
    );
    await frames(10);
    const board = must(el.shadowRoot?.querySelector<HTMLElement>('.board'));
    expect(board.scrollLeft).toBeGreaterThan(0);
  });

  it('is accessible with a dialog open', async () => {
    const { el } = await mount({
      cards: { A: ['Check me'] },
      members: [{ id: 'u1', name: 'Ada Lovelace' }],
    });
    await userEvent.click(card(el, 'Check me'));
    const dialog = await until(() => el.dialog?.open && el.dialog);
    await settleBoard(el);
    await expectAccessible(dialog);
  });
});

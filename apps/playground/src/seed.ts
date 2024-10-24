import type { TesseraInstance } from '@tessera/core';
import type { RichDoc, RichNode } from '@tessera/editor';
import type { KanbanApi } from '@tessera/kanban';
import type { NotesApi } from '@tessera/notes';

export const MEMBERS = [
  { id: 'ada', name: 'Ada Lovelace' },
  { id: 'alan', name: 'Alan Turing' },
  { id: 'grace', name: 'Grace Hopper' },
];

const p = (text: string): RichNode[] => [{ type: 'paragraph', content: [{ type: 'text', text }] }];
const doc = (text: string): RichDoc => ({ type: 'doc', content: p(text) });

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Creates the demo kanban board "Launch plan" and returns its id. */
export async function seedKanban(api: KanbanApi): Promise<string> {
  const board = await api.createBoard({
    title: 'Launch plan',
    columns: ['Backlog', 'In progress', 'Review', 'Done'],
  });
  const controller = await api.open(board.id);
  const columns = Object.fromEntries(
    controller.state.get().columns.map((c) => [c.title, c.id]),
  ) as Record<string, string>;
  const bug = await controller.addLabel({ name: 'Bug', color: 'red' });
  const docs = await controller.addLabel({ name: 'Docs', color: 'blue' });
  const design = await controller.addLabel({ name: 'Design', color: 'purple' });
  await controller.setWipLimit(columns['In progress'] as string, 3);

  const add = (
    column: string,
    title: string,
    extra: Parameters<typeof controller.addCard>[1] extends infer T ? Partial<T> : never = {},
  ) => controller.addCard(columns[column] as string, { title, ...extra });

  await add('Backlog', 'Write the migration guide', {
    labelIds: [docs.id],
    description: doc('Cover the config changes and the new adapters.'),
    estimate: 3,
  });
  await add('Backlog', 'Pick a logo', {
    labelIds: [design.id],
    assigneeIds: ['grace'],
    dueDate: day(10),
  });
  await add('Backlog', 'Add dark mode screenshots', { labelIds: [docs.id, design.id] });
  await add('In progress', 'Fix flaky upload test', {
    labelIds: [bug.id],
    assigneeIds: ['alan'],
    dueDate: day(-2),
    checklist: [
      { id: 'c1', text: 'Reproduce locally', done: true },
      { id: 'c2', text: 'Find the race', done: true },
      { id: 'c3', text: 'Add a regression test', done: false },
    ],
  });
  await add('In progress', 'Release notes for 0.1', {
    assigneeIds: ['ada'],
    dueDate: day(3),
    coverColor: 'green',
  });
  await add('Review', 'Keyboard support for the board', {
    assigneeIds: ['ada', 'alan'],
    description: doc('Lift with Space, move with the arrow keys, drop with Space.'),
    checklist: [
      { id: 'c4', text: 'Announce every step', done: true },
      { id: 'c5', text: 'Return focus after the drop', done: true },
    ],
  });
  await add('Done', 'Set up the monorepo', { assigneeIds: ['grace'] });
  await add('Done', 'Ship the editor', { labelIds: [docs.id], coverColor: 'teal' });
  controller.close();
  return board.id;
}

/** Adds a handful of sample notes to the default board. */
export async function seedNotes(api: NotesApi): Promise<void> {
  const controller = await api.open('default');
  const samples: Array<{
    text: string;
    color?: 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange';
    pinned?: boolean;
    tags?: string[];
  }> = [
    {
      text: 'Ideas for the demo: drag a card, undo it, open the same page in a second tab.',
      color: 'yellow',
      pinned: true,
      tags: ['demo'],
    },
    {
      text: 'Groceries: oat milk, lemons, coffee beans, a very large bag of rice.',
      color: 'green',
      tags: ['home'],
    },
    {
      text: 'Call the supplier about the delayed order before Friday.',
      color: 'pink',
      tags: ['work'],
    },
    {
      text: 'Notes can be dragged on the free canvas, resized from the corner and moved with the arrow keys.',
      color: 'blue',
      tags: ['demo'],
    },
    {
      text: 'Read: "A Pattern Language" — chapters on windows and light.',
      color: 'purple',
      tags: ['reading'],
    },
    {
      text: 'Birthday gift ideas: a good knife, a plant, tickets.',
      color: 'orange',
      tags: ['home'],
    },
  ];
  for (const [i, s] of samples.entries()) {
    await controller.create({
      content: doc(s.text),
      ...(s.color ? { color: s.color } : {}),
      ...(s.pinned ? { pinned: true } : {}),
      ...(s.tags ? { tags: s.tags } : {}),
      x: 40 + (i % 3) * 270,
      y: 40 + Math.floor(i / 3) * 220,
    });
  }
  controller.close();
}

export async function seedAll(instance: TesseraInstance): Promise<{ boardId: string | undefined }> {
  const kanban = instance.feature('kanban');
  const notes = instance.feature('notes');
  const boardId = kanban ? await seedKanban(kanban) : undefined;
  if (notes) await seedNotes(notes);
  return { boardId };
}

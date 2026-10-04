import {
  type Command,
  createHistory,
  createStore,
  type Store,
  type TesseraContext,
  TesseraError,
} from '@tessera-kit/core';
import { toPlainText } from '@tessera-kit/editor';
import { type Collection, createCollection } from '@tessera-kit/storage';
import { createPersistence } from '@tessera-internal/persist';
import type { NotesConfigValue } from './config.js';
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  type Note,
  type NoteColor,
  NoteSchema,
  NotesExportSchema,
} from './schemas.js';
import type { NotesController, NotesState } from './types.js';

const PAGE = 500;
const CASCADE = 24;

/** Lower-cases and strips accents so "café" matches "cafe". */
const normalize = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function createNotesCollection(ctx: TesseraContext): Collection<Note> {
  return createCollection(ctx, 'notes.notes', NoteSchema);
}

interface Options {
  ctx: TesseraContext;
  config: NotesConfigValue;
  collection: Collection<Note>;
  boardId: string;
}

/** Orders notes for the grid: pinned first, then most recently changed. */
const gridOrder = (a: Note, b: Note): number =>
  Number(b.pinned) - Number(a.pinned) ||
  (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1);

const canvasOrder = (a: Note, b: Note): number => a.z - b.z || (a.id < b.id ? -1 : 1);

/** Everything one board of notes can do. Created by {@link NotesApi.open}. */
export async function createNotesController(opts: Options): Promise<NotesController> {
  const { ctx, config, collection, boardId } = opts;
  const history = createHistory({ clock: ctx.clock });
  const notes = new Map<string, Note>();
  const state: Store<NotesState> = createStore<NotesState>({
    notes: [],
    visible: [],
    query: '',
    tag: undefined,
    showArchived: false,
    layout: config.layout,
    tags: [],
    loading: true,
  });
  const now = (): string => new Date(ctx.clock.now()).toISOString();
  const plain = new Map<string, { content: Note['content']; text: string }>();

  const textOf = (note: Note): string => {
    const cached = plain.get(note.id);
    if (cached?.content === note.content) return cached.text;
    const text = normalize(`${toPlainText(note.content)}\n${note.tags.join(' ')}`);
    plain.set(note.id, { content: note.content, text });
    return text;
  };

  const recompute = (): void => {
    const all = [...notes.values()];
    state.set((prev) => {
      const query = normalize(prev.query.trim());
      const visible = all
        .filter((n) => Boolean(n.archived) === prev.showArchived)
        .filter((n) => prev.tag === undefined || n.tags.includes(prev.tag))
        .filter((n) => !query || textOf(n).includes(query))
        .sort(prev.layout === 'free' ? canvasOrder : gridOrder);
      const counts = new Map<string, number>();
      for (const n of all) {
        if (n.archived) continue;
        for (const tag of n.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      const tags = [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
      return { ...prev, notes: all.filter((n) => !n.archived), visible, tags };
    });
  };

  const persistence = createPersistence({
    logger: ctx.logger,
    onChange: recompute,
    onConflict: (event) => ctx.bus.emit('notes:conflict', event),
  });
  const kind = persistence.kind(collection, NoteSchema, notes);
  const { commit, insert, remove } = persistence;

  // ---------- load ----------
  try {
    let cursor: string | undefined;
    do {
      const page = await collection.list({
        where: { boardId },
        limit: PAGE,
        ...(cursor ? { cursor } : {}),
      });
      for (const doc of page.items) persistence.adopt(kind, doc);
      cursor = page.nextCursor;
    } while (cursor);
    state.set((prev) => ({ ...prev, loading: false }));
    recompute();
  } catch (error) {
    state.set((prev) => ({ ...prev, loading: false }));
    throw error;
  }
  if (config.sync === 'live') persistence.follow(kind, (_id, data) => data.boardId === boardId);

  // ---------- helpers ----------
  const note = (id: string): Note => {
    const found = notes.get(id);
    if (!found) throw new TesseraError('NOT_FOUND', `Note ${id} does not exist`);
    return found;
  };
  const allowedColor = (color: NoteColor): NoteColor =>
    config.colors.includes(color) ? color : (config.colors[0] as NoteColor);
  const defaultColor = allowedColor(config.defaultColor);

  const patchOf = (current: Note, patch: Partial<Note>): Note => {
    const next: Record<string, unknown> = { ...current, ...patch, updatedAt: now() };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    return next as Note;
  };
  const inverseOf = (current: Note, patch: Partial<Note>): Partial<Note> => {
    const back: Record<string, unknown> = {};
    for (const k of Object.keys(patch))
      back[k] = (current as unknown as Record<string, unknown>)[k];
    return back as Partial<Note>;
  };

  /** Keeps a patch inside what the config allows. */
  const sanitize = (patch: Partial<Note>): Partial<Note> => {
    const out = { ...patch };
    if (out.color !== undefined) {
      if (!config.colors.includes(out.color)) {
        throw new TesseraError('VALIDATION', `"${out.color}" is not an allowed note colour`);
      }
    }
    if (!config.tags && out.tags !== undefined) out.tags = [];
    if (!config.pinning && out.pinned !== undefined) out.pinned = false;
    if (out.w !== undefined) out.w = Math.max(MIN_WIDTH, out.w);
    if (out.h !== undefined) out.h = Math.max(MIN_HEIGHT, out.h);
    if (out.x !== undefined) out.x = Math.max(0, out.x);
    if (out.y !== undefined) out.y = Math.max(0, out.y);
    if (out.tags) out.tags = [...new Set(out.tags.map((t) => t.trim()).filter(Boolean))];
    return out;
  };

  const run = (cmd: Command): Promise<void> => history.push(cmd);

  const patchCommand = (id: string, rawPatch: Partial<Note>, label: string): Command => {
    const patch = sanitize(rawPatch);
    const before = inverseOf(note(id), patch);
    const apply = async (p: Partial<Note>): Promise<void> => {
      const saved = await commit(kind, id, (current) => patchOf(current, p));
      ctx.bus.emit('notes:updated', { note: saved, patch: p });
    };
    return {
      label,
      mergeKey: `note:${id}:${Object.keys(patch).sort().join(',')}`,
      do: () => apply(patch),
      undo: () => apply(before),
      // `this` is the command already on the stack, so a chain of merges keeps the first undo.
      merge(next) {
        return { ...next, undo: this.undo };
      },
    };
  };

  const nextZ = (): number => Math.max(0, ...[...notes.values()].map((n) => n.z)) + 1;

  const controller: NotesController = {
    boardId,
    state,
    history,
    getNote: (id) => notes.get(id),

    async create(input = {}) {
      const index = [...notes.values()].filter((n) => !n.archived).length;
      const createdBy = ctx.auth.getUser()?.id;
      const created = NoteSchema.parse({
        id: ctx.ids.next(),
        boardId,
        content: input.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
        color: allowedColor(input.color ?? defaultColor),
        x: input.x ?? 32 + (index % 8) * CASCADE,
        y: input.y ?? 32 + (index % 8) * CASCADE,
        w: Math.max(MIN_WIDTH, input.w ?? 240),
        h: Math.max(MIN_HEIGHT, input.h ?? 180),
        z: nextZ(),
        pinned: config.pinning ? (input.pinned ?? false) : false,
        tags: config.tags ? [...new Set(input.tags ?? [])] : [],
        createdAt: now(),
        updatedAt: now(),
        ...(createdBy ? { createdBy } : {}),
      });
      await run({
        label: 'notes.cmd.create',
        do: async () => {
          await insert(kind, created);
          ctx.bus.emit('notes:created', created);
        },
        undo: () => remove(kind, created.id),
      });
      return created;
    },

    async update(id, patch) {
      await run(patchCommand(id, patch, 'notes.cmd.edit'));
    },

    async move(id, x, y) {
      await run(patchCommand(id, { x, y }, 'notes.cmd.move'));
    },

    async resize(id, w, h) {
      await run(patchCommand(id, { w, h }, 'notes.cmd.resize'));
    },

    bringToFront(id) {
      const current = note(id);
      const top = nextZ();
      if (current.z === top - 1 && [...notes.values()].every((n) => n.id === id || n.z < current.z))
        return;
      // Stacking order is not worth an undo step.
      void commit(kind, id, (c) => ({ ...c, z: top })).catch((error: unknown) =>
        ctx.logger.warn('could not raise the note', error),
      );
    },

    async setColor(id, color) {
      await run(patchCommand(id, { color }, 'notes.cmd.color'));
    },

    async togglePin(id) {
      if (!config.pinning)
        throw new TesseraError('FORBIDDEN', 'Pinning is turned off in the notes config');
      await run(patchCommand(id, { pinned: !note(id).pinned }, 'notes.cmd.pin'));
    },

    async archive(id) {
      if (!config.archive)
        throw new TesseraError('FORBIDDEN', 'Archiving is turned off in the notes config');
      await run(patchCommand(id, { archived: true }, 'notes.cmd.archive'));
    },

    async unarchive(id) {
      await run(patchCommand(id, { archived: undefined }, 'notes.cmd.unarchive'));
    },

    async delete(id) {
      const snapshot = { ...note(id) };
      await run({
        label: 'notes.cmd.delete',
        do: async () => {
          await remove(kind, id);
          ctx.bus.emit('notes:deleted', snapshot);
        },
        undo: async () => {
          await insert(kind, snapshot);
        },
      });
    },

    setQuery(query) {
      state.set((prev) => ({ ...prev, query }));
      recompute();
    },
    setTag(tag) {
      state.set((prev) => ({ ...prev, tag }));
      recompute();
    },
    setShowArchived(show) {
      state.set((prev) => ({ ...prev, showArchived: show }));
      recompute();
    },
    setLayout(layout) {
      state.set((prev) => ({ ...prev, layout }));
      recompute();
    },

    exportJSON() {
      return { version: 1, boardId, notes: [...notes.values()].sort(canvasOrder) };
    },

    async importJSON(input) {
      const parsed = NotesExportSchema.safeParse(input);
      if (!parsed.success) {
        throw new TesseraError(
          'VALIDATION',
          `Not a notes export: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
          {
            details: parsed.error.issues,
          },
        );
      }
      history.clear();
      let z = nextZ();
      for (const incoming of [...parsed.data.notes].sort(canvasOrder)) {
        await insert(kind, {
          ...incoming,
          id: ctx.ids.next(),
          boardId,
          z: z++,
          color: allowedColor(incoming.color),
          tags: config.tags ? incoming.tags : [],
        });
      }
    },

    close() {
      persistence.close();
      history.clear();
    },
  };

  return controller;
}

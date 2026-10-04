import { wrapElement } from '@tessera-internal/react-wrap';
import { createStore } from '@tessera-kit/core';
import { useFeature, useStore } from '@tessera-kit/react';
import { useEffect, useState } from 'react';
import type { TesseraNotesElement } from '../elements/notes.js';
import type { Note } from '../schemas.js';
import type { NotesApi, NotesController, NotesState } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrapper renders an empty tag that upgrades after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface NotesProps {
  /** Id of the board of notes. Defaults to `default`. */
  board?: string | undefined;
  readonly?: boolean | undefined;
  onNoteCreate?: ((event: CustomEvent<{ note: Note }>) => void) | undefined;
  onNoteUpdate?: ((event: CustomEvent<{ note: Note; patch: Partial<Note> }>) => void) | undefined;
  onNoteDelete?: ((event: CustomEvent<{ note: Note }>) => void) | undefined;
}

/** `<tessera-notes>` for React. */
export const Notes = wrapElement<TesseraNotesElement, NotesProps>({
  tag: 'tessera-notes',
  properties: [],
  attributes: { board: 'board', readonly: 'readonly' },
  events: { onNoteCreate: 'note-create', onNoteUpdate: 'note-update', onNoteDelete: 'note-delete' },
});

const idle: ReturnType<typeof createStore<NotesState>> = createStore<NotesState>({
  notes: [],
  visible: [],
  query: '',
  tag: undefined,
  showArchived: false,
  layout: 'grid',
  tags: [],
  loading: true,
});

/** The notes API once the feature is enabled, or `undefined`. */
export function useNotes(): NotesApi | undefined {
  return useFeature('notes');
}

export interface UseNotesBoard {
  /** `undefined` until the board has loaded. */
  controller: NotesController | undefined;
  state: NotesState | undefined;
  error: Error | undefined;
}

/**
 * Opens a board of notes and keeps React in sync with it. The board is closed when `boardId`
 * changes or the component unmounts.
 *
 * @example
 * const { controller, state } = useNotesBoard();
 * state?.visible.map((note) => <p key={note.id}>{note.id}</p>);
 */
export function useNotesBoard(boardId = 'default'): UseNotesBoard {
  const api = useNotes();
  const [controller, setController] = useState<NotesController>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let opened: NotesController | undefined;
    api
      .open(boardId)
      .then((c) => {
        opened = c;
        if (cancelled) c.close();
        else {
          setError(undefined);
          setController(c);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
      opened?.close();
      setController(undefined);
    };
  }, [api, boardId]);

  const state = useStore(controller?.state ?? idle);
  return { controller, state: controller ? state : undefined, error };
}

export type { TesseraNotesElement };

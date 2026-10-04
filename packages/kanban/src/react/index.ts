import { createStore, type TesseraError, type UserInfo } from '@tessera-kit/core';
import { useFeature, useStore } from '@tessera-kit/react';
import { wrapElement } from '@tessera-internal/react-wrap';
import { useEffect, useState } from 'react';
import type { TesseraKanbanElement } from '../elements/board.js';
import type { Card } from '../schemas.js';
import type { BoardController, BoardState, KanbanApi } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrapper renders an empty tag that upgrades after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

type Detail<T> = (event: CustomEvent<T>) => void;

export interface KanbanProps {
  /** Id of the board to show. Leave out to show the board picker. */
  board?: string | undefined;
  readonly?: boolean | undefined;
  members?: UserInfo[] | undefined;
  beforeCardMove?: ((card: Card, toColumnId: string) => boolean | Promise<boolean>) | undefined;
  renderCardFooter?: TesseraKanbanElement['renderCardFooter'];
  onCardCreate?: Detail<{ card: Card }> | undefined;
  onCardUpdate?: Detail<{ card: Card; patch: Partial<Card> }> | undefined;
  /** Cancelable: call `event.preventDefault()` to refuse the move. */
  onCardMove?:
    | Detail<{ card: Card; fromColumnId: string; toColumnId: string; toIndex: number }>
    | undefined;
  onCardOpen?: Detail<{ card: Card }> | undefined;
  /** Cancelable: call `event.preventDefault()` to keep the card. */
  onCardDelete?: Detail<{ card: Card }> | undefined;
}

/** `<tessera-kanban>` for React. */
export const Kanban = wrapElement<TesseraKanbanElement, KanbanProps>({
  tag: 'tessera-kanban',
  properties: ['members', 'beforeCardMove', 'renderCardFooter'],
  attributes: { board: 'board', readonly: 'readonly' },
  events: {
    onCardCreate: 'card-create',
    onCardUpdate: 'card-update',
    onCardMove: 'card-move',
    onCardOpen: 'card-open',
    onCardDelete: 'card-delete',
  },
});

const idle: ReturnType<typeof createStore<BoardState>> = createStore<BoardState>({
  board: null,
  columns: [],
  cardsByColumn: new Map(),
  cardCounts: new Map(),
  filter: { text: '', labelIds: [], assigneeIds: [], due: 'any' },
  loading: true,
  error: null,
});

/** The kanban API once the feature is enabled, or `undefined`. */
export function useKanban(): KanbanApi | undefined {
  return useFeature('kanban');
}

export interface UseKanbanBoard {
  /** `undefined` until the board has loaded. */
  controller: BoardController | undefined;
  state: BoardState | undefined;
  error: TesseraError | Error | undefined;
}

/**
 * Opens a board and keeps React in sync with it. The board is closed when `boardId` changes or
 * the component unmounts.
 *
 * @example
 * const { controller, state } = useKanbanBoard('roadmap');
 * <button onClick={() => controller?.addCard(columnId, { title: 'New' })}>Add</button>
 */
export function useKanbanBoard(boardId: string | undefined): UseKanbanBoard {
  const api = useKanban();
  const [controller, setController] = useState<BoardController>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!api || !boardId) return;
    let cancelled = false;
    let opened: BoardController | undefined;
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

export type { TesseraKanbanElement };

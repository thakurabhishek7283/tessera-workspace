import type { History, ReadonlyStore, TesseraError, Unsubscribe, UserInfo } from '@tessera/core';
import type { KanbanConfigValue } from './config.js';
import type { KanbanFilter } from './filter.js';
import type { Board, BoardExport, Card, CardInput, Column, Label, TokenColor } from './schemas.js';

export interface BoardState {
  /** `null` until the board has loaded. */
  board: Board | null;
  /** Columns in display order. */
  columns: Column[];
  /** Cards that pass the filter, by column id, in display order. Archived cards are left out. */
  cardsByColumn: Map<string, Card[]>;
  /** All non-archived cards per column, ignoring the filter (for WIP limits). */
  cardCounts: Map<string, number>;
  filter: KanbanFilter;
  loading: boolean;
  error: TesseraError | null;
}

/** Options that are functions or live data, so they cannot be part of the JSON config. */
export interface KanbanRuntime {
  /** People who can be assigned to cards. */
  members: UserInfo[];
  /** Return `false` to refuse a move. May be async. */
  beforeCardMove?: ((card: Card, toColumnId: string) => boolean | Promise<boolean>) | undefined;
}

export interface KanbanApi {
  readonly config: KanbanConfigValue;
  readonly runtime: ReadonlyStore<KanbanRuntime>;
  /** Boards in creation order. */
  listBoards(): Promise<Board[]>;
  createBoard(input: { title: string; columns?: string[] }): Promise<Board>;
  /** Loads a board with its columns and cards and starts live sync. */
  open(boardId: string): Promise<BoardController>;
  /** Sets runtime options such as `members` and `beforeCardMove`. */
  configure(patch: Partial<KanbanRuntime>): void;
}

export interface BoardController {
  readonly boardId: string;
  readonly state: ReadonlyStore<BoardState>;
  readonly history: History;
  addColumn(title: string, at?: number): Promise<Column>;
  renameColumn(id: string, title: string): Promise<void>;
  /** `toIndex` counts the other columns, so it is the final position. */
  moveColumn(id: string, toIndex: number): Promise<void>;
  /** Without `moveCardsTo` the column's cards are deleted with it. */
  deleteColumn(id: string, opts?: { moveCardsTo?: string }): Promise<void>;
  setWipLimit(id: string, limit: number | null): Promise<void>;
  updateColumn(
    id: string,
    patch: { color?: TokenColor | undefined; collapsed?: boolean | undefined },
  ): Promise<void>;
  addCard(columnId: string, input: CardInput, at?: 'top' | 'bottom'): Promise<Card>;
  updateCard(id: string, patch: Partial<Omit<Card, 'id' | 'boardId'>>): Promise<void>;
  /**
   * Moves a card; `toIndex` counts the cards that stay in the destination (visible ones, when a
   * filter is active), so it is the final position. Returns `false` when the move was refused by
   * a WIP limit or by `beforeCardMove`.
   */
  moveCard(id: string, toColumnId: string, toIndex: number): Promise<boolean>;
  deleteCard(id: string): Promise<void>;
  archiveCard(id: string): Promise<void>;
  addLabel(input: { name: string; color: TokenColor }): Promise<Label>;
  updateLabel(id: string, patch: { name?: string; color?: TokenColor }): Promise<void>;
  /** Also removes the label from every card. */
  deleteLabel(id: string): Promise<void>;
  renameBoard(title: string): Promise<void>;
  setFilter(filter: Partial<KanbanFilter>): void;
  exportJSON(): BoardExport;
  /** `replace` swaps the board's content, `merge` appends copies with new ids. Clears undo history. */
  importJSON(data: unknown, mode: 'replace' | 'merge'): Promise<void>;
  close(): void;
}

export type { Unsubscribe };

declare module '@tessera/core' {
  interface FeatureApiMap {
    kanban: KanbanApi;
  }
  interface ServiceMap {
    kanban: KanbanApi;
  }
  interface TesseraEvents {
    'kanban:board-created': Board;
    'kanban:card-created': Card;
    'kanban:card-updated': { card: Card; patch: Partial<Card> };
    'kanban:card-moved': {
      card: Card;
      fromColumnId: string;
      toColumnId: string;
      fromIndex: number;
      toIndex: number;
    };
    'kanban:card-deleted': Card;
    'kanban:column-created': Column;
    'kanban:column-updated': { column: Column; patch: Partial<Column> };
    'kanban:column-moved': { column: Column; fromIndex: number; toIndex: number };
    'kanban:column-deleted': Column;
    /** A move was refused: the target column is full, or `beforeCardMove` said no. */
    'kanban:move-blocked': { card: Card; toColumnId: string; reason: 'wip' | 'vetoed' };
    /**
     * A write collided with a newer version. `reapplied` means it was merged automatically;
     * `reverted` and `dropped` mean the change did not survive.
     */
    'kanban:conflict': {
      collection: string;
      id: string;
      resolution: 'reapplied' | 'reverted' | 'dropped';
    };
  }
}

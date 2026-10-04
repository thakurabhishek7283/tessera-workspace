import type { History, ReadonlyStore } from '@tessera-kit/core';
import type { NotesConfigValue } from './config.js';
import type { Note, NoteColor, NotesExport } from './schemas.js';

export interface NotesState {
  /** Every note of the board that is not hidden by archiving, in storage order. */
  notes: Note[];
  /** What is on screen: search, tag and archive filters applied, in layout order. */
  visible: Note[];
  query: string;
  tag: string | undefined;
  /** When true only archived notes are shown. */
  showArchived: boolean;
  layout: 'grid' | 'free';
  /** All tags in use with their note counts, most used first. */
  tags: Array<{ tag: string; count: number }>;
  loading: boolean;
}

export interface NotesApi {
  readonly config: NotesConfigValue;
  /** Loads a board of notes (default board id `default`) and starts live sync. */
  open(boardId?: string): Promise<NotesController>;
}

export interface NotesController {
  readonly boardId: string;
  readonly state: ReadonlyStore<NotesState>;
  readonly history: History;
  getNote(id: string): Note | undefined;
  /** On the free canvas a note without a position is placed with a small cascade offset. */
  create(
    input?: Partial<Pick<Note, 'content' | 'color' | 'x' | 'y' | 'w' | 'h' | 'pinned' | 'tags'>>,
  ): Promise<Note>;
  /** Content edits made in quick succession merge into one undo step. */
  update(id: string, patch: Partial<Omit<Note, 'id' | 'boardId'>>): Promise<void>;
  move(id: string, x: number, y: number): Promise<void>;
  /** Sizes are kept at or above 160×120. */
  resize(id: string, w: number, h: number): Promise<void>;
  bringToFront(id: string): void;
  setColor(id: string, color: NoteColor): Promise<void>;
  togglePin(id: string): Promise<void>;
  archive(id: string): Promise<void>;
  unarchive(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  setQuery(query: string): void;
  setTag(tag: string | undefined): void;
  setShowArchived(show: boolean): void;
  setLayout(layout: 'grid' | 'free'): void;
  exportJSON(): NotesExport;
  /** Imported notes are copies with new ids, so importing twice never overwrites anything. */
  importJSON(data: unknown): Promise<void>;
  close(): void;
}

declare module '@tessera-kit/core' {
  interface FeatureApiMap {
    notes: NotesApi;
  }
  interface ServiceMap {
    notes: NotesApi;
  }
  interface TesseraEvents {
    'notes:created': Note;
    'notes:updated': { note: Note; patch: Partial<Note> };
    'notes:deleted': Note;
    /** A write collided with a newer version; see the kanban kit for the meaning of `resolution`. */
    'notes:conflict': {
      collection: string;
      id: string;
      resolution: 'reapplied' | 'reverted' | 'dropped';
    };
  }
}

import type { TesseraInstance } from '@tessera/core';
import type { ToolbarItem } from '@tessera/editor';
import type { NoteColor } from '../schemas.js';

/** Everything a note element needs from the board that renders it. */
export interface NotesView {
  t(key: string, params?: Record<string, unknown>): string;
  formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions): string;
  readonly: boolean;
  layout: 'grid' | 'free';
  colors: readonly NoteColor[];
  allow: { pinning: boolean; archive: boolean; tags: boolean };
  /** True when the rich text editor can be used; otherwise a plain text box stands in. */
  editor: boolean;
  toolbar: readonly ToolbarItem[];
  instance: TesseraInstance | undefined;
  /** The archive view is showing: notes can be restored instead of archived. */
  archived: boolean;
}

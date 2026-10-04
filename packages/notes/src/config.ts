import { ToolbarItemSchema } from '@tessera-kit/editor';
import * as z from 'zod/mini';
import { NOTE_COLORS, NoteColorSchema } from './schemas.js';

/** Options of the `notes` feature. `{ enabled: true }` alone is valid. */
export const NotesConfig = z.object({
  enabled: z.boolean(),
  layout: z
    ._default(z.enum(['grid', 'free']), 'grid')
    .check(
      z.describe(
        '`grid` is a responsive masonry (pinned first, newest first); `free` is a canvas where notes can be dragged and resized.',
      ),
    ),
  allowLayoutSwitch: z._default(z.boolean(), true).check(z.describe('Show the grid/free switch.')),
  colors: z
    ._default(z.array(NoteColorSchema).check(z.minLength(1)), [...NOTE_COLORS])
    .check(z.describe('Colours a note can have.')),
  defaultColor: z
    ._default(NoteColorSchema, 'yellow')
    .check(
      z.describe('Colour of new notes (the first allowed colour when this one is not allowed).'),
    ),
  tags: z._default(z.boolean(), true).check(z.describe('Notes can be tagged and filtered by tag.')),
  search: z._default(z.boolean(), true).check(z.describe('Show the search box.')),
  pinning: z._default(z.boolean(), true).check(z.describe('Notes can be pinned to the top.')),
  archive: z
    ._default(z.boolean(), true)
    .check(z.describe('Notes can be archived instead of deleted.')),
  editor: z._default(
    z.object({
      toolbar: z
        ._default(z.array(ToolbarItemSchema), [
          'bold',
          'italic',
          'bullet-list',
          'task-list',
          'link',
        ])
        .check(z.describe('Toolbar of the inline editor.')),
    }),
    { toolbar: ['bold', 'italic', 'bullet-list', 'task-list', 'link'] },
  ),
  sync: z
    ._default(z.enum(['none', 'live']), 'live')
    .check(
      z.describe('`live` applies changes made in other tabs or by other users as they happen.'),
    ),
});

export type NotesConfigValue = z.infer<typeof NotesConfig>;

import { ToolbarItemSchema } from '@tessera-kit/editor';
import { z } from 'zod';
import { NOTE_COLORS, NoteColorSchema } from './schemas.js';

/** Options of the `notes` feature. `{ enabled: true }` alone is valid. */
export const NotesConfig = z.object({
  enabled: z.boolean(),
  layout: z
    .enum(['grid', 'free'])
    .default('grid')
    .describe(
      '`grid` is a responsive masonry (pinned first, newest first); `free` is a canvas where notes can be dragged and resized.',
    ),
  allowLayoutSwitch: z.boolean().default(true).describe('Show the grid/free switch.'),
  colors: z
    .array(NoteColorSchema)
    .min(1)
    .default([...NOTE_COLORS])
    .describe('Colours a note can have.'),
  defaultColor: NoteColorSchema.default('yellow').describe(
    'Colour of new notes (the first allowed colour when this one is not allowed).',
  ),
  tags: z.boolean().default(true).describe('Notes can be tagged and filtered by tag.'),
  search: z.boolean().default(true).describe('Show the search box.'),
  pinning: z.boolean().default(true).describe('Notes can be pinned to the top.'),
  archive: z.boolean().default(true).describe('Notes can be archived instead of deleted.'),
  editor: z
    .object({
      toolbar: z
        .array(ToolbarItemSchema)
        .default(['bold', 'italic', 'bullet-list', 'task-list', 'link'])
        .describe('Toolbar of the inline editor.'),
    })
    .default({ toolbar: ['bold', 'italic', 'bullet-list', 'task-list', 'link'] }),
  sync: z
    .enum(['none', 'live'])
    .default('live')
    .describe('`live` applies changes made in other tabs or by other users as they happen.'),
});

export type NotesConfigValue = z.infer<typeof NotesConfig>;

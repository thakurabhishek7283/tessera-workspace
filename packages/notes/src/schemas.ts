import { RichDocSchema } from '@tessera/editor';
import { z } from 'zod';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'gray'] as const;
export const NoteColorSchema = z.enum(NOTE_COLORS);
export type NoteColor = z.infer<typeof NoteColorSchema>;

export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 120;

export const NoteSchema = z.object({
  id: z.string().min(1),
  /** Notes belong to a board so one app can keep several piles. */
  boardId: z.string().min(1),
  content: RichDocSchema,
  color: NoteColorSchema,
  /** Position and size on the free canvas, in pixels. Ignored by the grid layout. */
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().min(MIN_WIDTH).max(2000),
  h: z.number().min(MIN_HEIGHT).max(2000),
  /** Stacking order on the free canvas: higher is in front. */
  z: z.number().int(),
  pinned: z.boolean(),
  tags: z.array(z.string().min(1).max(40)).max(20),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: z.string().optional(),
  archived: z.boolean().optional(),
});
export type Note = z.infer<typeof NoteSchema>;

export const NotesExportSchema = z.object({
  version: z.literal(1),
  boardId: z.string(),
  notes: z.array(NoteSchema),
});
export type NotesExport = z.infer<typeof NotesExportSchema>;

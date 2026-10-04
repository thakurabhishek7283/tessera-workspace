import { RichDocSchema } from '@tessera-kit/editor';
import * as z from 'zod/mini';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'gray'] as const;
export const NoteColorSchema = z.enum(NOTE_COLORS);
export type NoteColor = z.infer<typeof NoteColorSchema>;

export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 120;

export const NoteSchema = z.object({
  id: z.string().check(z.minLength(1)),
  /** Notes belong to a board so one app can keep several piles. */
  boardId: z.string().check(z.minLength(1)),
  content: RichDocSchema,
  color: NoteColorSchema,
  /** Position and size on the free canvas, in pixels. Ignored by the grid layout. */
  x: z.number().check(z.gte(0)),
  y: z.number().check(z.gte(0)),
  w: z.number().check(z.gte(MIN_WIDTH), z.lte(2000)),
  h: z.number().check(z.gte(MIN_HEIGHT), z.lte(2000)),
  /** Stacking order on the free canvas: higher is in front. */
  z: z.int(),
  pinned: z.boolean(),
  tags: z.array(z.string().check(z.minLength(1), z.maxLength(40))).check(z.maxLength(20)),
  createdAt: z.string().check(z.minLength(1)),
  updatedAt: z.string().check(z.minLength(1)),
  createdBy: z.optional(z.string()),
  archived: z.optional(z.boolean()),
});
export type Note = z.infer<typeof NoteSchema>;

export const NotesExportSchema = z.object({
  version: z.literal(1),
  boardId: z.string(),
  notes: z.array(NoteSchema),
});
export type NotesExport = z.infer<typeof NotesExportSchema>;

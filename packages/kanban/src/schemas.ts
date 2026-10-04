import { RichDocSchema } from '@tessera-kit/editor';
import { z } from 'zod';

export const TOKEN_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;
export const TokenColorSchema = z.enum(TOKEN_COLORS);
export type TokenColor = z.infer<typeof TokenColorSchema>;

const Iso = z.string().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-03-07');

export const LabelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  color: TokenColorSchema,
});
export type Label = z.infer<typeof LabelSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(200),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const BoardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  description: RichDocSchema.optional(),
  labels: z.array(LabelSchema).max(50).default([]),
  createdAt: Iso,
  updatedAt: Iso,
  archived: z.boolean().optional(),
});
export type Board = z.infer<typeof BoardSchema>;

export const ColumnSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  title: z.string().min(1).max(60),
  /** Fractional-index key; columns are ordered by it. */
  rank: z.string().min(1),
  wipLimit: z.number().int().positive().optional(),
  color: TokenColorSchema.optional(),
  collapsed: z.boolean().optional(),
});
export type Column = z.infer<typeof ColumnSchema>;

export const CardSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  rank: z.string().min(1),
  title: z.string().min(1).max(200),
  description: RichDocSchema.optional(),
  labelIds: z.array(z.string()).max(50).default([]),
  assigneeIds: z.array(z.string()).max(50).default([]),
  dueDate: IsoDate.optional(),
  startDate: IsoDate.optional(),
  checklist: z.array(ChecklistItemSchema).max(100).default([]),
  coverColor: TokenColorSchema.optional(),
  estimate: z.number().nonnegative().optional(),
  /** Fields defined by the host in `config.customFields`. */
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  createdAt: Iso,
  updatedAt: Iso,
  createdBy: z.string().optional(),
  archived: z.boolean().optional(),
});
export type Card = z.infer<typeof CardSchema>;

/** Input of {@link BoardController.addCard}: only the title is required. */
export type CardInput = Partial<Omit<Card, 'id' | 'boardId' | 'columnId' | 'rank'>> & {
  title: string;
};

export const BoardExportSchema = z.object({
  version: z.literal(1),
  board: BoardSchema,
  columns: z.array(ColumnSchema),
  cards: z.array(CardSchema),
});
export type BoardExport = z.infer<typeof BoardExportSchema>;

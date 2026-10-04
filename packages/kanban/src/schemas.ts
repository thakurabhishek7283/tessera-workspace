import { RichDocSchema } from '@tessera-kit/editor';
import * as z from 'zod/mini';

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

const Iso = z.string().check(z.minLength(1));
const IsoDate = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-03-07'));

export const LabelSchema = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1), z.maxLength(40)),
  color: TokenColorSchema,
});
export type Label = z.infer<typeof LabelSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().check(z.minLength(1)),
  text: z.string().check(z.minLength(1), z.maxLength(200)),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const BoardSchema = z.object({
  id: z.string().check(z.minLength(1)),
  title: z.string().check(z.minLength(1), z.maxLength(120)),
  description: z.optional(RichDocSchema),
  labels: z._default(z.array(LabelSchema).check(z.maxLength(50)), []),
  createdAt: Iso,
  updatedAt: Iso,
  archived: z.optional(z.boolean()),
});
export type Board = z.infer<typeof BoardSchema>;

export const ColumnSchema = z.object({
  id: z.string().check(z.minLength(1)),
  boardId: z.string().check(z.minLength(1)),
  title: z.string().check(z.minLength(1), z.maxLength(60)),
  /** Fractional-index key; columns are ordered by it. */
  rank: z.string().check(z.minLength(1)),
  wipLimit: z.optional(z.int().check(z.positive())),
  color: z.optional(TokenColorSchema),
  collapsed: z.optional(z.boolean()),
});
export type Column = z.infer<typeof ColumnSchema>;

export const CardSchema = z.object({
  id: z.string().check(z.minLength(1)),
  boardId: z.string().check(z.minLength(1)),
  columnId: z.string().check(z.minLength(1)),
  rank: z.string().check(z.minLength(1)),
  title: z.string().check(z.minLength(1), z.maxLength(200)),
  description: z.optional(RichDocSchema),
  labelIds: z._default(z.array(z.string()).check(z.maxLength(50)), []),
  assigneeIds: z._default(z.array(z.string()).check(z.maxLength(50)), []),
  dueDate: z.optional(IsoDate),
  startDate: z.optional(IsoDate),
  checklist: z._default(z.array(ChecklistItemSchema).check(z.maxLength(100)), []),
  coverColor: z.optional(TokenColorSchema),
  estimate: z.optional(z.number().check(z.nonnegative())),
  /** Fields defined by the host in `config.customFields`. */
  custom: z.optional(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
  createdAt: Iso,
  updatedAt: Iso,
  createdBy: z.optional(z.string()),
  archived: z.optional(z.boolean()),
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

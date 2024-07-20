import { z } from 'zod';
import { TOKEN_COLORS } from './schemas.js';

export const CARD_FIELDS = [
  'description',
  'labels',
  'assignees',
  'dueDate',
  'startDate',
  'checklist',
  'coverColor',
  'estimate',
] as const;
export type CardField = (typeof CARD_FIELDS)[number];

const CustomField = z.object({
  key: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'must start with a letter; letters, digits and _ only')
    .describe('Property name stored on the card.'),
  label: z.string().min(1).describe('Shown in the card dialog.'),
  type: z.enum(['text', 'number', 'boolean', 'select']).describe('Input type.'),
  options: z.array(z.string()).optional().describe('Choices for `select` fields.'),
  showOnCard: z.boolean().default(false).describe('Also show the value on the card in the board.'),
});
export type CustomFieldConfig = z.infer<typeof CustomField>;

/** Options of the `kanban` feature. `{ enabled: true }` alone is valid. */
export const KanbanConfig = z.object({
  enabled: z.boolean(),
  defaultColumns: z
    .array(z.string().min(1).max(60))
    .default(['To do', 'In progress', 'Done'])
    .describe('Columns created with a new board.'),
  allow: z
    .object({
      createBoard: z.boolean().default(true),
      createColumn: z.boolean().default(true),
      renameColumn: z.boolean().default(true),
      deleteColumn: z.boolean().default(true),
      reorderColumns: z.boolean().default(true),
      createCard: z.boolean().default(true),
      deleteCard: z.boolean().default(true),
      moveCard: z.boolean().default(true),
    })
    .default({
      createBoard: true,
      createColumn: true,
      renameColumn: true,
      deleteColumn: true,
      reorderColumns: true,
      createCard: true,
      deleteCard: true,
      moveCard: true,
    })
    .describe('Capability switches. The UI hides what is off and the controller refuses it.'),
  cardFields: z
    .array(z.enum(CARD_FIELDS))
    .default(['description', 'labels', 'assignees', 'dueDate', 'checklist'])
    .describe('Fields shown in the card dialog.'),
  customFields: z.array(CustomField).default([]).describe('Extra fields defined by the host.'),
  wipLimits: z
    .boolean()
    .default(true)
    .describe('Enforce column work-in-progress limits (moves into a full column are refused).'),
  filters: z.boolean().default(true).describe('Show the filter bar.'),
  density: z.enum(['comfortable', 'compact']).default('comfortable').describe('Card spacing.'),
  sync: z
    .enum(['none', 'live'])
    .default('live')
    .describe('`live` applies changes made in other tabs or by other users as they happen.'),
});

export type KanbanConfigValue = z.infer<typeof KanbanConfig>;
export { TOKEN_COLORS };

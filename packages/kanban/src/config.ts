import * as z from 'zod/mini';
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
    .check(
      z.regex(
        /^[A-Za-z][A-Za-z0-9_]{0,39}$/,
        'must start with a letter; letters, digits and _ only',
      ),
      z.describe('Property name stored on the card.'),
    ),
  label: z.string().check(z.minLength(1), z.describe('Shown in the card dialog.')),
  type: z.enum(['text', 'number', 'boolean', 'select']).check(z.describe('Input type.')),
  options: z.optional(z.array(z.string())).check(z.describe('Choices for `select` fields.')),
  showOnCard: z
    ._default(z.boolean(), false)
    .check(z.describe('Also show the value on the card in the board.')),
});
export type CustomFieldConfig = z.infer<typeof CustomField>;

/** Options of the `kanban` feature. `{ enabled: true }` alone is valid. */
export const KanbanConfig = z.object({
  enabled: z.boolean(),
  defaultColumns: z
    ._default(z.array(z.string().check(z.minLength(1), z.maxLength(60))), [
      'To do',
      'In progress',
      'Done',
    ])
    .check(z.describe('Columns created with a new board.')),
  allow: z
    ._default(
      z.object({
        createBoard: z._default(z.boolean(), true),
        createColumn: z._default(z.boolean(), true),
        renameColumn: z._default(z.boolean(), true),
        deleteColumn: z._default(z.boolean(), true),
        reorderColumns: z._default(z.boolean(), true),
        createCard: z._default(z.boolean(), true),
        deleteCard: z._default(z.boolean(), true),
        moveCard: z._default(z.boolean(), true),
      }),
      {
        createBoard: true,
        createColumn: true,
        renameColumn: true,
        deleteColumn: true,
        reorderColumns: true,
        createCard: true,
        deleteCard: true,
        moveCard: true,
      },
    )
    .check(
      z.describe('Capability switches. The UI hides what is off and the controller refuses it.'),
    ),
  cardFields: z
    ._default(z.array(z.enum(CARD_FIELDS)), [
      'description',
      'labels',
      'assignees',
      'dueDate',
      'checklist',
    ])
    .check(z.describe('Fields shown in the card dialog.')),
  customFields: z
    ._default(z.array(CustomField), [])
    .check(z.describe('Extra fields defined by the host.')),
  wipLimits: z
    ._default(z.boolean(), true)
    .check(
      z.describe('Enforce column work-in-progress limits (moves into a full column are refused).'),
    ),
  filters: z._default(z.boolean(), true).check(z.describe('Show the filter bar.')),
  density: z
    ._default(z.enum(['comfortable', 'compact']), 'comfortable')
    .check(z.describe('Card spacing.')),
  sync: z
    ._default(z.enum(['none', 'live']), 'live')
    .check(
      z.describe('`live` applies changes made in other tabs or by other users as they happen.'),
    ),
});

export type KanbanConfigValue = z.infer<typeof KanbanConfig>;
export { TOKEN_COLORS };

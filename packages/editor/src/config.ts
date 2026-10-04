import * as z from 'zod/mini';

/** Every id a toolbar may contain, besides the `'|'` separator. */
export const TOOLBAR_ITEMS = [
  'undo',
  'redo',
  'heading',
  'paragraph',
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'highlight',
  'bullet-list',
  'ordered-list',
  'task-list',
  'blockquote',
  'code-block',
  'hr',
  'link',
  'image',
  'table',
  'align-left',
  'align-center',
  'align-right',
  'clear',
] as const;

export type ToolbarId = (typeof TOOLBAR_ITEMS)[number];
/** A toolbar entry: a button id, or `'|'` for a separator. */
export type ToolbarItem = ToolbarId | '|';

export const ToolbarItemSchema = z.union([z.enum(TOOLBAR_ITEMS), z.literal('|')]);

export const DEFAULT_TOOLBAR: ToolbarItem[] = [
  'heading',
  'bold',
  'italic',
  'underline',
  '|',
  'bullet-list',
  'ordered-list',
  'task-list',
  '|',
  'link',
  'image',
  'code-block',
  '|',
  'undo',
  'redo',
];

/** Options of the `editor` feature. `{ enabled: true }` alone is valid. */
export const EditorConfig = z.object({
  enabled: z.boolean(),
  toolbar: z
    ._default(z.array(ToolbarItemSchema), DEFAULT_TOOLBAR)
    .check(
      z.describe(
        'Toolbar buttons in order. Use `"|"` for a separator; an empty array hides the toolbar.',
      ),
    ),
  bubbleMenu: z
    ._default(z.boolean(), true)
    .check(z.describe('Show a formatting menu next to a text selection.')),
  slashCommands: z
    ._default(z.boolean(), true)
    .check(z.describe('Type `/` on an empty line to insert a block.')),
  markdownShortcuts: z
    ._default(z.boolean(), true)
    .check(z.describe('Turn `# `, `- `, `[] ` and similar typed patterns into formatting.')),
  placeholder: z.optional(z.string()).check(z.describe('Text shown while the editor is empty.')),
  maxLength: z
    .optional(z.int().check(z.positive()))
    .check(z.describe('Maximum number of characters. Typing and pasting stop at the limit.')),
  images: z._default(
    z.object({
      enabled: z
        ._default(z.boolean(), true)
        .check(z.describe('Allow images (paste, drop and the toolbar).')),
      maxBytes: z
        .optional(z.number().check(z.positive()))
        .check(z.describe('Largest accepted image. Defaults to the upload adapter limit.')),
    }),
    { enabled: true },
  ),
  links: z._default(
    z.object({
      openOnClick: z
        ._default(z.boolean(), false)
        .check(z.describe('Follow a link when it is clicked.')),
      autolink: z._default(z.boolean(), true).check(z.describe('Turn typed URLs into links.')),
      protocols: z
        ._default(z.array(z.string()), ['http', 'https', 'mailto'])
        .check(z.describe('URL schemes that may be linked.')),
    }),
    { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
  ),
  mentions: z._default(
    z.object({
      enabled: z
        ._default(z.boolean(), false)
        .check(z.describe('Type `@` to mention someone. The provider is passed at runtime.')),
    }),
    { enabled: false },
  ),
  codeHighlight: z
    ._default(z.boolean(), true)
    .check(z.describe('Syntax highlighting in code blocks (common languages, loaded on demand).')),
  tables: z._default(z.boolean(), false).check(z.describe('Allow tables.')),
});

export type EditorConfigValue = z.infer<typeof EditorConfig>;

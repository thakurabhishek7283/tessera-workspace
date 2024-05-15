import { z } from 'zod';

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
    .array(ToolbarItemSchema)
    .default(DEFAULT_TOOLBAR)
    .describe(
      'Toolbar buttons in order. Use `"|"` for a separator; an empty array hides the toolbar.',
    ),
  bubbleMenu: z
    .boolean()
    .default(true)
    .describe('Show a formatting menu next to a text selection.'),
  slashCommands: z.boolean().default(true).describe('Type `/` on an empty line to insert a block.'),
  markdownShortcuts: z
    .boolean()
    .default(true)
    .describe('Turn `# `, `- `, `[] ` and similar typed patterns into formatting.'),
  placeholder: z.string().optional().describe('Text shown while the editor is empty.'),
  maxLength: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of characters. Typing and pasting stop at the limit.'),
  images: z
    .object({
      enabled: z.boolean().default(true).describe('Allow images (paste, drop and the toolbar).'),
      maxBytes: z
        .number()
        .positive()
        .optional()
        .describe('Largest accepted image. Defaults to the upload adapter limit.'),
    })
    .default({ enabled: true }),
  links: z
    .object({
      openOnClick: z.boolean().default(false).describe('Follow a link when it is clicked.'),
      autolink: z.boolean().default(true).describe('Turn typed URLs into links.'),
      protocols: z
        .array(z.string())
        .default(['http', 'https', 'mailto'])
        .describe('URL schemes that may be linked.'),
    })
    .default({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
  mentions: z
    .object({
      enabled: z
        .boolean()
        .default(false)
        .describe('Type `@` to mention someone. The provider is passed at runtime.'),
    })
    .default({ enabled: false }),
  codeHighlight: z
    .boolean()
    .default(true)
    .describe('Syntax highlighting in code blocks (common languages, loaded on demand).'),
  tables: z.boolean().default(false).describe('Allow tables.'),
});

export type EditorConfigValue = z.infer<typeof EditorConfig>;

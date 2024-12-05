# @tessera/editor

A rich-text editor for the [Tessera](https://github.com/thakurabhishek7283/tessera) kit family: a headless API, a `<tessera-editor>` web component and React bindings. Tiptap is loaded the first time an editor is created, so an app that only shows stored documents never pays for it.

- Toolbar, bubble menu on selection, `/` block menu and Markdown shortcuts (`# `, `- `, `[] `, `` ` ``)
- Headings, bold, italic, underline, strike, code, highlight, lists, task lists, quotes, code blocks (optional syntax highlighting), tables (optional), links, images, text alignment
- Image upload through the instance's upload adapter (paste, drop, toolbar, slash menu), with size and type limits
- Documents are plain JSON (`RichDoc`), validated with zod; import and export HTML (sanitized with DOMPurify) and Markdown
- `<tessera-rich-text>` renders a stored document read-only without loading the editor
- Form-associated: works in a `<form>`, with `required`, `maxlength` and reset
- Keyboard operable, labelled, announced; light and dark themes; English and German

## Install

```sh
pnpm add @tessera/editor @tessera/core @tessera/elements
```

`@tessera/core` and `@tessera/elements` are peer dependencies, so every kit on a page shares one instance. The packages are not published to npm yet; see the [repository README](../../README.md) for building from source.

## Use

### Web component

```html
<script type="module">
  import '@tessera/editor/elements';
</script>

<tessera-editor id="doc" placeholder="Start writing…"></tessera-editor>

<script type="module">
  const editor = document.querySelector('#doc');
  editor.addEventListener('change', (e) => console.log(e.detail.value.json));
</script>
```

Importing the elements module is enough: a bare `<tessera-editor>` runs on the implicit default instance and turns the feature on with defaults. To configure it, put the element under `<tessera-root>` or set `editor.tessera = instance` (see the repository README).

### React

```tsx
import { Editor, RichText } from '@tessera/editor/react';

<Editor
  value={doc}
  placeholder="Start writing…"
  onChange={(e) => save(e.detail.value.json)}
/>;

<RichText doc={doc} />;
```

The wrappers render empty tags on the server and attach properties and events after mount, so they are safe in Next.js and other SSR setups.

### Headless

```ts
import { createTessera } from '@tessera/core';

const tessera = createTessera(
  { features: { editor: { enabled: true, mentions: true } } },
  { plugins: { editor: () => import('@tessera/editor') } },
);
await tessera.ready;

const service = tessera.features.editor; // also in tessera.services as 'editor'
const handle = await service.create(document.querySelector('#host')!, { content: '# Hello', format: 'markdown' });
handle.getMarkdown();
```

`service.renderStatic(doc)` returns sanitized HTML and `service.toPlainText(doc)` returns text, both without loading Tiptap.

## Configuration

Options of the `editor` feature. `{ enabled: true }` alone is valid.

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `toolbar` | `Array<"undo" \| "redo" \| "heading" \| … (23 values) \| "\|">` | `["heading","bold","italic","underline","\|","bullet-list",…` | Toolbar buttons in order. Use `"\|"` for a separator; an empty array hides the toolbar. |
| `bubbleMenu` | `boolean` | `true` | Show a formatting menu next to a text selection. |
| `slashCommands` | `boolean` | `true` | Type `/` on an empty line to insert a block. |
| `markdownShortcuts` | `boolean` | `true` | Turn `# `, `- `, `[] ` and similar typed patterns into formatting. |
| `placeholder` | `string` | – | Text shown while the editor is empty. |
| `maxLength` | `integer` | – | Maximum number of characters. Typing and pasting stop at the limit. |
| `images` | `object` | `{"enabled":true}` |  |
| `images.maxBytes` | `number` | – | Largest accepted image. Defaults to the upload adapter limit. |
| `links` | `object` | `{"openOnClick":false,"autolink":true,"protocols":["http",…` |  |
| `links.openOnClick` | `boolean` | `false` | Follow a link when it is clicked. |
| `links.autolink` | `boolean` | `true` | Turn typed URLs into links. |
| `links.protocols` | `string[]` | `["http","https","mailto"]` | URL schemes that may be linked. |
| `mentions` | `object` | `{"enabled":false}` |  |
| `codeHighlight` | `boolean` | `true` | Syntax highlighting in code blocks (common languages, loaded on demand). |
| `tables` | `boolean` | `false` | Allow tables. |

<!-- config:end -->

## Element reference

### `<tessera-editor>`

| Attribute / property | Description |
|---|---|
| `value` | A document (`RichDoc`), or a string read as `format` |
| `format` | `json`, `html` or `markdown`, for a string `value` |
| `placeholder`, `label` | Placeholder text and the accessible name of the editing area |
| `readonly`, `disabled` | Turn editing off |
| `toolbar` | Comma-separated ids, e.g. `"bold,italic,\|,link"`; overrides the config |
| `name`, `required`, `maxlength` | Form behaviour; the submitted value is the document as JSON |
| `mentions` | `{ search(query) }` provider for `@` mentions (needs `mentions: true` in the config) |

Setting `value` again with the object the host already passed is ignored, so a framework that re-assigns the same prop on every render does not reset the user's edits. Pass a new object to replace the content.

| Event | Detail |
|---|---|
| `change` | `{ value: EditorValue }` 300 ms after the last edit |
| `input-commit` | `{ value: EditorValue }` when the editor loses focus |
| `upload-error` | `{ error: Error }` when an image could not be uploaded |

All events bubble and are composed.

| CSS part | Element |
|---|---|
| `toolbar`, `content`, `footer`, `bubble` | The toolbar, the editing area, the character count row and the bubble menu |

Custom properties: `--tessera-editor-min-height`, `--tessera-editor-max-height`, plus the shared `--tessera-*` design tokens.

### `<tessera-rich-text>`

`doc` (a `RichDoc`) is rendered as sanitized HTML. The `content` part styles the rendered document. It needs no instance.

## Headless API

`EditorHandle`: `getJSON()`, `getHTML()`, `getMarkdown()`, `getText()`, `setContent(content, format?)`, `focus()`, `setReadOnly()`, `setPlaceholder()`, `exec(command)`, `insertImage(file)`, `state` (a store with `characters`, `canUndo`, `active` marks, …), `destroy()`.

## Security

Pasted and imported HTML goes through DOMPurify with an allow-list of tags and attributes; links are limited to the protocols in `link.protocols` (`http`, `https` and `mailto` by default), and images to `http`, `https`, `blob:` and base64 `data:image/` for common raster formats. `renderStatic` builds its output from the validated document model, never from raw HTML.

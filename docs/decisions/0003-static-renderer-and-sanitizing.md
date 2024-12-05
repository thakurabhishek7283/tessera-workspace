# 3. Render stored documents with our own renderer and sanitize everything that enters

Status: accepted

## Context

Notes, card descriptions and the read-only `<tessera-rich-text>` have to show a document without loading the editor. Tiptap offers `generateHTML`, but it needs the whole extension list (which pulls in ProseMirror) and its output depends on which extensions are configured. Documents also arrive from storage, pasted HTML and imported files, so none of them can be trusted.

## Decision

- A document is plain JSON (`RichDoc`), checked by a zod schema with a depth and size limit.
- `renderStatic` walks the validated model and builds HTML from an allow-list of node and mark types. Attribute values are escaped; link and image addresses must pass `isSafeUrl` / `isSafeImage` (links: `http`, `https`, `mailto` by default; images: `http`, `https`, `blob:` and base64 raster `data:` images). It never sees raw HTML.
- HTML that enters the editor (paste, drop, `format: 'html'`) goes through DOMPurify with an allow-list first, and then through Tiptap's schema, which drops anything it does not know.
- DOMPurify needs a real DOM, so its tests run in the browser project instead of happy-dom.

## Consequences

- Showing a note costs a few hundred bytes of code, not the editor.
- The static output and the editor's output can differ in whitespace details; the tests compare the content model, not the markup.
- A new node type has to be added in three places (schema, editor extension, renderer); the engine tests round-trip a document through HTML and the render tests cover each node type.

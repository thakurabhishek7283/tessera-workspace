import { type CSSResult, css } from 'lit';

/** Typography for rich text, shared by the editing surface (`.tiptap`) and static display (`.prose`). */
export const proseStyles: CSSResult = css`
  .tiptap,
  .prose {
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  /* What ProseMirror needs to edit text reliably (its own stylesheet cannot reach a shadow root). */
  .tiptap {
    position: relative;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-variant-ligatures: none;
  }
  .tiptap pre {
    white-space: pre-wrap;
  }
  .tiptap .ProseMirror-gapcursor {
    display: none;
    pointer-events: none;
    position: absolute;
    margin: 0;
  }
  .tiptap .ProseMirror-gapcursor::after {
    content: '';
    display: block;
    position: absolute;
    top: -2px;
    width: 20px;
    border-top: 1px solid var(--tessera-color-text);
    animation: caret-blink 1.1s steps(2, start) infinite;
  }
  .tiptap.ProseMirror-focused .ProseMirror-gapcursor {
    display: block;
  }
  @keyframes caret-blink {
    to {
      visibility: hidden;
    }
  }
  .tiptap > :first-child,
  .prose > :first-child {
    margin-top: 0;
  }
  .tiptap > :last-child,
  .prose > :last-child {
    margin-bottom: 0;
  }
  .tiptap p,
  .prose p {
    margin: 0 0 0.75em;
  }
  .tiptap h1,
  .prose h1 {
    font-size: 1.5em;
    margin: 1em 0 0.5em;
    line-height: 1.25;
  }
  .tiptap h2,
  .prose h2 {
    font-size: 1.25em;
    margin: 1em 0 0.5em;
    line-height: 1.3;
  }
  .tiptap h3,
  .prose h3 {
    font-size: 1.1em;
    margin: 1em 0 0.5em;
    line-height: 1.35;
  }
  .tiptap ul,
  .tiptap ol,
  .prose ul,
  .prose ol {
    margin: 0 0 0.75em;
    padding-inline-start: 1.5em;
  }
  .tiptap li > p,
  .prose li > p {
    margin: 0;
  }
  .tiptap ul[data-type='taskList'],
  .prose ul[data-type='taskList'] {
    list-style: none;
    padding-inline-start: 0.25em;
  }
  .tiptap ul[data-type='taskList'] li,
  .prose ul[data-type='taskList'] li {
    display: flex;
    gap: 0.5em;
    align-items: flex-start;
  }
  .tiptap ul[data-type='taskList'] li > label,
  .prose ul[data-type='taskList'] li > input {
    flex: none;
    margin-top: 0.35em;
  }
  .tiptap ul[data-type='taskList'] li > div,
  .prose ul[data-type='taskList'] li > div {
    flex: 1;
  }
  .tiptap blockquote,
  .prose blockquote {
    margin: 0 0 0.75em;
    padding-inline-start: 1em;
    border-inline-start: 3px solid var(--tessera-color-border);
    color: var(--tessera-color-text-muted);
  }
  .tiptap code,
  .prose code {
    padding: 0.1em 0.35em;
    border-radius: var(--tessera-radius-sm);
    background: var(--tessera-color-surface-2);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
  }
  .tiptap pre,
  .prose pre {
    margin: 0 0 0.75em;
    padding: var(--tessera-space-3);
    border-radius: var(--tessera-radius-md);
    background: var(--tessera-color-surface-2);
    overflow: auto;
  }
  .tiptap pre code,
  .prose pre code {
    padding: 0;
    background: none;
    font-size: 0.875em;
  }
  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-built_in {
    color: var(--tessera-color-primary);
    font-weight: 600;
  }
  .hljs-string,
  .hljs-attr,
  .hljs-template-variable {
    color: var(--tessera-color-success);
  }
  .hljs-number,
  .hljs-literal,
  .hljs-symbol {
    color: var(--tessera-color-warning);
  }
  .hljs-comment,
  .hljs-quote {
    color: var(--tessera-color-text-muted);
    font-style: italic;
  }
  .hljs-title,
  .hljs-name,
  .hljs-type {
    color: var(--tessera-color-danger);
  }
  .tiptap mark,
  .prose mark {
    background: color-mix(in srgb, var(--tessera-color-warning) 28%, transparent);
    color: inherit;
    border-radius: 2px;
  }
  .tiptap a,
  .prose a {
    color: var(--tessera-color-primary);
    text-decoration: underline;
  }
  .tiptap hr,
  .prose hr {
    border: 0;
    border-top: 1px solid var(--tessera-color-border);
    margin: 1em 0;
  }
  .tiptap img,
  .prose img {
    max-width: 100%;
    height: auto;
    border-radius: var(--tessera-radius-md);
  }
  .tiptap table,
  .prose table {
    border-collapse: collapse;
    margin: 0 0 0.75em;
    width: 100%;
    table-layout: fixed;
  }
  .tiptap th,
  .tiptap td,
  .prose th,
  .prose td {
    border: 1px solid var(--tessera-color-border);
    padding: var(--tessera-space-1) var(--tessera-space-2);
    vertical-align: top;
    text-align: start;
  }
  .tiptap th,
  .prose th {
    background: var(--tessera-color-surface-2);
    font-weight: 600;
  }
  .tiptap .mention,
  .prose .mention {
    color: var(--tessera-color-primary);
    font-weight: 600;
  }
`;

import type { ReadonlyStore, UploadResult } from '@tessera/core';
import type { ToolbarItem } from './config.js';
import type { RichDoc } from './rich-doc.js';

export type ContentFormat = 'json' | 'html' | 'markdown';

/** A command without arguments: toggles a mark or block, or runs a history action. */
export type SimpleCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'highlight'
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'hr'
  | 'table'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'clear'
  | 'undo'
  | 'redo';

/** Commands that need a value. `href: null` removes the link under the selection. */
export type ParametricCommand =
  | { name: 'link'; href: string | null }
  | { name: 'image'; src: string; alt?: string };

export type EditorCommand = SimpleCommand | ParametricCommand;

export interface MentionItem {
  id: string;
  label: string;
  avatarUrl?: string;
}

export interface EditorOptions {
  /** Initial content. A string is read as `format`. */
  content?: RichDoc | string;
  /** How to read a string `content`. Default `json` for objects, `html` for strings. */
  format?: ContentFormat;
  readOnly?: boolean;
  placeholder?: string;
  /** Accessible name of the editing area. */
  label?: string;
  autofocus?: boolean | 'start' | 'end';
  /** Overrides the feature's toolbar (used by the element, not by the editor core). */
  toolbar?: ToolbarItem[];
  /** Characters allowed; overrides the feature's `maxLength`. */
  maxLength?: number;
  mentions?: { search(query: string): Promise<MentionItem[]> };
  /** Called 300 ms after the last edit, and on blur. */
  onChange?(value: EditorValue): void;
  onBlur?(): void;
  /** An image could not be uploaded (too large, wrong type or the adapter failed). */
  onUploadError?(error: Error): void;
  /** The slash menu's Image item was chosen; open a file picker and call `insertImage`. */
  onRequestImage?(): void;
}

export interface EditorValue {
  json: RichDoc;
  /** Plain text, one line per block. */
  text: string;
  isEmpty: boolean;
  characters: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the toolbar needs to know. Emitted on every transaction. */
export interface EditorState {
  /** Active marks and blocks, using command names: `bold`, `heading-2`, `bullet-list`, `link`, … */
  active: ReadonlySet<string>;
  canUndo: boolean;
  canRedo: boolean;
  characters: number;
  focused: boolean;
  /** Viewport rectangle of a non-empty selection, for the bubble menu. */
  selection: Rect | null;
}

/** An open `/` or `@` menu. The editor owns keyboard handling; the element only draws it. */
export interface SuggestState<T> {
  query: string;
  /** Viewport rectangle of the caret. */
  rect: Rect;
  items: T[];
  selected: number;
}

export interface SlashItem {
  id: string;
  /** i18n key suffix, resolved as `editor.block.<id>`. */
  icon: string;
  keywords: string[];
}

export interface EditorHandle {
  getJSON(): RichDoc;
  /** Sanitized HTML. */
  getHTML(): string;
  getMarkdown(): string;
  getText(): string;
  /** Replaces the content without adding an undo step. */
  setContent(content: RichDoc | string, format?: ContentFormat): void;
  focus(position?: 'start' | 'end'): void;
  setReadOnly(readOnly: boolean): void;
  setPlaceholder(text: string): void;
  exec(command: EditorCommand): void;
  /** Uploads `file` with the instance's upload adapter and inserts it as an image. */
  insertImage(file: Blob, name?: string): Promise<UploadResult | null>;
  readonly state: ReadonlyStore<EditorState>;
  readonly slash: ReadonlyStore<SuggestState<SlashItem> | null>;
  readonly mention: ReadonlyStore<SuggestState<MentionItem> | null>;
  /** Runs item `index` of the open slash or mention menu. */
  pick(menu: 'slash' | 'mention', index: number): void;
  /** Closes an open slash or mention menu. */
  dismiss(menu: 'slash' | 'mention'): void;
  destroy(): void;
}

export interface EditorService {
  /** Loads Tiptap on first use, then mounts an editor into `el`. */
  create(el: HTMLElement, opts?: EditorOptions): Promise<EditorHandle>;
  /** Sanitized HTML for read-only display, without loading the editor. */
  renderStatic(doc: RichDoc): string;
  /** Plain text for previews and search. */
  toPlainText(doc: RichDoc): string;
}

declare module '@tessera/core' {
  interface FeatureApiMap {
    editor: EditorService;
  }
  interface ServiceMap {
    editor: EditorService;
  }
}

import { wrapElement } from '@tessera-internal/react-wrap';
import { type RefObject, useEffect, useState } from 'react';
import type { TesseraEditorElement } from '../elements/editor.js';
import type { TesseraRichText } from '../elements/rich-text.js';
import type { RichDoc } from '../rich-doc.js';
import type { ContentFormat, EditorHandle, EditorValue, MentionItem } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrappers render empty tags that upgrade after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface EditorProps {
  value?: RichDoc | string | undefined;
  format?: ContentFormat | undefined;
  placeholder?: string | undefined;
  readonly?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Comma-separated toolbar ids, e.g. `"bold,italic,|,link"`. */
  toolbar?: string | undefined;
  name?: string | undefined;
  required?: boolean | undefined;
  maxlength?: number | undefined;
  label?: string | undefined;
  mentions?: { search(query: string): Promise<MentionItem[]> } | undefined;
  /** Fires 300 ms after the last edit: read `event.detail.value`. */
  onChange?: ((event: CustomEvent<{ value: EditorValue }>) => void) | undefined;
  onInputCommit?: ((event: CustomEvent<{ value: EditorValue }>) => void) | undefined;
  onUploadError?: ((event: CustomEvent<{ error: Error }>) => void) | undefined;
}

/** `<tessera-editor>` for React. The `ref` is the element (use `useEditor` for the handle). */
export const Editor = wrapElement<TesseraEditorElement, EditorProps>({
  tag: 'tessera-editor',
  properties: ['value', 'format', 'mentions'],
  attributes: {
    placeholder: 'placeholder',
    readonly: 'readonly',
    disabled: 'disabled',
    toolbar: 'toolbar',
    name: 'name',
    required: 'required',
    maxlength: 'maxlength',
    label: 'label',
  },
  events: { onChange: 'change', onInputCommit: 'input-commit', onUploadError: 'upload-error' },
});

export interface RichTextProps {
  doc?: RichDoc | undefined;
}

/** Read-only rendering of a document. Does not load the editor. */
export const RichText = wrapElement<TesseraRichText, RichTextProps>({
  tag: 'tessera-rich-text',
  properties: ['doc'],
  events: {},
});

/**
 * The editor handle behind an `<Editor>` once Tiptap has loaded.
 *
 * @example
 * const ref = useRef<TesseraEditorElement>(null);
 * const editor = useEditor(ref);
 * <button onClick={() => editor?.exec('bold')}>Bold</button>
 */
export function useEditor(ref: RefObject<TesseraEditorElement | null>): EditorHandle | undefined {
  const [handle, setHandle] = useState<EditorHandle>();
  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    void customElements.whenDefined('tessera-editor').then(() => {
      if (!cancelled) void el.editorReady.then((h) => !cancelled && setHandle(h));
    });
    return () => {
      cancelled = true;
      setHandle(undefined);
    };
  }, [ref]);
  return handle;
}

export type { TesseraEditorElement, TesseraRichText };

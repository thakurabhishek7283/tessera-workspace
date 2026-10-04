import { createStore, type TesseraContext, TesseraError } from '@tessera-kit/core';
import { type AnyExtension, Editor, Extension } from '@tiptap/core';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Mention } from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Markdown } from '@tiptap/markdown';
import { PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Suggestion } from '@tiptap/suggestion';
import type { EditorConfigValue } from '../config.js';
import { isSafeImage, isSafeUrl } from '../render.js';
import {
  compactRichDoc,
  isRichDocEmpty,
  type RichDoc,
  richDocIssue,
  toPlainText,
} from '../rich-doc.js';
import { sanitizeHtml } from '../sanitize.js';
import type {
  ContentFormat,
  EditorCommand,
  EditorHandle,
  EditorOptions,
  EditorState,
  EditorValue,
  MentionItem,
  Rect,
  SlashItem,
} from '../types.js';
import { filterSlashItems, SLASH_ITEMS } from './slash.js';
import { createSuggestController } from './suggest.js';

const CHANGE_DEBOUNCE_MS = 300;

interface Prepared {
  content: Record<string, unknown> | string;
  contentType: ContentFormat;
}

function prepareContent(
  content: RichDoc | string | undefined,
  format: ContentFormat | undefined,
  config: EditorConfigValue,
): Prepared {
  if (content === undefined) return { content: '', contentType: 'html' };
  if (typeof content === 'string') {
    const f = format ?? 'html';
    if (f === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new TesseraError('VALIDATION', 'Editor content is not valid JSON');
      }
      return prepareContent(parsed as RichDoc, 'json', config);
    }
    if (f === 'markdown') return { content, contentType: 'markdown' };
    return {
      content: sanitizeHtml(content, {
        protocols: config.links.protocols,
        images: config.images.enabled,
      }),
      contentType: 'html',
    };
  }
  const issue = richDocIssue(content);
  if (issue)
    throw new TesseraError('VALIDATION', `Editor content is not a valid document: ${issue}`);
  return { content: content as unknown as Record<string, unknown>, contentType: 'json' };
}

const uploadError = (code: 'UPLOAD_TOO_LARGE' | 'VALIDATION', message: string): TesseraError =>
  new TesseraError(code, message);

interface EngineArgs {
  ctx: TesseraContext;
  config: EditorConfigValue;
  el: HTMLElement;
  opts: EditorOptions;
}

/** Builds the Tiptap editor and wraps it in the {@link EditorHandle} contract. */
export async function createEditorEngine({
  ctx,
  config,
  el,
  opts,
}: EngineArgs): Promise<EditorHandle> {
  const maxLength = opts.maxLength ?? config.maxLength;
  let placeholder = opts.placeholder ?? config.placeholder ?? '';
  const slashKey = new PluginKey('tesseraSlash');
  const mentionKey = new PluginKey('tesseraMention');
  const slash = createSuggestController<SlashItem>(slashKey);
  const mention = createSuggestController<MentionItem>(mentionKey);
  const imagesOn = config.images.enabled;
  const protocols = config.links.protocols;

  const slashItems = SLASH_ITEMS.filter(
    (item) => (item.id !== 'image' || imagesOn) && (item.id !== 'table' || config.tables),
  );

  // Heavy, optional pieces are imported only when the config asks for them.
  const [lowlightParts, tableParts] = await Promise.all([
    config.codeHighlight
      ? Promise.all([import('@tiptap/extension-code-block-lowlight'), import('lowlight')])
      : null,
    config.tables ? import('@tiptap/extension-table') : null,
  ]);

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: lowlightParts ? false : {},
      link: {
        openOnClick: config.links.openOnClick,
        autolink: config.links.autolink,
        defaultProtocol: 'https',
        isAllowedUri: (url: string) => isSafeUrl(url, protocols),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    Highlight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: () => placeholder }),
    CharacterCount.configure(maxLength ? { limit: maxLength } : {}),
    Markdown,
  ];
  if (config.markdownShortcuts) extensions.push(Typography);
  if (imagesOn) extensions.push(Image.configure({ inline: false, allowBase64: true }));
  if (lowlightParts) {
    const [{ CodeBlockLowlight }, { common, createLowlight }] = lowlightParts;
    extensions.push(CodeBlockLowlight.configure({ lowlight: createLowlight(common) }));
  }
  if (tableParts) extensions.push(tableParts.TableKit.configure({ table: { resizable: false } }));

  if (config.slashCommands) {
    extensions.push(
      Extension.create({
        name: 'tesseraSlash',
        addProseMirrorPlugins() {
          return [
            Suggestion<SlashItem, SlashItem>({
              editor: this.editor,
              pluginKey: slashKey,
              char: '/',
              startOfLine: true,
              items: ({ query }) => filterSlashItems(slashItems, query),
              allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
              command: ({ editor, range, props }) => {
                editor.chain().focus().deleteRange(range).run();
                // Images need a file, so the host decides how to ask for one.
                if (props.id === 'image') opts.onRequestImage?.();
                else run(props.id as EditorCommand);
              },
              render: slash.render,
            }),
          ];
        },
      }),
    );
  }

  const search = opts.mentions?.search;
  if (config.mentions.enabled && search) {
    extensions.push(
      Mention.configure({
        suggestion: {
          pluginKey: mentionKey,
          char: '@',
          items: async ({ query }) => {
            try {
              return await search(query);
            } catch (error) {
              ctx.logger.warn('mention search failed', error);
              return [];
            }
          },
          render: mention.render,
        },
      }),
    );
  }

  const first = prepareContent(opts.content, opts.format, config);

  const editor = new Editor({
    element: el,
    extensions,
    content: first.content,
    contentType: first.contentType,
    editable: !opts.readOnly,
    autofocus: opts.autofocus ?? false,
    enableInputRules: config.markdownShortcuts,
    enablePasteRules: config.markdownShortcuts,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        ...(opts.label ? { 'aria-label': opts.label } : {}),
      },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!imagesOn || files.length === 0) return false;
        event.preventDefault();
        for (const file of files) void insertImage(file, file.name);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (moved || !imagesOn || files.length === 0) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) editor.commands.setTextSelection(at.pos);
        for (const file of files) void insertImage(file, file.name);
        return true;
      },
    },
  });

  // ---------- state ----------
  const readState = (): EditorState => {
    const active = new Set<string>();
    const mark = (name: string, command = name): void => {
      if (editor.isActive(name)) active.add(command);
    };
    mark('bold');
    mark('italic');
    mark('underline');
    mark('strike');
    mark('code');
    mark('highlight');
    mark('link');
    mark('blockquote');
    mark('codeBlock', 'code-block');
    mark('bulletList', 'bullet-list');
    mark('orderedList', 'ordered-list');
    mark('taskList', 'task-list');
    for (const level of [1, 2, 3])
      if (editor.isActive('heading', { level })) active.add(`heading-${level}`);
    if (editor.isActive('paragraph')) active.add('paragraph');
    for (const align of ['left', 'center', 'right'])
      if (editor.isActive({ textAlign: align })) active.add(`align-${align}`);

    const { from, to, empty } = editor.state.selection;
    let selection: Rect | null = null;
    if (!empty && editor.isFocused && editor.isEditable) {
      const a = editor.view.coordsAtPos(from);
      const b = editor.view.coordsAtPos(to);
      const left = Math.min(a.left, b.left);
      const top = Math.min(a.top, b.top);
      selection = {
        x: left,
        y: top,
        width: Math.max(a.right, b.right) - left,
        height: Math.max(a.bottom, b.bottom) - top,
      };
    }
    return {
      active,
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      characters: editor.storage.characterCount.characters(),
      focused: editor.isFocused,
      selection,
    };
  };

  const state = createStore<EditorState>(readState());
  const sameState = (a: EditorState, b: EditorState): boolean =>
    a.canUndo === b.canUndo &&
    a.canRedo === b.canRedo &&
    a.characters === b.characters &&
    a.focused === b.focused &&
    a.active.size === b.active.size &&
    [...a.active].every((x) => b.active.has(x)) &&
    (a.selection === b.selection ||
      (a.selection !== null &&
        b.selection !== null &&
        a.selection.x === b.selection.x &&
        a.selection.y === b.selection.y &&
        a.selection.width === b.selection.width));
  const refresh = (): void => {
    const next = readState();
    if (!sameState(state.get(), next)) state.set(next);
  };

  // ---------- value + change notifications ----------
  const currentJson = (): RichDoc => compactRichDoc(editor.getJSON() as RichDoc);
  const value = (): EditorValue => {
    const json = currentJson();
    return {
      json,
      text: toPlainText(json),
      isEmpty: isRichDocEmpty(json),
      characters: editor.storage.characterCount.characters(),
    };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    opts.onChange?.(value());
  };

  editor.on('transaction', ({ transaction }) => {
    refresh();
    if (transaction.docChanged && transaction.getMeta('tesseraSilent') !== true) {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(flush, CHANGE_DEBOUNCE_MS);
    }
  });
  editor.on('focus', refresh);
  editor.on('blur', () => {
    refresh();
    flush();
    opts.onBlur?.();
  });

  // ---------- images ----------
  const fail = (error: Error): null => {
    ctx.logger.warn('image upload failed', error);
    opts.onUploadError?.(error);
    return null;
  };

  async function insertImage(file: Blob, name?: string) {
    if (!imagesOn) return fail(uploadError('VALIDATION', 'Images are turned off'));
    if (!file.type.startsWith('image/'))
      return fail(uploadError('VALIDATION', 'Only images can be inserted'));
    const uploads = ctx.uploads();
    const limit = config.images.maxBytes ?? uploads.maxBytes;
    if (file.size > limit) {
      return fail(
        uploadError('UPLOAD_TOO_LARGE', `The image is larger than ${Math.round(limit / 1024)} KB`),
      );
    }
    try {
      const result = await uploads.upload(file, name ? { name } : {});
      if (!editor.isDestroyed) {
        editor
          .chain()
          .focus()
          .setImage({ src: result.url, alt: name ?? '' })
          .run();
      }
      return result;
    } catch (error) {
      return fail(TesseraError.from(error, 'UNKNOWN'));
    }
  }

  // ---------- commands ----------
  function run(command: EditorCommand): void {
    const chain = editor.chain().focus();
    if (typeof command === 'object') {
      if (command.name === 'link') {
        if (command.href === null) {
          chain.extendMarkRange('link').unsetLink().run();
          return;
        }
        if (!isSafeUrl(command.href, protocols)) {
          throw new TesseraError(
            'VALIDATION',
            `Links to "${command.href.split(':')[0]}:" are not allowed`,
          );
        }
        if (editor.state.selection.empty && !editor.isActive('link')) {
          chain
            .insertContent({
              type: 'text',
              text: command.href,
              marks: [{ type: 'link', attrs: { href: command.href } }],
            })
            .run();
        } else {
          chain.extendMarkRange('link').setLink({ href: command.href }).run();
        }
        return;
      }
      if (!imagesOn || !isSafeImage(command.src)) {
        throw new TesseraError('VALIDATION', 'That image cannot be inserted');
      }
      chain.setImage({ src: command.src, alt: command.alt ?? '' }).run();
      return;
    }
    switch (command) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'code':
        chain.toggleCode().run();
        break;
      case 'highlight':
        chain.toggleHighlight().run();
        break;
      case 'paragraph':
        chain.setParagraph().run();
        break;
      case 'heading-1':
        chain.toggleHeading({ level: 1 }).run();
        break;
      case 'heading-2':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'heading-3':
        chain.toggleHeading({ level: 3 }).run();
        break;
      case 'bullet-list':
        chain.toggleBulletList().run();
        break;
      case 'ordered-list':
        chain.toggleOrderedList().run();
        break;
      case 'task-list':
        chain.toggleTaskList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'code-block':
        chain.toggleCodeBlock().run();
        break;
      case 'hr':
        chain.setHorizontalRule().run();
        break;
      case 'table':
        if (config.tables) chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'align-left':
        chain.setTextAlign('left').run();
        break;
      case 'align-center':
        chain.setTextAlign('center').run();
        break;
      case 'align-right':
        chain.setTextAlign('right').run();
        break;
      case 'clear':
        chain.clearNodes().unsetAllMarks().run();
        break;
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
    }
  }

  return {
    getJSON: currentJson,
    getHTML: () => sanitizeHtml(editor.getHTML(), { protocols, images: imagesOn }),
    getMarkdown: () => editor.getMarkdown(),
    getText: () => toPlainText(currentJson()),
    setContent(content, format) {
      const next = prepareContent(content, format, config);
      editor
        .chain()
        .setMeta('addToHistory', false)
        .setMeta('tesseraSilent', true)
        .setContent(next.content as never, { contentType: next.contentType, emitUpdate: false })
        .run();
    },
    focus(position) {
      editor.commands.focus(position ?? null);
    },
    setReadOnly(readOnly) {
      editor.setEditable(!readOnly);
      refresh();
    },
    setPlaceholder(text) {
      placeholder = text;
      editor.view.dispatch(editor.state.tr.setMeta('tesseraSilent', true));
    },
    exec: run,
    insertImage,
    state,
    slash: slash.store,
    mention: mention.store,
    pick(menu, index) {
      (menu === 'slash' ? slash : mention).pick(index);
    },
    dismiss(menu) {
      (menu === 'slash' ? slash : mention).dismiss(editor);
    },
    destroy() {
      flush();
      editor.destroy();
    },
  };

  function imageFiles(list: FileList | undefined | null): File[] {
    return [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
  }
}

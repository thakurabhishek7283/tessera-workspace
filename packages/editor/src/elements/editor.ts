import { type ReadonlyStore, TesseraError } from '@tessera/core';
import { baseStyles, focusRing, TesseraElement, toast } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import {
  DEFAULT_TOOLBAR,
  type EditorConfigValue,
  TOOLBAR_ITEMS,
  type ToolbarItem,
} from '../config.js';
import { isRichDocEmpty, type RichDoc, richDocIssue } from '../rich-doc.js';
import type {
  ContentFormat,
  EditorHandle,
  EditorService,
  EditorState,
  EditorValue,
  MentionItem,
  SimpleCommand,
  SlashItem,
  SuggestState,
} from '../types.js';
import { proseStyles } from './styles.js';

const COMMAND_ICON: Record<string, string> = {
  undo: 'undo',
  redo: 'redo',
  paragraph: 'editor-paragraph',
  bold: 'editor-bold',
  italic: 'editor-italic',
  underline: 'editor-underline',
  strike: 'editor-strike',
  code: 'editor-code',
  highlight: 'editor-highlight',
  'bullet-list': 'editor-bullet-list',
  'ordered-list': 'editor-ordered-list',
  'task-list': 'editor-task-list',
  blockquote: 'editor-quote',
  'code-block': 'editor-code',
  hr: 'minus',
  link: 'link',
  image: 'image',
  table: 'columns',
  'align-left': 'editor-align-left',
  'align-center': 'editor-align-center',
  'align-right': 'editor-align-right',
  clear: 'editor-clear',
};

const BUBBLE: ReadonlyArray<SimpleCommand | 'link'> = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
];

const isToolbarItem = (v: string): v is ToolbarItem =>
  v === '|' || (TOOLBAR_ITEMS as readonly string[]).includes(v);

let uid = 0;

/**
 * `<tessera-editor>`: a rich-text editor with a toolbar, bubble menu, `/` block menu and
 * Markdown shortcuts. It takes part in forms (value = the document as JSON).
 *
 * @fires change - `{ value: EditorValue }`, 300 ms after the last edit
 * @fires input-commit - `{ value: EditorValue }` when the editor loses focus
 * @fires upload-error - `{ error: Error }` when a pasted, dropped or picked image fails
 * @csspart toolbar @csspart content @csspart footer @csspart bubble
 */
export class TesseraEditorElement extends TesseraElement {
  static formAssociated = true;
  static override properties: PropertyDeclarations = {
    value: { attribute: 'value' },
    format: {},
    placeholder: {},
    readonly: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    toolbar: { attribute: 'toolbar' },
    name: {},
    required: { type: Boolean, reflect: true },
    maxlength: { type: Number },
    label: {},
    mentions: { attribute: false },
    linkOpen: { state: true },
    linkError: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    proseStyles,
    css`
      :host {
        display: block;
      }
      .frame {
        position: relative;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-bg);
      }
      .frame:focus-within {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      :host([readonly]) .frame,
      :host([disabled]) .frame {
        background: var(--tessera-color-surface);
      }
      :host([disabled]) {
        opacity: 0.6;
      }
      [role='toolbar'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
        padding: var(--tessera-space-1);
        border-bottom: 1px solid var(--tessera-color-border);
      }
      .tb {
        all: unset;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--tessera-radius-sm);
        color: var(--tessera-color-text);
        cursor: pointer;
      }
      .tb:hover:not(:disabled) {
        background: var(--tessera-color-surface-2);
      }
      .tb[aria-pressed='true'] {
        background: var(--tessera-color-primary);
        color: var(--tessera-color-primary-contrast);
      }
      .tb:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .tb:focus-visible,
      select.tb-select:focus-visible,
      .menu-item:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: -2px;
      }
      select.tb-select {
        height: 32px;
        padding: 0 var(--tessera-space-2);
        border: 1px solid transparent;
        border-radius: var(--tessera-radius-sm);
        background: transparent;
        color: var(--tessera-color-text);
        font: inherit;
        font-size: var(--tessera-font-size-sm);
      }
      [role='separator'] {
        width: 1px;
        height: 20px;
        margin: 0 var(--tessera-space-1);
        background: var(--tessera-color-border);
      }
      .link-form {
        display: flex;
        gap: var(--tessera-space-2);
        align-items: center;
        padding: var(--tessera-space-2);
        border-bottom: 1px solid var(--tessera-color-border);
        background: var(--tessera-color-surface);
      }
      .link-form input {
        flex: 1;
        min-width: 0;
        min-height: 32px;
        padding: 0 var(--tessera-space-2);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-sm);
        background: var(--tessera-color-bg);
        color: var(--tessera-color-text);
        font: inherit;
      }
      .link-form .error {
        color: var(--tessera-color-danger);
        font-size: var(--tessera-font-size-sm);
      }
      .content {
        min-height: var(--tessera-editor-min-height, 8rem);
        max-height: var(--tessera-editor-max-height, none);
        padding: var(--tessera-space-3);
        overflow: auto;
        cursor: text;
      }
      .content .tiptap {
        outline: none;
        min-height: inherit;
      }
      .tiptap p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        float: left;
        height: 0;
        color: var(--tessera-color-text-muted);
        pointer-events: none;
      }
      .tiptap img.ProseMirror-selectednode {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      footer {
        display: flex;
        justify-content: flex-end;
        padding: var(--tessera-space-1) var(--tessera-space-3);
        border-top: 1px solid var(--tessera-color-border);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-xs);
      }
      footer.over {
        color: var(--tessera-color-danger);
      }
      .float {
        position: fixed;
        z-index: var(--tessera-z-popover);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        box-shadow: var(--tessera-shadow-md);
      }
      .bubble {
        display: flex;
        gap: 2px;
        padding: 2px;
        transform: translate(-50%, calc(-100% - 8px));
      }
      .bubble.below {
        transform: translate(-50%, 8px);
      }
      .menu {
        min-width: 14rem;
        max-height: 16rem;
        overflow: auto;
        padding: var(--tessera-space-1);
      }
      .menu-item {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-2) var(--tessera-space-3);
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
      }
      .menu-item[aria-selected='true'] {
        background: var(--tessera-color-surface-2);
      }
      .menu-empty {
        padding: var(--tessera-space-2) var(--tessera-space-3);
        color: var(--tessera-color-text-muted);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `,
  ];

  protected readonly featureId: string | null = 'editor';

  /** Initial/controlled content: a document, or a string read as `format`. */
  value: RichDoc | string | undefined;
  format: ContentFormat | undefined;
  placeholder: string | undefined;
  readonly = false;
  disabled = false;
  /** Comma-separated toolbar ids, e.g. `"bold,italic,|,link"`. Overrides the feature config. */
  toolbar: string | undefined;
  name = '';
  required = false;
  maxlength: number | undefined;
  /** Accessible name for the editing area. */
  label: string | undefined;
  /** Enables `@` mentions when the feature config turns them on. */
  mentions: { search(query: string): Promise<MentionItem[]> } | undefined;
  linkOpen = false;
  linkError = '';

  readonly #internals: ElementInternals = this.attachInternals();
  readonly #id = `tessera-editor-${++uid}`;
  #handle: EditorHandle | undefined;
  #mounting: Promise<void> | undefined;
  #ready: Promise<EditorHandle> | undefined;
  #resolveReady: ((h: EditorHandle) => void) | undefined;
  /** Last document we produced ourselves, so a `value` echo does not reset the editor. */
  #own: RichDoc | undefined;
  #initial: RichDoc | string | undefined;
  #valueValue: EditorValue | undefined;
  #offs: Array<() => void> = [];
  #state: EditorState | undefined;

  /** Resolves with the editor once it is mounted. Useful for tests and imperative control. */
  get editorReady(): Promise<EditorHandle> {
    this.#ready ??= new Promise((resolve) => {
      this.#resolveReady = resolve;
      if (this.#handle) resolve(this.#handle);
    });
    return this.#ready;
  }

  /** The mounted editor, or `undefined` before it loaded or while the feature is disabled. */
  get editor(): EditorHandle | undefined {
    return this.#handle;
  }

  override focus(options?: FocusOptions): void {
    if (this.#handle) this.#handle.focus('end');
    else super.focus(options);
  }

  // ---------- form association ----------
  formResetCallback(): void {
    if (this.#handle && this.#initial !== undefined) this.#handle.setContent(this.#initial);
    else if (this.#handle)
      this.#handle.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
    this.#syncForm();
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state !== 'string') return;
    try {
      this.#handle?.setContent(JSON.parse(state) as RichDoc);
    } catch {
      // A state from an older schema is simply ignored.
    }
  }

  get form(): HTMLFormElement | null {
    return this.#internals.form;
  }
  get validity(): ValidityState {
    return this.#internals.validity;
  }
  get validationMessage(): string {
    return this.#internals.validationMessage;
  }
  checkValidity(): boolean {
    return this.#internals.checkValidity();
  }
  reportValidity(): boolean {
    return this.#internals.reportValidity();
  }

  // ---------- lifecycle ----------
  override connectedCallback(): void {
    super.connectedCallback();
    // After a disconnect the handle was destroyed; render again so the editor mounts anew.
    if (this.hasUpdated) this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unmount();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated?.(changed);
    const host = this.renderRoot.querySelector<HTMLElement>('.content');
    if (!host) {
      this.#unmount();
      return;
    }
    if (!this.#handle && !this.#mounting) {
      this.#mounting = this.#mount(host).finally(() => {
        this.#mounting = undefined;
      });
      return;
    }
    const handle = this.#handle;
    if (!handle) return;
    if (changed.has('value') && this.value !== undefined && this.value !== this.#own) {
      handle.setContent(this.value, this.format);
      this.#syncForm();
    }
    if (changed.has('readonly') || changed.has('disabled'))
      handle.setReadOnly(this.readonly || this.disabled);
    if (changed.has('placeholder')) handle.setPlaceholder(this.#placeholder);
    this.#syncAria();
  }

  get #config(): EditorConfigValue | undefined {
    return this.ctx.featureConfig<EditorConfigValue>('editor');
  }

  get #placeholder(): string {
    return this.placeholder ?? this.#config?.placeholder ?? '';
  }

  get #maxLength(): number | undefined {
    return this.maxlength ?? this.#config?.maxLength;
  }

  get #toolbarItems(): ToolbarItem[] {
    if (this.toolbar !== undefined) {
      return this.toolbar
        .split(',')
        .map((s) => s.trim())
        .filter(isToolbarItem);
    }
    return this.#config?.toolbar ?? DEFAULT_TOOLBAR;
  }

  async #mount(host: HTMLElement): Promise<void> {
    const service: EditorService | undefined = this.ctx.services.get('editor');
    if (!service) return;
    const initial = this.value;
    if (typeof initial === 'object' && initial !== null) {
      const issue = richDocIssue(initial);
      if (issue) {
        this.ctx.logger.warn(`ignoring invalid editor value: ${issue}`);
      }
    }
    let handle: EditorHandle;
    try {
      handle = await service.create(host, {
        ...(this.value !== undefined ? { content: this.value } : {}),
        ...(this.format ? { format: this.format } : {}),
        readOnly: this.readonly || this.disabled,
        placeholder: this.#placeholder,
        label: this.label ?? this.t('editor.label'),
        ...(this.maxlength ? { maxLength: this.maxlength } : {}),
        ...(this.mentions ? { mentions: this.mentions } : {}),
        onChange: (v) => this.#onChange(v),
        onBlur: () => {
          if (this.#valueValue) this.emit('input-commit', { value: this.#valueValue });
        },
        onUploadError: (error) => {
          this.emit('upload-error', { error });
          toast(this.ctx, {
            kind: 'error',
            message: this.t('editor.error.upload', { message: error.message }),
          });
        },
        onRequestImage: () => this.#pickImage(),
      });
    } catch (error) {
      const wrapped = TesseraError.from(error, 'UNKNOWN');
      this.ctx.logger.error('could not start the editor', wrapped);
      this.ctx.bus.emit('tessera:error', wrapped);
      return;
    }
    // The element may have been removed or switched off while Tiptap was loading.
    if (!this.isConnected || !this.renderRoot.querySelector('.content')) {
      handle.destroy();
      return;
    }
    this.#handle = handle;
    this.#initial = this.value ?? handle.getJSON();
    this.#state = handle.state.get();
    for (const store of [handle.state, handle.slash, handle.mention] as Array<
      ReadonlyStore<unknown>
    >) {
      this.#offs.push(store.subscribe(() => this.requestUpdate()));
    }
    this.#syncForm();
    this.#resolveReady?.(handle);
    this.#ready ??= Promise.resolve(handle);
    this.requestUpdate();
  }

  #unmount(): void {
    for (const off of this.#offs.splice(0)) off();
    this.#handle?.destroy();
    this.#handle = undefined;
    this.#ready = undefined;
    this.#resolveReady = undefined;
    this.#state = undefined;
  }

  #onChange(value: EditorValue): void {
    this.#own = value.json;
    this.#valueValue = value;
    this.value = value.json;
    this.#syncForm();
    this.emit('change', { value });
  }

  #syncForm(): void {
    const handle = this.#handle;
    if (!handle) return;
    const json = handle.getJSON();
    const characters = handle.state.get().characters;
    this.#internals.setFormValue(JSON.stringify(json));
    const max = this.#maxLength;
    if (this.required && isRichDocEmpty(json)) {
      this.#internals.setValidity({ valueMissing: true }, this.t('editor.error.required'));
    } else if (max !== undefined && characters > max) {
      this.#internals.setValidity({ tooLong: true }, this.t('editor.error.tooLong', { max }));
    } else {
      this.#internals.setValidity({});
    }
  }

  #syncAria(): void {
    const area = this.renderRoot.querySelector<HTMLElement>('.tiptap');
    if (!area) return;
    const slash = this.#handle?.slash.get();
    const mention = this.#handle?.mention.get();
    const open = slash ?? mention;
    const kind = slash ? 'slash' : 'mention';
    if (open) {
      area.setAttribute('aria-controls', `${this.#id}-${kind}`);
      area.setAttribute('aria-activedescendant', `${this.#id}-${kind}-${open.selected}`);
    } else {
      area.removeAttribute('aria-controls');
      area.removeAttribute('aria-activedescendant');
    }
    area.setAttribute('aria-readonly', String(this.readonly || this.disabled));
  }

  // ---------- actions ----------
  #exec(command: SimpleCommand): void {
    this.#handle?.exec(command);
  }

  #toggleLink(): void {
    const handle = this.#handle;
    if (!handle) return;
    if (handle.state.get().active.has('link')) {
      handle.exec({ name: 'link', href: null });
      return;
    }
    this.linkError = '';
    this.linkOpen = !this.linkOpen;
    if (this.linkOpen) {
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLInputElement>('.link-form input')?.focus(),
      );
    }
  }

  #submitLink = (event: Event): void => {
    event.preventDefault();
    const input = this.renderRoot.querySelector<HTMLInputElement>('.link-form input');
    const href = input?.value.trim() ?? '';
    if (!href) return;
    try {
      this.#handle?.exec({ name: 'link', href });
      this.linkOpen = false;
      this.linkError = '';
      if (input) input.value = '';
    } catch {
      this.linkError = this.t('editor.link.invalid');
    }
  };

  #pickImage(): void {
    this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click();
  }

  #onFile = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    for (const file of input.files ?? []) void this.#handle?.insertImage(file, file.name);
    input.value = '';
  };

  #onToolbarKey = (event: KeyboardEvent): void => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = [
      ...this.renderRoot.querySelectorAll<HTMLElement>(
        '[role=toolbar] button:not(:disabled), [role=toolbar] select',
      ),
    ];
    const at = items.indexOf(event.composedPath()[0] as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (at + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    for (const [i, el] of items.entries()) el.tabIndex = i === next ? 0 : -1;
    items[next]?.focus();
  };

  // ---------- rendering ----------
  /** Keeps the editor's selection when a toolbar button is pressed. */
  static #keepFocus = (event: Event): void => event.preventDefault();

  #button(
    command: string,
    pressed: boolean,
    onClick: () => void,
    disabled = false,
    tab = false,
  ): unknown {
    const label = this.t(`editor.cmd.${command}`);
    return html`<button
      type="button"
      class="tb"
      part="button"
      title=${label}
      aria-label=${label}
      aria-pressed=${pressed ? 'true' : 'false'}
      tabindex=${tab ? '0' : '-1'}
      ?disabled=${disabled}
      @mousedown=${TesseraEditorElement.#keepFocus}
      @click=${onClick}
    >
      <tessera-icon name=${COMMAND_ICON[command] ?? command}></tessera-icon>
    </button>`;
  }

  #renderToolbar(state: EditorState): unknown {
    const config = this.#config;
    const items = this.#toolbarItems.filter(
      (item) =>
        (item !== 'image' || config?.images.enabled !== false) &&
        (item !== 'table' || config?.tables),
    );
    if (items.length === 0 || this.readonly || this.disabled) return nothing;
    let first = true;
    const tab = (): boolean => {
      const t = first;
      first = false;
      return t;
    };
    return html`<div
        role="toolbar"
        part="toolbar"
        aria-label=${this.t('editor.toolbar')}
        @keydown=${this.#onToolbarKey}
      >
        ${items.map((item) => {
          if (item === '|') return html`<span role="separator" aria-orientation="vertical"></span>`;
          if (item === 'heading') {
            const current = [1, 2, 3].find((l) => state.active.has(`heading-${l}`));
            return html`<select
              class="tb-select"
              aria-label=${this.t('editor.cmd.heading')}
              tabindex=${tab() ? '0' : '-1'}
              .value=${current ? String(current) : 'paragraph'}
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                this.#exec(v === 'paragraph' ? 'paragraph' : (`heading-${v}` as SimpleCommand));
              }}
            >
              <option value="paragraph">${this.t('editor.heading.paragraph')}</option>
              ${[1, 2, 3].map((l) => html`<option value=${l}>${this.t(`editor.heading.${l}`)}</option>`)}
            </select>`;
          }
          if (item === 'link')
            return this.#button(
              'link',
              state.active.has('link'),
              () => this.#toggleLink(),
              false,
              tab(),
            );
          if (item === 'image')
            return this.#button('image', false, () => this.#pickImage(), false, tab());
          const cmd = item as SimpleCommand;
          return this.#button(
            cmd,
            state.active.has(cmd),
            () => this.#exec(cmd),
            (cmd === 'undo' && !state.canUndo) || (cmd === 'redo' && !state.canRedo),
            tab(),
          );
        })}
      </div>
      ${
        this.linkOpen
          ? html`<form class="link-form" @submit=${this.#submitLink}>
              <input
                type="url"
                aria-label=${this.t('editor.link.title')}
                placeholder=${this.t('editor.link.placeholder')}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    this.linkOpen = false;
                  }
                }}
              />
              <tessera-button size="sm" variant="primary" @click=${this.#submitLink}>${this.t('editor.link.apply')}</tessera-button>
              ${this.linkError ? html`<span class="error" role="alert">${this.linkError}</span>` : nothing}
            </form>`
          : nothing
      }`;
  }

  #renderBubble(state: EditorState): unknown {
    const rect = state.selection;
    if (!rect || this.#config?.bubbleMenu === false || this.readonly || this.disabled)
      return nothing;
    // Above the selection, unless that would cover the toolbar: then below it.
    const top = this.renderRoot.querySelector('.content')?.getBoundingClientRect().top ?? 0;
    const above = rect.y - 48 >= top;
    return html`<div
      class=${classMap({ float: true, bubble: true, below: !above })}
      part="bubble"
      role="toolbar"
      aria-label=${this.t('editor.toolbar')}
      style=${`left:${Math.round(rect.x + rect.width / 2)}px;top:${Math.round(above ? rect.y : rect.y + rect.height)}px`}
    >
      ${BUBBLE.map((c) =>
        c === 'link'
          ? this.#button('link', state.active.has('link'), () => this.#toggleLink())
          : this.#button(c, state.active.has(c), () => this.#exec(c)),
      )}
    </div>`;
  }

  #renderSlash(menu: SuggestState<SlashItem> | null | undefined): unknown {
    if (!menu) return nothing;
    return html`<div
      class="float menu"
      role="listbox"
      id=${`${this.#id}-slash`}
      aria-label=${this.t('editor.slash.label')}
      style=${`left:${Math.round(menu.rect.x)}px;top:${Math.round(menu.rect.y + menu.rect.height + 4)}px`}
    >
      ${
        menu.items.length === 0
          ? html`<div class="menu-empty">${this.t('editor.slash.empty')}</div>`
          : menu.items.map(
              (item, i) => html`<div
                class="menu-item"
                role="option"
                id=${`${this.#id}-slash-${i}`}
                aria-selected=${i === menu.selected ? 'true' : 'false'}
                @mousedown=${TesseraEditorElement.#keepFocus}
                @click=${() => this.#handle?.pick('slash', i)}
              >
                <tessera-icon name=${item.icon}></tessera-icon>${this.t(`editor.block.${item.id}`)}
              </div>`,
            )
      }
    </div>`;
  }

  #renderMentions(menu: SuggestState<MentionItem> | null | undefined): unknown {
    if (!menu) return nothing;
    return html`<div
      class="float menu"
      role="listbox"
      id=${`${this.#id}-mention`}
      aria-label=${this.t('editor.mention.label')}
      style=${`left:${Math.round(menu.rect.x)}px;top:${Math.round(menu.rect.y + menu.rect.height + 4)}px`}
    >
      ${
        menu.items.length === 0
          ? html`<div class="menu-empty">${this.t('editor.mention.empty')}</div>`
          : menu.items.map(
              (item, i) => html`<div
                class="menu-item"
                role="option"
                id=${`${this.#id}-mention-${i}`}
                aria-selected=${i === menu.selected ? 'true' : 'false'}
                @mousedown=${TesseraEditorElement.#keepFocus}
                @click=${() => this.#handle?.pick('mention', i)}
              >
                <tessera-avatar size="sm" name=${item.label} src=${item.avatarUrl ?? ''}></tessera-avatar>${item.label}
              </div>`,
            )
      }
    </div>`;
  }

  protected override renderFeature(): unknown {
    const handle = this.#handle;
    const state = handle ? this.observe(handle.state) : this.#state;
    const slash = handle ? this.observe(handle.slash) : null;
    const mention = handle ? this.observe(handle.mention) : null;
    const max = this.#maxLength;
    const characters = state?.characters ?? 0;
    const config = this.#config;
    return html`<div class="frame" part="frame">
      ${state ? this.#renderToolbar(state) : nothing}
      <div class="content" part="content"></div>
      ${
        state?.characters !== undefined && (max !== undefined || config)
          ? html`<footer part="footer" class=${classMap({ over: max !== undefined && characters > max })}>
              ${max !== undefined ? this.t('editor.footer.limit', { count: characters, max }) : this.t('editor.footer.characters', { count: characters })}
            </footer>`
          : nothing
      }
      ${state ? this.#renderBubble(state) : nothing}
      ${this.#renderSlash(slash)}${this.#renderMentions(mention)}
      <input class="visually-hidden" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true" @change=${this.#onFile} />
    </div>`;
  }
}

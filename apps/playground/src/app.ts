import {
  createTessera,
  type PluginLoader,
  type TesseraInstance,
  type ThemeMode,
} from '@tessera-kit/core';
import { EditorConfig, type EditorHandle, type RichDoc } from '@tessera-kit/editor';
import type { TesseraEditorElement } from '@tessera-kit/editor/elements';
import { baseStyles, focusRing, toastErrors } from '@tessera-kit/elements';
import { KanbanConfig } from '@tessera-kit/kanban';
import { NotesConfig } from '@tessera-kit/notes';
import { createStorage, createUploads } from '@tessera-kit/storage';
import { createTransport } from '@tessera-kit/transport';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import type { z } from 'zod';
import './config-form.js';
import { MEMBERS, seedAll } from './seed.js';

type Tab = 'editor' | 'notes' | 'kanban' | 'together';
type StorageType = 'memory' | 'local' | 'indexeddb';
type FeatureId = 'editor' | 'notes' | 'kanban';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'editor', label: 'Editor' },
  { id: 'notes', label: 'Notes' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'together', label: 'All together' },
];

const FEATURES: Array<{ id: FeatureId; label: string; schema: z.ZodType }> = [
  { id: 'editor', label: 'Editor', schema: EditorConfig },
  { id: 'notes', label: 'Notes', schema: NotesConfig },
  { id: 'kanban', label: 'Kanban', schema: KanbanConfig },
];

const plugins: Record<string, PluginLoader> = {
  editor: () => import('@tessera-kit/editor'),
  notes: () => import('@tessera-kit/notes'),
  kanban: () => import('@tessera-kit/kanban'),
};

const WELCOME: RichDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Try the editor' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Type ' },
        { type: 'text', text: '/', marks: [{ type: 'code' }] },
        {
          type: 'text',
          text: ' for blocks, select text for the formatting menu, or start a line with ',
        },
        { type: 'text', text: '# ', marks: [{ type: 'code' }] },
        { type: 'text', text: 'or ' },
        { type: 'text', text: '- ', marks: [{ type: 'code' }] },
        { type: 'text', text: 'for Markdown shortcuts.' },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Bold, italic, links, images' }] },
          ],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Switch features on and off in the panel' }],
            },
          ],
        },
      ],
    },
  ],
};

const params = new URLSearchParams(location.search);
const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const v = params.get(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
};

/** The playground: every feature of this repo with its options editable live. */
export class PlaygroundApp extends LitElement {
  static override properties: PropertyDeclarations = {
    tab: { state: true },
    storage: { state: true },
    theme: { state: true },
    locale: { state: true },
    instance: { state: true },
    ready: { state: true },
    enabled: { state: true },
    boardId: { state: true },
    seeding: { state: true },
    markdown: { state: true },
    editorReadonly: { state: true },
    panel: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
        min-height: 100vh;
        background: var(--tessera-color-bg);
        color: var(--tessera-color-text);
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-3) var(--tessera-space-4);
        border-bottom: 1px solid var(--tessera-color-border);
      }
      h1 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      h1 small {
        display: block;
        font-size: var(--tessera-font-size-xs);
        font-weight: 400;
        color: var(--tessera-color-text-muted);
      }
      nav {
        display: flex;
        gap: var(--tessera-space-1);
        flex: 1;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
        align-items: center;
      }
      select {
        min-height: 32px;
        font: inherit;
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: 0 var(--tessera-space-2);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }
      @media (min-width: 62rem) {
        .layout {
          grid-template-columns: 18rem minmax(0, 1fr);
        }
      }
      aside {
        padding: var(--tessera-space-3);
        border-inline-end: 1px solid var(--tessera-color-border);
        background: var(--tessera-color-surface);
        max-height: calc(100vh - 4.5rem);
        overflow: auto;
      }
      aside details {
        margin-bottom: var(--tessera-space-3);
      }
      aside summary {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        cursor: pointer;
        font-weight: 700;
        padding: var(--tessera-space-1) 0;
      }
      aside summary:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      main {
        padding: var(--tessera-space-4);
        min-width: 0;
      }
      .note {
        margin: 0 0 var(--tessera-space-3);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
      .panes {
        display: grid;
        gap: var(--tessera-space-4);
        grid-template-columns: minmax(0, 1fr);
        margin-top: var(--tessera-space-4);
      }
      @media (min-width: 52rem) {
        .panes {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }
      .panes textarea {
        width: 100%;
        min-height: 10rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text);
        background: var(--tessera-color-surface);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: var(--tessera-space-2);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        flex-wrap: wrap;
        margin: var(--tessera-space-2) 0;
      }
      .together {
        display: grid;
        gap: var(--tessera-space-4);
        grid-template-columns: minmax(0, 1fr);
      }
      @media (min-width: 90rem) {
        .together {
          grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        }
      }
      tessera-kanban {
        min-height: 28rem;
      }
      tessera-notes {
        min-height: 28rem;
      }
      h2 {
        margin: 0 0 var(--tessera-space-2);
        font-size: var(--tessera-font-size-lg);
      }
    `,
  ];

  tab: Tab = read('tab', ['editor', 'notes', 'kanban', 'together'] as const, 'kanban');
  storage: StorageType = read('storage', ['memory', 'local', 'indexeddb'] as const, 'indexeddb');
  theme: ThemeMode = read('theme', ['auto', 'light', 'dark'] as const, 'auto');
  locale: string = read('locale', ['en', 'de'] as const, 'en');
  instance: TesseraInstance | undefined;
  ready = false;
  enabled: Record<FeatureId, boolean> = { editor: true, notes: true, kanban: true };
  boardId: string | undefined = params.get('board') ?? undefined;
  seeding = false;
  markdown = '';
  editorReadonly = false;
  panel = true;

  #configs: Record<FeatureId, Record<string, unknown>> = { editor: {}, notes: {}, kanban: {} };
  #timers = new Map<FeatureId, ReturnType<typeof setTimeout>>();
  #stopErrors: (() => void) | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#create();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopErrors?.();
    void this.instance?.destroy();
  }

  async #create(): Promise<void> {
    this.ready = false;
    this.#stopErrors?.();
    await this.instance?.destroy();
    const instance = createTessera(
      {
        appId: 'workspace-playground',
        locale: this.locale,
        theme: { mode: this.theme },
        storage: { type: this.storage },
        uploads: { type: 'dataurl' },
        transport: { type: 'none' },
        features: Object.fromEntries(
          FEATURES.map((f) => [f.id, { ...this.#configs[f.id], enabled: this.enabled[f.id] }]),
        ),
      },
      {
        plugins,
        adapters: { storage: createStorage, uploads: createUploads, transport: createTransport },
      },
    );
    this.#stopErrors = toastErrors(instance);
    this.instance = instance;
    await instance.ready;
    this.ready = true;
  }

  #sync(): void {
    const next = new URLSearchParams();
    next.set('tab', this.tab);
    next.set('storage', this.storage);
    if (this.theme !== 'auto') next.set('theme', this.theme);
    if (this.locale !== 'en') next.set('locale', this.locale);
    if (this.boardId) next.set('board', this.boardId);
    history.replaceState(null, '', `${location.pathname}?${next}`);
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (['tab', 'storage', 'theme', 'locale', 'boardId'].some((k) => changed.has(k))) this.#sync();
  }

  #changeFeature(id: FeatureId, patch: Record<string, unknown>): void {
    this.#configs[id] = patch;
    clearTimeout(this.#timers.get(id));
    this.#timers.set(
      id,
      setTimeout(async () => {
        const instance = this.instance;
        if (!instance || !this.enabled[id]) return;
        // Re-running setup is how a feature picks up new options.
        await instance.disable(id);
        await instance.enable(id, patch).catch(() => undefined);
      }, 250),
    );
  }

  async #toggleFeature(id: FeatureId, on: boolean): Promise<void> {
    this.enabled = { ...this.enabled, [id]: on };
    if (on) await this.instance?.enable(id, this.#configs[id]).catch(() => undefined);
    else await this.instance?.disable(id);
  }

  async #seed(): Promise<void> {
    if (!this.instance) return;
    this.seeding = true;
    try {
      const { boardId } = await seedAll(this.instance);
      if (boardId) this.boardId = boardId;
    } finally {
      this.seeding = false;
    }
  }

  #openInNewTab = (): void => {
    window.open(location.href, '_blank', 'noopener');
  };

  // ---------- editor tab ----------
  #editorChange = async (e: Event): Promise<void> => {
    const el = e.currentTarget as TesseraEditorElement;
    const handle: EditorHandle | undefined = el.editor;
    if (handle) this.markdown = handle.getMarkdown();
  };

  #applyMarkdown = (): void => {
    const el = this.renderRoot.querySelector<TesseraEditorElement>('tessera-editor');
    const text = this.renderRoot.querySelector<HTMLTextAreaElement>('#md')?.value ?? '';
    el?.editor?.setContent(text, 'markdown');
    this.markdown = el?.editor?.getMarkdown() ?? text;
  };

  #renderEditorTab(): unknown {
    return html`<section aria-labelledby="t-editor">
      <h2 id="t-editor">Editor</h2>
      <p class="note">A Tiptap-based editor as a web component. It works in forms, exports Markdown and sanitizes pasted HTML.</p>
      <div class="row">
        <label class="row"><input type="checkbox" .checked=${this.editorReadonly} @change=${(e: Event) => (this.editorReadonly = (e.target as HTMLInputElement).checked)} /> Read only</label>
      </div>
      <tessera-editor .value=${WELCOME} ?readonly=${this.editorReadonly} label="Demo document" placeholder="Start writing…" @change=${this.#editorChange}></tessera-editor>
      <div class="panes">
        <div>
          <h3 id="md-label">Markdown</h3>
          <textarea id="md" aria-labelledby="md-label" spellcheck="false" .value=${this.markdown} @input=${(e: Event) => (this.markdown = (e.target as HTMLTextAreaElement).value)}></textarea>
          <div class="row"><tessera-button size="sm" @click=${this.#applyMarkdown}>Import into the editor</tessera-button></div>
        </div>
        <div>
          <h3>Read-only rendering</h3>
          <tessera-rich-text .doc=${(this.renderRoot.querySelector<TesseraEditorElement>('tessera-editor')?.value as RichDoc | undefined) ?? WELCOME}></tessera-rich-text>
        </div>
      </div>
    </section>`;
  }

  #renderKanban(): unknown {
    return html`<section aria-labelledby="t-kanban">
      <h2 id="t-kanban">Kanban</h2>
      <p class="note">Drag cards with the mouse, a finger or the keyboard (Space, arrows, Space). Press <kbd>n</kbd> for a new card, <kbd>/</kbd> to search, <kbd>Ctrl+Z</kbd> to undo. Open this page in a second tab to see live sync${this.storage === 'memory' ? ' (memory storage is per tab, so switch to IndexedDB first)' : ''}.</p>
      <tessera-kanban board=${this.boardId ?? nothing} .members=${MEMBERS}></tessera-kanban>
    </section>`;
  }

  #renderNotes(): unknown {
    return html`<section aria-labelledby="t-notes">
      <h2 id="t-notes">Notes</h2>
      <p class="note">Switch to the free layout to drag, resize and arrange notes. Hold Space and drag, or use the middle mouse button, to pan.</p>
      <tessera-notes></tessera-notes>
    </section>`;
  }

  #renderTab(): unknown {
    switch (this.tab) {
      case 'editor':
        return this.#renderEditorTab();
      case 'notes':
        return this.#renderNotes();
      case 'kanban':
        return this.#renderKanban();
      default:
        return html`<div class="together">${this.#renderKanban()}${this.#renderNotes()}</div>`;
    }
  }

  #renderPanel(): unknown {
    return html`<aside aria-label="Configuration">
      ${FEATURES.map(
        (f) => html`<details ?open=${f.id === (this.tab === 'together' ? 'kanban' : this.tab)}>
          <summary>
            <input type="checkbox" aria-label=${`Enable ${f.label}`} .checked=${this.enabled[f.id]} @click=${(e: Event) => e.stopPropagation()} @change=${(e: Event) => void this.#toggleFeature(f.id, (e.target as HTMLInputElement).checked)} />
            ${f.label}
          </summary>
          <config-form .schema=${f.schema} .value=${this.#configs[f.id]} @config-change=${(e: CustomEvent<{ value: Record<string, unknown> }>) => this.#changeFeature(f.id, e.detail.value)}></config-form>
        </details>`,
      )}
    </aside>`;
  }

  protected override render(): unknown {
    return html`<tessera-root .tessera=${this.instance}>
      <header>
        <h1>Tessera workspace<small>editor · notes · kanban</small></h1>
        <nav aria-label="Kits">
          ${TABS.map(
            (t) =>
              html`<tessera-button size="sm" variant=${t.id === this.tab ? 'primary' : 'ghost'} @click=${() => (this.tab = t.id)}>${t.label}</tessera-button>`,
          )}
        </nav>
        <div class="controls">
          <label>Storage
            <select @change=${(e: Event) => {
              this.storage = (e.target as HTMLSelectElement).value as StorageType;
              void this.#create();
            }}>
              ${(['memory', 'local', 'indexeddb'] as const).map((s) => html`<option value=${s} ?selected=${s === this.storage}>${s}</option>`)}
            </select>
          </label>
          <label>Theme
            <select @change=${(e: Event) => {
              this.theme = (e.target as HTMLSelectElement).value as ThemeMode;
              this.instance?.setTheme(this.theme);
            }}>
              ${(['auto', 'light', 'dark'] as const).map((s) => html`<option value=${s} ?selected=${s === this.theme}>${s}</option>`)}
            </select>
          </label>
          <label>Language
            <select @change=${(e: Event) => {
              this.locale = (e.target as HTMLSelectElement).value;
              this.instance?.setLocale(this.locale);
            }}>
              <option value="en" ?selected=${this.locale === 'en'}>English</option>
              <option value="de" ?selected=${this.locale === 'de'}>Deutsch</option>
            </select>
          </label>
          <tessera-button size="sm" ?loading=${this.seeding} @click=${() => void this.#seed()}>Add demo data</tessera-button>
          <tessera-button size="sm" variant="ghost" @click=${this.#openInNewTab}>Open in new tab</tessera-button>
        </div>
      </header>
      ${
        this.ready
          ? html`<div class="layout">${this.panel ? this.#renderPanel() : nothing}<main>${this.#renderTab()}</main></div>`
          : html`<main><tessera-spinner label="Loading"></tessera-spinner></main>`
      }
    </tessera-root>`;
  }
}

if (!customElements.get('playground-app')) customElements.define('playground-app', PlaygroundApp);

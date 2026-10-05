import { ContextConsumer } from '@lit/context';
import type { TesseraInstance } from '@tessera-kit/core';
import {
  baseStyles,
  focusRing,
  KeyboardShortcutsController,
  TesseraElement,
  tesseraContext,
  toast,
  visuallyHidden,
} from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { NotesConfigValue } from '../config.js';
import type { Note } from '../schemas.js';
import type { NotesApi, NotesController } from '../types.js';
import { version } from '../version.js';
import type { TesseraNote } from './note.js';
import type { NotesView } from './view.js';

/**
 * `<tessera-notes>`: sticky notes on a responsive grid or a free canvas, with search, tags,
 * pinning, colours and archive.
 *
 * @fires note-create - `{ note }`
 * @fires note-update - `{ note, patch }`
 * @fires note-delete - `{ note }` after a note was deleted from the UI (it can be undone)
 * @csspart toolbar @csspart note @csspart header @csspart body @csspart footer
 * @slot toolbar-end - extra controls at the end of the toolbar
 * @slot empty - shown when there are no notes
 */
export class TesseraNotesElement extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    board: { attribute: 'board' },
    readonly: { type: Boolean, reflect: true },
    controller: { state: true },
    editingId: { state: true },
    failure: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
        min-height: 16rem;
      }
      .root {
        display: flex;
        flex-direction: column;
        gap: var(--tessera-space-3);
        height: 100%;
        outline: none;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .search {
        position: relative;
        flex: 1 1 10rem;
        max-width: 18rem;
      }
      .search tessera-icon {
        position: absolute;
        inset-inline-start: var(--tessera-space-2);
        inset-block-start: 50%;
        transform: translateY(-50%);
        color: var(--tessera-color-text-muted);
        pointer-events: none;
      }
      input[type='search'] {
        box-sizing: border-box;
        width: 100%;
        min-height: 36px;
        padding: 0 var(--tessera-space-3) 0 calc(var(--tessera-space-2) + 1.5rem);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      select {
        box-sizing: border-box;
        min-height: 36px;
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: 0 var(--tessera-space-2);
      }
      input:focus-visible,
      select:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      .group {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      .group tessera-icon-button[data-active] {
        background: var(--tessera-color-primary);
        color: var(--tessera-color-primary-contrast);
        border-radius: var(--tessera-radius-sm);
      }
      .grid {
        column-width: 16rem;
        column-gap: var(--tessera-space-3);
      }
      .scroller {
        position: relative;
        flex: 1;
        min-height: 20rem;
        overflow: auto;
        border: 1px dashed var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background-image: radial-gradient(var(--tessera-color-border) 1px, transparent 1px);
        background-size: 24px 24px;
      }
      .scroller[data-panning] {
        cursor: grabbing;
      }
      :host([data-space]) .scroller {
        cursor: grab;
      }
      .canvas {
        position: relative;
      }
      .muted {
        color: var(--tessera-color-text-muted);
      }
    `,
  ];

  /** Id of the board of notes to show. Defaults to `default`. */
  board: string | undefined;
  readonly = false;
  controller: NotesController | undefined;
  editingId: string | undefined;
  failure = '';

  protected readonly featureId: string | null = 'notes';

  readonly #instance = new ContextConsumer(this, { context: tesseraContext, subscribe: true });
  #opening: string | undefined;
  #offs: Array<() => void> = [];
  #view: NotesView | undefined;
  #viewKey: unknown[] = [];
  #pan: { x: number; y: number; left: number; top: number; id: number } | undefined;

  constructor() {
    super();
    new KeyboardShortcutsController(this, {
      'mod+shift+z': (e) => {
        e.preventDefault();
        this.#history('redo');
      },
      'mod+z': (e) => {
        e.preventDefault();
        this.#history('undo');
      },
      'mod+y': (e) => {
        e.preventDefault();
        this.#history('redo');
      },
      '/': (e) => {
        e.preventDefault();
        this.renderRoot.querySelector<HTMLInputElement>('input[type=search]')?.focus();
      },
      n: (e) => {
        if (this.readonly) return;
        e.preventDefault();
        void this.addNote();
      },
    });
  }

  get #api(): NotesApi | undefined {
    return this.ctx.services.get('notes');
  }

  get #boardId(): string {
    return this.board || 'default';
  }

  get #tessera(): TesseraInstance | undefined {
    return this.tessera ?? this.#instance.value;
  }

  /** Adds a note (on the canvas, near the middle of what is on screen) and starts editing it. */
  async addNote(): Promise<Note | undefined> {
    const controller = this.controller;
    if (!controller || this.readonly) return undefined;
    const scroller = this.renderRoot.querySelector<HTMLElement>('.scroller');
    const placement = scroller
      ? {
          x: Math.max(0, Math.round(scroller.scrollLeft + scroller.clientWidth / 2 - 120)),
          y: Math.max(0, Math.round(scroller.scrollTop + scroller.clientHeight / 2 - 90)),
        }
      : {};
    const free = controller.state.get().layout === 'free';
    const created = await controller.create(free ? placement : {}).catch((error: unknown) => {
      toast(this.ctx, { kind: 'error', message: (error as Error).message });
      return undefined;
    });
    if (created) {
      // Show the new note even when a search or tag filter would hide it.
      controller.setQuery('');
      controller.setTag(undefined);
      controller.setShowArchived(false);
      this.editingId = created.id;
    }
    return created;
  }

  #history(action: 'undo' | 'redo'): void {
    const controller = this.controller;
    if (!controller) return;
    void controller.history[action]().then(() => {
      if (!this.matches(':focus-within'))
        this.renderRoot.querySelector<HTMLElement>('.root')?.focus();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#teardown();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
    this.addEventListener('keydown', this.#spaceDown);
    this.addEventListener('keyup', this.#spaceUp);
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const api = this.#api;
    if (!this.enabled || !api) {
      if (this.controller) this.#teardown();
      return;
    }
    if (this.#boardId !== this.controller?.boardId && this.#boardId !== this.#opening)
      void this.#open(api, this.#boardId);
  }

  async #open(api: NotesApi, id: string): Promise<void> {
    this.#teardown();
    this.#opening = id;
    this.failure = '';
    try {
      const controller = await api.open(id);
      if (this.#opening !== id || !this.isConnected) {
        controller.close();
        return;
      }
      this.controller = controller;
      this.#listen(controller);
    } catch (error) {
      this.failure = (error as Error).message;
    } finally {
      if (this.#opening === id) this.#opening = undefined;
    }
  }

  #teardown(): void {
    for (const off of this.#offs.splice(0)) off();
    this.controller?.close();
    this.controller = undefined;
    this.#opening = undefined;
    this.editingId = undefined;
  }

  #listen(controller: NotesController): void {
    const bus = this.ctx.bus;
    const mine = (n: Note): boolean => n.boardId === controller.boardId;
    this.#offs.push(
      bus.on('notes:created', (note) => {
        if (mine(note)) this.emit('note-create', { note });
      }),
      bus.on('notes:updated', (e) => {
        if (mine(e.note)) this.emit('note-update', e);
      }),
      bus.on('notes:deleted', (note) => {
        if (mine(note)) this.emit('note-delete', { note });
      }),
      bus.on('notes:conflict', (e) => {
        if (e.resolution !== 'reapplied')
          toast(this.ctx, { kind: 'error', message: this.t('notes.toast.conflict') });
      }),
    );
  }

  // ---------- canvas panning: Space + drag, or the middle mouse button ----------
  #spaceDown = (e: KeyboardEvent): void => {
    if (e.key === ' ' && e.target === this.renderRoot.querySelector('.root')) {
      e.preventDefault();
      this.toggleAttribute('data-space', true);
    } else if (
      e.key === ' ' &&
      e.composedPath()[0] instanceof Element &&
      (e.composedPath()[0] as Element).localName === 'tessera-note'
    ) {
      this.toggleAttribute('data-space', true);
    }
  };
  #spaceUp = (e: KeyboardEvent): void => {
    if (e.key === ' ') this.removeAttribute('data-space');
  };

  #panStart = (e: PointerEvent): void => {
    const scroller = e.currentTarget as HTMLElement;
    const onBackground =
      e.target === scroller ||
      (e.composedPath()[0] as Element | undefined)?.classList?.contains('canvas');
    if (
      !(
        e.button === 1 ||
        (this.hasAttribute('data-space') && e.button === 0) ||
        (onBackground && e.pointerType === 'touch')
      )
    )
      return;
    try {
      scroller.setPointerCapture(e.pointerId);
    } catch {
      // See TesseraNote: capture is optional.
    }
    this.#pan = {
      x: e.clientX,
      y: e.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      id: e.pointerId,
    };
    scroller.toggleAttribute('data-panning', true);
    e.preventDefault();
  };
  #panMove = (e: PointerEvent): void => {
    const pan = this.#pan;
    if (!pan || e.pointerId !== pan.id) return;
    const scroller = e.currentTarget as HTMLElement;
    scroller.scrollLeft = pan.left - (e.clientX - pan.x);
    scroller.scrollTop = pan.top - (e.clientY - pan.y);
  };
  #panEnd = (e: PointerEvent): void => {
    if (this.#pan?.id !== e.pointerId) return;
    this.#pan = undefined;
    (e.currentTarget as HTMLElement).removeAttribute('data-panning');
  };

  // ---------- view + handlers ----------
  #buildView(state: ReturnType<NotesController['state']['get']>): NotesView {
    const config = (this.#api as NotesApi).config as NotesConfigValue;
    const editor = this.ctx.services.get('editor') !== undefined || this.ctx.appId === 'default';
    const key = [
      this.t('notes.note.edit'),
      config,
      this.readonly,
      state.layout,
      state.showArchived,
      editor,
      this.#tessera,
    ];
    if (
      this.#view &&
      key.length === this.#viewKey.length &&
      key.every((v, i) => Object.is(v, this.#viewKey[i]))
    ) {
      return this.#view;
    }
    this.#viewKey = key;
    this.#view = {
      t: (k, p) => this.t(k, p),
      formatDate: (v, o) => this.ctx.i18n.formatDate(v, o),
      readonly: this.readonly,
      layout: state.layout,
      colors: config.colors,
      allow: { pinning: config.pinning, archive: config.archive, tags: config.tags },
      editor,
      toolbar: config.editor.toolbar,
      instance: this.#tessera,
      archived: state.showArchived,
    };
    return this.#view;
  }

  #fail = (error: unknown): void => {
    toast(this.ctx, { kind: 'error', message: (error as Error).message });
  };

  #onDelete = async (id: string): Promise<void> => {
    const c = this.controller;
    const note = c?.getNote(id);
    if (!c || !note) return;
    if (this.editingId === id) this.editingId = undefined;
    await c.delete(id).catch(this.#fail);
    toast(this.ctx, {
      kind: 'info',
      message: this.t('notes.toast.deleted'),
      action: { label: this.t('notes.undo'), onAction: () => void c.history.undo() },
    });
  };

  protected override renderFeature(): unknown {
    const api = this.#api;
    if (!api) return nothing;
    const controller = this.controller;
    if (!controller) {
      return this.failure
        ? html`<p role="alert">${this.failure}</p>`
        : html`<tessera-spinner label=${this.t('ui.loading')}></tessera-spinner>`;
    }
    const state = this.observe(controller.state);
    const history = this.observe(controller.history.state);
    const view = this.#buildView(state);
    const config = api.config;
    const free = state.layout === 'free';
    const notes = repeat(
      state.visible,
      (n) => n.id,
      (note) => html`<tessera-note
        exportparts="note,header,body,footer"
        .note=${note}
        .view=${view}
        .editing=${this.editingId === note.id}
      ></tessera-note>`,
    );
    const empty =
      state.visible.length === 0 && !state.loading
        ? html`<slot name="empty"><p class="muted">${state.showArchived ? this.t('notes.emptyArchive') : state.query || state.tag ? this.t('notes.noMatches') : this.t('notes.empty')}</p></slot>`
        : nothing;
    const extentX = Math.max(0, ...state.visible.map((n) => n.x + n.w)) + 240;
    const extentY = Math.max(0, ...state.visible.map((n) => n.y + n.h)) + 240;

    return html`<div class="root" tabindex="-1"
      @nt-edit-start=${(e: CustomEvent<{ id: string }>) => (this.editingId = e.detail.id)}
      @nt-edit-end=${(e: CustomEvent<{ id: string }>) => {
        if (this.editingId === e.detail.id) this.editingId = undefined;
      }}
      @nt-update=${(e: CustomEvent<{ id: string; patch: Partial<Note> }>) => void controller.update(e.detail.id, e.detail.patch).catch(this.#fail)}
      @nt-move=${(e: CustomEvent<{ id: string; x: number; y: number }>) => void controller.move(e.detail.id, e.detail.x, e.detail.y).catch(this.#fail)}
      @nt-resize=${(e: CustomEvent<{ id: string; w: number; h: number }>) => void controller.resize(e.detail.id, e.detail.w, e.detail.h).catch(this.#fail)}
      @nt-raise=${(e: CustomEvent<{ id: string }>) => controller.bringToFront(e.detail.id)}
      @nt-pin=${(e: CustomEvent<{ id: string }>) => void controller.togglePin(e.detail.id).catch(this.#fail)}
      @nt-archive=${(e: CustomEvent<{ id: string }>) => void controller.archive(e.detail.id).catch(this.#fail)}
      @nt-unarchive=${(e: CustomEvent<{ id: string }>) => void controller.unarchive(e.detail.id).catch(this.#fail)}
      @nt-delete=${(e: CustomEvent<{ id: string }>) => void this.#onDelete(e.detail.id)}>
      <div class="toolbar" part="toolbar">
        ${
          this.readonly
            ? nothing
            : html`<tessera-button variant="primary" size="sm" @click=${() => void this.addNote()}><tessera-icon name="plus"></tessera-icon>${this.t('notes.new')}</tessera-button>`
        }
        ${
          config.search
            ? html`<div class="search">
                <tessera-icon name="search"></tessera-icon>
                <input type="search" .value=${state.query} placeholder=${this.t('notes.search')} aria-label=${this.t('notes.search')} @input=${(e: Event) => controller.setQuery((e.target as HTMLInputElement).value)} @keydown=${(
                  e: KeyboardEvent,
                ) => {
                  if (e.key === 'Escape' && state.query) {
                    e.stopPropagation();
                    controller.setQuery('');
                  }
                }} />
              </div>`
            : nothing
        }
        ${
          config.tags && state.tags.length
            ? html`<select aria-label=${this.t('notes.filterTag')} .value=${state.tag ?? ''} @change=${(e: Event) => controller.setTag((e.target as HTMLSelectElement).value || undefined)}>
                <option value="">${this.t('notes.allTags')}</option>
                ${state.tags.map((t) => html`<option value=${t.tag} ?selected=${state.tag === t.tag}>${t.tag} (${t.count})</option>`)}
              </select>`
            : nothing
        }
        ${
          config.allowLayoutSwitch
            ? html`<div class="group" role="group" aria-label=${this.t('notes.layout')}>
                <tessera-icon-button size="sm" icon="columns" label=${this.t('notes.layoutGrid')} ?data-active=${!free} @click=${() => controller.setLayout('grid')}></tessera-icon-button>
                <tessera-icon-button size="sm" icon="note" label=${this.t('notes.layoutFree')} ?data-active=${free} @click=${() => controller.setLayout('free')}></tessera-icon-button>
              </div>`
            : nothing
        }
        ${
          config.archive
            ? html`<tessera-button size="sm" variant=${state.showArchived ? 'primary' : 'secondary'} @click=${() => controller.setShowArchived(!state.showArchived)}>${state.showArchived ? this.t('notes.showActive') : this.t('notes.showArchived')}</tessera-button>`
            : nothing
        }
        <tessera-icon-button size="sm" icon="undo" label=${history.undoLabel ? this.t('notes.undoAction', { action: this.t(history.undoLabel) }) : this.t('notes.undo')} ?disabled=${!history.canUndo} @click=${() => void controller.history.undo()}></tessera-icon-button>
        <tessera-icon-button size="sm" icon="redo" label=${history.redoLabel ? this.t('notes.redoAction', { action: this.t(history.redoLabel) }) : this.t('notes.redo')} ?disabled=${!history.canRedo} @click=${() => void controller.history.redo()}></tessera-icon-button>
        <slot name="toolbar-end"></slot>
      </div>
      ${
        free
          ? html`<div class="scroller" @pointerdown=${this.#panStart} @pointermove=${this.#panMove} @pointerup=${this.#panEnd} @pointercancel=${this.#panEnd}>
              <div class="canvas" role="list" aria-label=${this.t('notes.notes')} style=${`width:${extentX}px;height:${extentY}px`}>${notes}</div>
              ${empty}
            </div>`
          : html`<div class="grid" role="list" aria-label=${this.t('notes.notes')}>${notes}</div>${empty}`
      }
    </div>`;
  }

  /** Test hook. */
  noteElement(id: string): TesseraNote | null {
    return (
      [...this.renderRoot.querySelectorAll<TesseraNote>('tessera-note')].find(
        (n) => n.note?.id === id,
      ) ?? null
    );
  }
}

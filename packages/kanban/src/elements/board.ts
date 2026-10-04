import { ContextConsumer } from '@lit/context';
import type { TesseraInstance, Unsubscribe, UserInfo } from '@tessera-kit/core';
import {
  baseStyles,
  focusRing,
  KeyboardShortcutsController,
  ResizeController,
  TesseraElement,
  tesseraContext,
  toast,
  visuallyHidden,
} from '@tessera-kit/elements';
import { createSortable, type Sortable } from '@tessera-internal/dnd';
import {
  type CSSResultGroup,
  css,
  html,
  nothing,
  type PropertyDeclarations,
  type TemplateResult,
} from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { KanbanConfigValue } from '../config.js';
import { isFilterActive, isoDay } from '../filter.js';
import type { Board, Card, Column } from '../schemas.js';
import type { BoardController, KanbanApi } from '../types.js';
import type { TesseraKanbanCard } from './card.js';
import type { TesseraKanbanCardDialog } from './card-dialog.js';
import type { TesseraKanbanColumn } from './column.js';
import type { TesseraKanbanFilters } from './filters.js';
import { colorStyles } from './styles.js';
import type { KanbanView } from './view.js';

const NARROW = 640;

/**
 * `<tessera-kanban>`: a full board with columns, cards, filters, drag and drop (pointer, touch
 * and keyboard) and a card dialog. Without a `board` attribute it shows a board picker.
 *
 * @fires card-create - `{ card }` after a card was added
 * @fires card-update - `{ card, patch }` after a card was edited
 * @fires card-move - `{ card, fromColumnId, toColumnId, toIndex }` before a drag or keyboard move; **cancelable**
 * @fires card-open - `{ card }` when the card dialog opens
 * @fires card-delete - `{ card }` before a card is deleted from the UI; cancelable
 * @csspart board @csspart column @csspart column-header @csspart card @csspart add-card @csspart filters
 * @slot empty - shown when the board has no columns
 * @slot toolbar-end - extra controls at the end of the toolbar
 */
export class TesseraKanbanElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    board: { attribute: 'board' },
    readonly: { type: Boolean, reflect: true },
    members: { attribute: false },
    beforeCardMove: { attribute: false },
    renderCardFooter: { attribute: false },
    controller: { state: true },
    boards: { state: true },
    selected: { state: true },
    openCardId: { state: true },
    deleteId: { state: true },
    activeColumn: { state: true },
    newBoard: { state: true },
    failure: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    colorStyles,
    css`
      :host {
        display: block;
        min-height: 20rem;
      }
      .root {
        outline: none;
        display: flex;
        flex-direction: column;
        gap: var(--tessera-space-3);
        height: 100%;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .toolbar h2 {
        margin: 0;
        margin-inline-end: auto;
        font-size: var(--tessera-font-size-lg);
      }
      .toolbar tessera-kanban-filters {
        flex: 1 1 20rem;
        order: 3;
      }
      .board {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: var(--tessera-space-3);
        flex: 1;
        padding-bottom: var(--tessera-space-3);
        overflow-x: auto;
        scroll-snap-type: x proximity;
      }
      .board > tessera-kanban-column {
        max-height: 100%;
      }
      .add-column {
        flex: 0 0 var(--tessera-kanban-column-width, 18rem);
      }
      .add-column form {
        display: flex;
        gap: var(--tessera-space-2);
      }
      .add-column input,
      .picker input {
        flex: 1;
        min-width: 0;
        min-height: 36px;
        padding: 0 var(--tessera-space-3);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      input:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      .tabs {
        display: none;
        gap: var(--tessera-space-1);
        overflow-x: auto;
      }
      .tabs button {
        all: unset;
        flex: none;
        padding: var(--tessera-space-1) var(--tessera-space-3);
        border-radius: var(--tessera-radius-full);
        cursor: pointer;
        font-size: var(--tessera-font-size-sm);
        background: var(--tessera-color-surface-2);
      }
      .tabs button[aria-current='true'] {
        background: var(--tessera-color-primary);
        color: var(--tessera-color-primary-contrast);
      }
      .tabs button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 2px;
      }
      :host([narrow]) .tabs {
        display: flex;
      }
      :host([narrow]) .board > tessera-kanban-column {
        flex: 0 0 100%;
      }
      :host([narrow]) .board {
        scroll-snap-type: x mandatory;
      }
      .ghost-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: var(--tessera-z-popover);
      }
      .ghost-column {
        padding: var(--tessera-space-3);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        background: var(--tessera-color-surface);
        font-weight: 700;
      }
      .picker {
        display: grid;
        gap: var(--tessera-space-3);
        max-width: 28rem;
      }
      .picker ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--tessera-space-2);
      }
      .picker li button {
        all: unset;
        box-sizing: border-box;
        display: block;
        width: 100%;
        padding: var(--tessera-space-3);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-surface);
        cursor: pointer;
        font-weight: 600;
      }
      .picker li button:hover {
        background: var(--tessera-color-surface-2);
      }
      .picker li button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      .picker form {
        display: flex;
        gap: var(--tessera-space-2);
      }
      .muted {
        color: var(--tessera-color-text-muted);
      }
    `,
  ];

  /** Id of the board to show. Leave empty to show the board picker. */
  board: string | undefined;
  readonly = false;
  /** People who can be assigned to cards. */
  members: UserInfo[] | undefined;
  /** Return `false` to refuse a move (may be async). */
  beforeCardMove: ((card: Card, toColumnId: string) => boolean | Promise<boolean>) | undefined;
  /** Extra content under each card's details. */
  renderCardFooter: ((card: Card) => TemplateResult | HTMLElement | string) | undefined;

  controller: BoardController | undefined;
  boards: Board[] = [];
  selected: string | undefined;
  openCardId: string | undefined;
  deleteId: string | undefined;
  activeColumn = 0;
  newBoard = '';
  failure = '';

  protected readonly featureId: string | null = 'kanban';

  readonly #instance = new ContextConsumer(this, { context: tesseraContext, subscribe: true });
  readonly #resize = new ResizeController(this);

  constructor() {
    super();
    new KeyboardShortcutsController(this, {
      // The shift variant must come first: a shortcut without `shift` also matches with it held.
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
        this.renderRoot
          .querySelector<TesseraKanbanFilters>('tessera-kanban-filters')
          ?.focusSearch();
      },
      n: (e) => {
        const path = e.composedPath();
        const column =
          (path.find((n) => n instanceof Element && n.localName === 'tessera-kanban-column') as
            | TesseraKanbanColumn
            | undefined) ??
          this.renderRoot.querySelector<TesseraKanbanColumn>('tessera-kanban-column');
        if (column) {
          e.preventDefault();
          column.openComposer();
        }
      },
    });
  }

  /**
   * Undo/redo from the keyboard. The card that had focus may be gone afterwards, so focus moves to
   * the board itself and the next shortcut still reaches it.
   */
  #history(action: 'undo' | 'redo'): void {
    const controller = this.controller;
    if (!controller) return;
    void controller.history[action]().then(() => {
      if (!this.matches(':focus-within'))
        this.renderRoot.querySelector<HTMLElement>('.root')?.focus();
    });
  }

  #opening: string | undefined;
  #boardsLoaded = false;
  #offs: Unsubscribe[] = [];
  #sortables: Sortable[] = [];
  #viewKey: unknown[] = [];
  #view: KanbanView | undefined;
  #announcement = '';
  #scrollFrame = 0;

  /** Opens the card dialog for `id` (also used by `card-open`). */
  openCard(id: string): void {
    const card = this.controller?.getCard(id);
    if (!card) return;
    this.openCardId = id;
    this.emit('card-open', { card });
  }

  get #api(): KanbanApi | undefined {
    return this.ctx.services.get('kanban');
  }

  get #config(): KanbanConfigValue | undefined {
    return this.#api?.config;
  }

  get #activeBoard(): string | undefined {
    return this.board || this.selected;
  }

  get #tessera(): TesseraInstance | undefined {
    return this.tessera ?? this.#instance.value;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#teardown();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    this.toggleAttribute('narrow', this.#resize.width > 0 && this.#resize.width <= NARROW);
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const api = this.#api;
    if (!this.enabled || !api) {
      if (this.controller) this.#teardown();
      return;
    }
    if (changed.has('members') && this.members) api.configure({ members: this.members });
    if (changed.has('beforeCardMove')) api.configure({ beforeCardMove: this.beforeCardMove });
    const wanted = this.#activeBoard;
    if (wanted) {
      if (wanted !== this.controller?.boardId && wanted !== this.#opening)
        void this.#open(api, wanted);
    } else {
      if (this.controller) this.#teardown();
      if (!this.#boardsLoaded) void this.#loadBoards(api);
    }
    if (this.controller) this.#wireSortables();
  }

  async #loadBoards(api: KanbanApi): Promise<void> {
    this.#boardsLoaded = true;
    try {
      this.boards = await api.listBoards();
      this.failure = '';
    } catch (error) {
      this.failure = (error as Error).message;
    }
  }

  async #open(api: KanbanApi, id: string): Promise<void> {
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
    for (const s of this.#sortables.splice(0)) s.destroy();
    this.controller?.close();
    this.controller = undefined;
    this.#opening = undefined;
    this.#boardsLoaded = false;
    this.openCardId = undefined;
  }

  /** Mirrors controller events as DOM events and turns refusals into toasts. */
  #listen(controller: BoardController): void {
    const bus = this.ctx.bus;
    const mine = (card: { boardId: string }): boolean => card.boardId === controller.boardId;
    this.#offs.push(
      bus.on('kanban:card-created', (card) => {
        if (mine(card)) this.emit('card-create', { card });
      }),
      bus.on('kanban:card-updated', (e) => {
        if (mine(e.card)) this.emit('card-update', e);
      }),
      bus.on('kanban:card-deleted', (card) => {
        if (mine(card)) {
          toast(this.ctx, {
            kind: 'info',
            message: this.t('kanban.toast.deleted', { title: card.title }),
            action: {
              label: this.t('kanban.undo'),
              onAction: () => void controller.history.undo(),
            },
          });
        }
      }),
      bus.on('kanban:move-blocked', (e) => {
        if (!mine(e.card)) return;
        const column = controller.getColumn(e.toColumnId);
        toast(this.ctx, {
          kind: 'warning',
          message:
            e.reason === 'wip'
              ? this.t('kanban.toast.wip', {
                  name: column?.title ?? '',
                  limit: column?.wipLimit ?? 0,
                })
              : this.t('kanban.toast.vetoed'),
        });
      }),
      bus.on('kanban:conflict', (e) => {
        if (e.resolution === 'reapplied') return;
        toast(this.ctx, { kind: 'error', message: this.t('kanban.toast.conflict') });
      }),
    );
  }

  // ---------- drag and drop ----------
  #wireSortables(): void {
    const controller = this.controller;
    const root = this.renderRoot as ShadowRoot;
    const columnsEl = root.querySelector<HTMLElement>('.board');
    if (!controller || !columnsEl || this.#sortables.length) return;
    const t = (k: string, p?: Record<string, unknown>): string => this.t(k, p);
    const columnEls = (): TesseraKanbanColumn[] => [
      ...root.querySelectorAll<TesseraKanbanColumn>('tessera-kanban-column'),
    ];
    const ghostParent = (): HTMLElement =>
      root.querySelector<HTMLElement>('.ghost-layer') ?? document.body;
    const announce = (message: string): void => {
      this.#announcement = message;
      this.requestUpdate();
    };
    const fail = (error: unknown): void => {
      toast(this.ctx, { kind: 'error', message: (error as Error).message });
    };

    this.#sortables.push(
      createSortable({
        root,
        axis: 'vertical',
        liftKeys: [' '],
        containers: () =>
          columnEls().flatMap((col) =>
            col.column && col.list
              ? [{ id: col.column.id, el: col.list, items: () => col.cardItems() }]
              : [],
          ),
        canDrag: () => !this.readonly && this.#config?.allow.moveCard !== false,
        createGhost: (item) => (item.el as TesseraKanbanCard).cloneForGhost(),
        ghostParent,
        announce,
        containerLabel: (c) => controller.getColumn(c.id)?.title ?? c.id,
        labelOf: (item) => controller.getCard(item.id)?.title ?? item.id,
        messages: {
          lifted: (name, pos, total, col) =>
            t('kanban.dnd.lifted', { name, pos, total, column: col }),
          moved: (name, pos, total, col) =>
            t('kanban.dnd.moved', { name, pos, total, column: col }),
          dropped: (name, pos, total, col) =>
            t('kanban.dnd.dropped', { name, pos, total, column: col }),
          cancelled: (name) => t('kanban.dnd.cancelled', { name }),
        },
        onMove: async (move) => {
          const card = controller.getCard(move.itemId);
          if (!card) return;
          const allowed = this.emit(
            'card-move',
            {
              card,
              fromColumnId: move.fromContainer,
              toColumnId: move.toContainer,
              toIndex: move.toIndex,
            },
            { cancelable: true },
          );
          if (!allowed) return;
          await controller.moveCard(move.itemId, move.toContainer, move.toIndex).catch(fail);
        },
      }),
      createSortable({
        root,
        axis: 'horizontal',
        handleSelector: '.grip',
        containers: () => [
          {
            id: 'columns',
            el: columnsEl,
            items: () => columnEls().map((el) => ({ id: el.column?.id ?? '', el })),
          },
        ],
        canDrag: () => !this.readonly && this.#config?.allow.reorderColumns !== false,
        createGhost: (item) => {
          const ghost = document.createElement('div');
          ghost.className = 'ghost-column';
          ghost.textContent = controller.getColumn(item.id)?.title ?? '';
          return ghost;
        },
        ghostParent,
        announce,
        containerLabel: () => controller.state.get().board?.title ?? '',
        labelOf: (item) => controller.getColumn(item.id)?.title ?? item.id,
        messages: {
          lifted: (name, pos, total) => t('kanban.dnd.columnLifted', { name, pos, total }),
          moved: (name, pos, total) => t('kanban.dnd.columnMoved', { name, pos, total }),
          dropped: (name, pos, total) => t('kanban.dnd.columnDropped', { name, pos, total }),
          cancelled: (name) => t('kanban.dnd.cancelled', { name }),
        },
        restoreFocus: (id) => {
          requestAnimationFrame(() => {
            const el = columnEls().find((c) => c.column?.id === id);
            el?.renderRoot.querySelector<HTMLElement>('.grip')?.focus();
          });
        },
        onMove: async (move) => {
          await controller.moveColumn(move.itemId, move.toIndex).catch(fail);
        },
      }),
    );
  }

  // ---------- view ----------
  #buildView(controller: BoardController): KanbanView {
    const config = this.#config as KanbanConfigValue;
    const api = this.#api as KanbanApi;
    const board = controller.state.get().board;
    const members = api.runtime.get().members;
    const today = isoDay(this.ctx.clock.now());
    const editor = this.ctx.services.get('editor') !== undefined || this.ctx.appId === 'default';
    const key = [
      this.t('kanban.card.role'),
      board?.labels,
      members,
      this.readonly,
      config,
      today,
      editor,
      this.renderCardFooter,
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
      today,
      readonly: this.readonly,
      density: config.density,
      fields: config.cardFields,
      customFields: config.customFields,
      members,
      labels: board?.labels ?? [],
      allow: config.allow,
      wipLimits: config.wipLimits,
      instance: this.#tessera,
      editor,
      renderCardFooter: this.renderCardFooter,
    };
    return this.#view;
  }

  // ---------- handlers ----------
  #onAddCard = async (e: CustomEvent<{ columnId: string; title: string }>): Promise<void> => {
    try {
      await this.controller?.addCard(e.detail.columnId, { title: e.detail.title });
    } catch (error) {
      if (!(error as { code?: string }).code?.startsWith('FORBIDDEN'))
        toast(this.ctx, { kind: 'error', message: (error as Error).message });
      else toast(this.ctx, { kind: 'warning', message: (error as Error).message });
    }
  };

  #onColumnUpdate = (
    e: CustomEvent<{
      id: string;
      patch: { title?: string; wipLimit?: number | undefined; color?: Column['color'] };
    }>,
  ): void => {
    const c = this.controller;
    if (!c) return;
    const { id, patch } = e.detail;
    const run = async (): Promise<void> => {
      if (patch.title !== undefined) await c.renameColumn(id, patch.title);
      if ('wipLimit' in patch) await c.setWipLimit(id, patch.wipLimit ?? null);
      if ('color' in patch) await c.updateColumn(id, { color: patch.color });
    };
    run().catch((error: unknown) =>
      toast(this.ctx, { kind: 'error', message: (error as Error).message }),
    );
  };

  #onColumnDelete = (e: CustomEvent<{ id: string; moveCardsTo?: string }>): void => {
    this.controller
      ?.deleteColumn(e.detail.id, e.detail.moveCardsTo ? { moveCardsTo: e.detail.moveCardsTo } : {})
      .catch((error: unknown) =>
        toast(this.ctx, { kind: 'error', message: (error as Error).message }),
      );
  };

  #onCardUpdate = (e: CustomEvent<{ id: string; patch: Partial<Card> }>): void => {
    this.controller
      ?.updateCard(e.detail.id, e.detail.patch)
      .catch((error: unknown) =>
        toast(this.ctx, { kind: 'error', message: (error as Error).message }),
      );
  };

  #deleteCard = async (id: string): Promise<void> => {
    const c = this.controller;
    const card = c?.getCard(id);
    if (!c || !card) return;
    if (!this.emit('card-delete', { card }, { cancelable: true })) return;
    this.deleteId = undefined;
    if (this.openCardId === id) this.openCardId = undefined;
    await c
      .deleteCard(id)
      .catch((error: unknown) =>
        toast(this.ctx, { kind: 'error', message: (error as Error).message }),
      );
  };

  #onScroll = (): void => {
    cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = requestAnimationFrame(() => {
      const board = this.renderRoot.querySelector<HTMLElement>('.board');
      const cols = [...this.renderRoot.querySelectorAll<HTMLElement>('tessera-kanban-column')];
      if (!board) return;
      const left = board.getBoundingClientRect().left;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const [i, col] of cols.entries()) {
        const distance = Math.abs(col.getBoundingClientRect().left - left);
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      }
      this.activeColumn = best;
    });
  };

  #showColumn(index: number): void {
    const cols = this.renderRoot.querySelectorAll<HTMLElement>('tessera-kanban-column');
    cols[index]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    this.activeColumn = index;
  }

  // ---------- rendering ----------
  #renderPicker(api: KanbanApi): unknown {
    const canCreate = api.config.allow.createBoard && !this.readonly;
    return html`<div class="picker">
      <h2 style="margin:0">${this.t('kanban.boards')}</h2>
      ${this.failure ? html`<p role="alert">${this.failure}</p>` : nothing}
      ${
        this.boards.length
          ? html`<ul>${this.boards.map((b) => html`<li><button type="button" @click=${() => (this.selected = b.id)}>${b.title}</button></li>`)}</ul>`
          : html`<p class="muted">${this.t('kanban.noBoards')}</p>`
      }
      ${
        canCreate
          ? html`<form @submit=${async (e: Event) => {
              e.preventDefault();
              const title = this.newBoard.trim();
              if (!title) return;
              try {
                const created = await api.createBoard({ title });
                this.newBoard = '';
                this.boards = [...this.boards, created];
                this.selected = created.id;
              } catch (error) {
                this.failure = (error as Error).message;
              }
            }}>
              <input type="text" aria-label=${this.t('kanban.newBoard')} placeholder=${this.t('kanban.newBoard')} maxlength="120" .value=${this.newBoard} @input=${(e: Event) => (this.newBoard = (e.target as HTMLInputElement).value)} />
              <tessera-button type="submit" variant="primary">${this.t('kanban.createBoard')}</tessera-button>
            </form>`
          : nothing
      }
    </div>`;
  }

  protected override renderFeature(): unknown {
    const api = this.#api;
    if (!api) return nothing;
    if (!this.#activeBoard) return this.#renderPicker(api);
    const controller = this.controller;
    if (!controller) {
      return this.failure
        ? html`<p role="alert">${this.failure}</p>`
        : html`<tessera-spinner label=${this.t('ui.loading')}></tessera-spinner>`;
    }

    const state = this.observe(controller.state);
    const history = this.observe(controller.history.state);
    const view = this.#buildView(controller);
    const filterOn = isFilterActive(state.filter);
    const open = this.openCardId ? controller.getCard(this.openCardId) : undefined;
    const pendingDelete = this.deleteId ? controller.getCard(this.deleteId) : undefined;
    const narrow = this.hasAttribute('narrow');

    return html`<div class="root" tabindex="-1" @kb-card-add=${this.#onAddCard} @kb-column-update=${this.#onColumnUpdate} @kb-column-delete=${this.#onColumnDelete}
      @kb-open=${(e: CustomEvent<{ id: string }>) => this.openCard(e.detail.id)}
      @kb-delete=${(e: CustomEvent<{ id: string }>) => (this.deleteId = e.detail.id)}
      @kb-filter=${(e: CustomEvent<{ patch: Parameters<BoardController['setFilter']>[0] }>) => controller.setFilter(e.detail.patch)}>
      <div class="toolbar">
        ${
          this.board
            ? html`<h2>${state.board?.title ?? ''}</h2>`
            : html`<tessera-button size="sm" variant="ghost" @click=${() => {
                this.selected = undefined;
                this.#teardown();
              }}><tessera-icon name="chevron-left"></tessera-icon>${this.t('kanban.boards')}</tessera-button><h2>${state.board?.title ?? ''}</h2>`
        }
        <tessera-icon-button size="sm" icon="undo" label=${history.undoLabel ? this.t('kanban.undoAction', { action: this.t(history.undoLabel) }) : this.t('kanban.undo')} ?disabled=${!history.canUndo} @click=${() => void controller.history.undo()}></tessera-icon-button>
        <tessera-icon-button size="sm" icon="redo" label=${history.redoLabel ? this.t('kanban.redoAction', { action: this.t(history.redoLabel) }) : this.t('kanban.redo')} ?disabled=${!history.canRedo} @click=${() => void controller.history.redo()}></tessera-icon-button>
        <slot name="toolbar-end"></slot>
        ${api.config.filters ? html`<tessera-kanban-filters exportparts="filters" .filter=${state.filter} .view=${view}></tessera-kanban-filters>` : nothing}
      </div>
      ${
        narrow && state.columns.length > 1
          ? html`<nav class="tabs" aria-label=${this.t('kanban.columns')}>
              ${state.columns.map((c, i) => html`<button type="button" aria-current=${i === this.activeColumn ? 'true' : 'false'} @click=${() => this.#showColumn(i)}>${c.title} <span class="muted">${state.cardCounts.get(c.id) ?? 0}</span></button>`)}
            </nav>`
          : nothing
      }
      <div class="board" part="board" @scroll=${this.#onScroll}>
        ${repeat(
          state.columns,
          (c) => c.id,
          (column) => html`<tessera-kanban-column
            exportparts="column,column-header,add-card,card"
            .column=${column}
            .cards=${state.cardsByColumn.get(column.id) ?? []}
            .count=${state.cardCounts.get(column.id) ?? 0}
            .otherColumns=${state.columns.filter((c) => c.id !== column.id)}
            .filtered=${filterOn}
            .view=${view}
          ></tessera-kanban-column>`,
        )}
        ${
          state.columns.length === 0 && !state.loading
            ? html`<slot name="empty"><p class="muted">${this.t('kanban.noColumns')}</p></slot>`
            : nothing
        }
        ${
          !this.readonly && api.config.allow.createColumn
            ? html`<div class="add-column">
                <form @submit=${async (e: Event) => {
                  e.preventDefault();
                  const input = (e.currentTarget as HTMLFormElement).querySelector(
                    'input',
                  ) as HTMLInputElement;
                  const title = input.value.trim();
                  if (!title) return;
                  input.value = '';
                  await controller
                    .addColumn(title)
                    .catch((error: unknown) =>
                      toast(this.ctx, { kind: 'error', message: (error as Error).message }),
                    );
                  this.updateComplete.then(() =>
                    this.renderRoot
                      .querySelector('.board')
                      ?.scrollTo({ left: 99999, behavior: 'smooth' }),
                  );
                }}>
                  <input type="text" aria-label=${this.t('kanban.column.new')} placeholder=${this.t('kanban.column.new')} maxlength="60" />
                  <tessera-button type="submit" size="sm">${this.t('kanban.column.add')}</tessera-button>
                </form>
              </div>`
            : nothing
        }
      </div>
      <tessera-kanban-card-dialog
        .view=${view}
        .card=${open}
        .columnName=${open ? (controller.getColumn(open.columnId)?.title ?? '') : ''}
        .open=${open !== undefined}
        @kb-card-update=${this.#onCardUpdate}
        @kb-card-delete=${(e: CustomEvent<{ id: string }>) => void this.#deleteCard(e.detail.id)}
        @kb-card-archive=${(e: CustomEvent<{ id: string }>) => {
          this.openCardId = undefined;
          void controller.archiveCard(e.detail.id);
        }}
        @kb-label-add=${(e: CustomEvent<{ name: string; color: Card['coverColor'] & string }>) => void controller.addLabel(e.detail)}
        @kb-label-delete=${(e: CustomEvent<{ id: string }>) => void controller.deleteLabel(e.detail.id)}
        @kb-dialog-close=${() => (this.openCardId = undefined)}
      ></tessera-kanban-card-dialog>
      <tessera-dialog
        heading=${this.t('kanban.card.deleteTitle')}
        .open=${pendingDelete !== undefined}
        @dialog-close=${() => (this.deleteId = undefined)}
      >
        <p>${pendingDelete ? this.t('kanban.card.deleteBody', { title: pendingDelete.title }) : ''}</p>
        <tessera-button slot="footer" variant="ghost" @click=${() => (this.deleteId = undefined)}>${this.t('kanban.cancel')}</tessera-button>
        <tessera-button slot="footer" variant="danger" @click=${() => this.deleteId && void this.#deleteCard(this.deleteId)}>${this.t('kanban.card.delete')}</tessera-button>
      </tessera-dialog>
      <div class="ghost-layer" aria-hidden="true"></div>
      <div class="visually-hidden" role="status" aria-live="assertive">${this.#announcement}</div>
    </div>`;
  }

  /** Test hook: the open card dialog. */
  get dialog(): TesseraKanbanCardDialog | null {
    return this.renderRoot.querySelector<TesseraKanbanCardDialog>('tessera-kanban-card-dialog');
  }
}

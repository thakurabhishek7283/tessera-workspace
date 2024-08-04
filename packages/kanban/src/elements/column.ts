import { baseStyles, focusRing, visuallyHidden } from '@tessera/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { type Card, type Column, TOKEN_COLORS, type TokenColor } from '../schemas.js';
import type { TesseraKanbanCard } from './card.js';
import { colorStyles } from './styles.js';
import type { KanbanView } from './view.js';

let uid = 0;

/**
 * One column: header, cards and the add-card composer.
 *
 * @fires kb-card-add - `{ columnId, title }`
 * @fires kb-column-update - `{ id, patch }`
 * @fires kb-column-delete - `{ id, moveCardsTo? }`
 * @csspart column @csspart column-header @csspart add-card
 */
export class TesseraKanbanColumn extends LitElement {
  static override properties: PropertyDeclarations = {
    column: { attribute: false },
    cards: { attribute: false },
    count: { type: Number },
    otherColumns: { attribute: false },
    filtered: { type: Boolean },
    view: { attribute: false },
    editing: { state: true },
    composing: { state: true },
    settingsOpen: { state: true },
    draft: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    colorStyles,
    css`
      :host {
        display: block;
        flex: 0 0 var(--tessera-kanban-column-width, 18rem);
        min-width: 0;
        scroll-snap-align: start;
      }
      :host([data-dragging]) .column {
        opacity: 0.4;
        border-style: dashed;
      }
      :host([data-drop-before]) {
        margin-inline-start: var(--dnd-item-width, 0px);
      }
      :host([data-drop-end]) {
        margin-inline-end: var(--dnd-item-width, 0px);
      }
      .column {
        display: flex;
        flex-direction: column;
        max-height: 100%;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        background: var(--tessera-color-surface);
        border-top: 4px solid var(--c, var(--tessera-color-border));
      }
      header {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: var(--tessera-space-2) var(--tessera-space-2) var(--tessera-space-2) var(--tessera-space-3);
      }
      .grip {
        all: unset;
        display: inline-flex;
        align-items: center;
        padding: 4px 2px;
        border-radius: var(--tessera-radius-sm);
        color: var(--tessera-color-text-muted);
        cursor: grab;
        touch-action: none;
      }
      .grip:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      h2 {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: var(--tessera-font-size-md);
      }
      h2 button,
      h2 span {
        all: unset;
        display: block;
        padding: 2px var(--tessera-space-1);
        border-radius: var(--tessera-radius-sm);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      h2 button {
        cursor: text;
      }
      h2 button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      h2 input {
        width: 100%;
        min-height: 28px;
        font: inherit;
        font-weight: 700;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-focus-ring);
        border-radius: var(--tessera-radius-sm);
        padding: 0 var(--tessera-space-1);
      }
      .count {
        flex: none;
        padding: 0 var(--tessera-space-2);
        border-radius: var(--tessera-radius-full);
        background: var(--tessera-color-surface-2);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-xs);
        font-weight: 600;
      }
      .count.full {
        background: var(--tessera-color-warning);
        color: var(--tessera-color-bg);
      }
      .count.over {
        background: var(--tessera-color-danger);
        color: var(--tessera-color-bg);
      }
      .cards {
        display: flex;
        flex-direction: column;
        gap: var(--tessera-space-2);
        min-height: 56px;
        padding: var(--tessera-space-1) var(--tessera-space-2) var(--tessera-space-2);
        overflow-y: auto;
        flex: 1;
        border-radius: var(--tessera-radius-md);
        margin: 0 var(--tessera-space-1);
      }
      .cards[data-drop-target] {
        outline: 2px dashed var(--tessera-color-primary);
        outline-offset: -2px;
      }
      .none {
        padding: var(--tessera-space-3);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
        text-align: center;
      }
      footer {
        padding: var(--tessera-space-1) var(--tessera-space-2) var(--tessera-space-2);
      }
      .add {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        width: 100%;
        padding: var(--tessera-space-2);
        border-radius: var(--tessera-radius-md);
        color: var(--tessera-color-text-muted);
        cursor: pointer;
      }
      .add:hover {
        background: var(--tessera-color-surface-2);
        color: var(--tessera-color-text);
      }
      .add:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      form {
        display: grid;
        gap: var(--tessera-space-2);
      }
      textarea {
        width: 100%;
        min-height: 56px;
        resize: vertical;
        padding: var(--tessera-space-2);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      textarea:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      .row {
        display: flex;
        gap: var(--tessera-space-2);
        align-items: center;
      }
      :host([collapsed]) {
        flex-basis: 3.25rem;
      }
      :host([collapsed]) .cards,
      :host([collapsed]) footer {
        display: none;
      }
      :host([collapsed]) header {
        flex-direction: column;
        padding: var(--tessera-space-2);
      }
      :host([collapsed]) h2 {
        writing-mode: vertical-rl;
        max-height: 14rem;
      }
      .settings {
        display: grid;
        gap: var(--tessera-space-3);
      }
      .settings label {
        display: grid;
        gap: var(--tessera-space-1);
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
      }
      .settings input,
      .settings select {
        min-height: 36px;
        padding: 0 var(--tessera-space-3);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      .settings fieldset {
        margin: 0;
        padding: 0;
        border: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
      }
      .settings legend {
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
        margin-bottom: var(--tessera-space-1);
        padding: 0;
      }
      .swatch {
        all: unset;
        box-sizing: border-box;
        width: 28px;
        height: 28px;
        border-radius: var(--tessera-radius-full);
        background: var(--c);
        cursor: pointer;
        border: 2px solid var(--tessera-color-bg);
        box-shadow: 0 0 0 1px var(--tessera-color-border);
      }
      .swatch[aria-pressed='true'] {
        box-shadow: 0 0 0 2px var(--tessera-color-text);
      }
      .swatch:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 2px;
      }
      .swatch.none-color {
        background: var(--tessera-color-bg);
      }
    `,
  ];

  column: Column | undefined;
  cards: Card[] = [];
  /** All non-archived cards in the column, ignoring any filter. */
  count = 0;
  /** The other columns, for "move cards to" when deleting. */
  otherColumns: Column[] = [];
  filtered = false;
  view: KanbanView | undefined;
  editing = false;
  composing = false;
  settingsOpen = false;
  draft = '';

  readonly #id = `kb-col-${++uid}`;

  /** The scrolling list the sortable treats as a container. */
  get list(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('.cards');
  }

  /** The cards in display order, for the sortable. */
  cardItems(): Array<{ id: string; el: HTMLElement }> {
    return [...this.renderRoot.querySelectorAll<TesseraKanbanCard>('tessera-kanban-card')].map(
      (el) => ({
        id: el.card?.id ?? '',
        el,
      }),
    );
  }

  /** Opens the add-card composer and focuses it. */
  openComposer(): void {
    if (this.view?.readonly || !this.view?.allow.createCard) return;
    this.composing = true;
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
    );
  }

  protected override willUpdate(): void {
    if (this.column) {
      this.toggleAttribute('collapsed', this.column.collapsed === true);
      this.setAttribute('role', 'group');
      this.setAttribute('aria-label', this.column.title);
    }
  }

  #emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #rename = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const title = input.value.trim();
    this.editing = false;
    if (this.column && title && title !== this.column.title) {
      this.#emit('kb-column-update', { id: this.column.id, patch: { title } });
    }
  };

  #submitCard = (event: Event): void => {
    event.preventDefault();
    const title = this.draft.trim();
    if (!title || !this.column) return;
    this.#emit('kb-card-add', { columnId: this.column.id, title });
    this.draft = '';
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
    );
  };

  #composerKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) this.#submitCard(event);
    else if (event.key === 'Escape') {
      event.stopPropagation();
      this.composing = false;
      this.draft = '';
    }
  };

  #saveSettings = (event: Event): void => {
    event.preventDefault();
    const column = this.column;
    if (!column) return;
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const limitRaw = String(data.get('limit') ?? '').trim();
    const limit = limitRaw === '' ? undefined : Math.max(1, Math.floor(Number(limitRaw)));
    const patch: { title?: string; wipLimit?: number | undefined } = {};
    if (title && title !== column.title) patch.title = title;
    if (limit !== column.wipLimit && !Number.isNaN(limit ?? 0)) patch.wipLimit = limit;
    if (Object.keys(patch).length) this.#emit('kb-column-update', { id: column.id, patch });
    this.settingsOpen = false;
  };

  #setColor(color: TokenColor | undefined): void {
    if (this.column) this.#emit('kb-column-update', { id: this.column.id, patch: { color } });
  }

  #delete = (): void => {
    const column = this.column;
    if (!column) return;
    const form = this.renderRoot.querySelector<HTMLFormElement>(`#${this.#id}-form`);
    const moveCardsTo = form
      ? String(new FormData(form).get('move') ?? '') || undefined
      : undefined;
    this.#emit('kb-column-delete', { id: column.id, ...(moveCardsTo ? { moveCardsTo } : {}) });
    this.settingsOpen = false;
  };

  #renderSettings(column: Column, view: KanbanView): unknown {
    const canDelete = view.allow.deleteColumn;
    return html`<tessera-dialog
      heading=${view.t('kanban.column.settings')}
      .open=${this.settingsOpen}
      @dialog-close=${() => {
        this.settingsOpen = false;
      }}
    >
      <form class="settings" @submit=${this.#saveSettings} id=${`${this.#id}-form`}>
        <label>${view.t('kanban.column.title')}
          <input name="title" .value=${column.title} maxlength="60" required ?disabled=${!view.allow.renameColumn} />
        </label>
        <label>${view.t('kanban.column.limit')}
          <input name="limit" type="number" min="1" step="1" .value=${column.wipLimit === undefined ? '' : String(column.wipLimit)} placeholder=${view.t('kanban.column.noLimit')} ?disabled=${!view.allow.renameColumn} />
        </label>
        <fieldset>
          <legend>${view.t('kanban.column.color')}</legend>
          <button type="button" class="swatch none-color" aria-label=${view.t('kanban.color.none')} aria-pressed=${column.color === undefined ? 'true' : 'false'} @click=${() => this.#setColor(undefined)}></button>
          ${TOKEN_COLORS.map(
            (c) =>
              html`<button type="button" class="swatch" data-color=${c} aria-label=${view.t(`kanban.color.${c}`)} aria-pressed=${column.color === c ? 'true' : 'false'} @click=${() => this.#setColor(c)}></button>`,
          )}
        </fieldset>
        ${
          canDelete
            ? html`<label>${view.t('kanban.column.deleteCards')}
                <select name="move">
                  <option value="">${view.t('kanban.column.deleteWithCards')}</option>
                  ${this.otherColumns.map((c) => html`<option value=${c.id}>${view.t('kanban.column.moveTo', { name: c.title })}</option>`)}
                </select>
              </label>`
            : nothing
        }
      </form>
      <tessera-button slot="footer" variant="ghost" @click=${() => (this.settingsOpen = false)}>${view.t('kanban.cancel')}</tessera-button>
      ${canDelete ? html`<tessera-button slot="footer" variant="danger" @click=${this.#delete}>${view.t('kanban.column.delete')}</tessera-button>` : nothing}
      <tessera-button slot="footer" variant="primary" @click=${(e: Event) => ((e.target as HTMLElement).getRootNode() as ShadowRoot).querySelector<HTMLFormElement>(`#${this.#id}-form`)?.requestSubmit()}>${view.t('kanban.save')}</tessera-button>
    </tessera-dialog>`;
  }

  protected override render(): unknown {
    const column = this.column;
    const view = this.view;
    if (!column || !view) return nothing;
    const limit = view.wipLimits ? column.wipLimit : undefined;
    const full = limit !== undefined && this.count >= limit;
    const over = limit !== undefined && this.count > limit;
    const canEdit = !view.readonly && view.allow.renameColumn;
    const countLabel =
      limit !== undefined
        ? view.t('kanban.column.countLimit', { count: this.count, limit })
        : view.t('kanban.column.count', { count: this.count });
    const hasMenu = !view.readonly && (view.allow.renameColumn || view.allow.deleteColumn);

    return html`<section class="column" part="column" data-color=${column.color ?? ''}>
      <header part="column-header">
        ${
          !view.readonly && view.allow.reorderColumns
            ? html`<button type="button" class="grip" aria-label=${view.t('kanban.column.move', { name: column.title })} title=${view.t('kanban.column.move', { name: column.title })}><tessera-icon name="grip"></tessera-icon></button>`
            : nothing
        }
        <h2>
          ${
            this.editing
              ? html`<input
                  .value=${column.title}
                  maxlength="60"
                  aria-label=${view.t('kanban.column.title')}
                  @blur=${this.#rename}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    else if (e.key === 'Escape') {
                      e.stopPropagation();
                      this.editing = false;
                    }
                  }}
                />`
              : canEdit
                ? html`<button type="button" title=${view.t('kanban.column.rename')} @click=${() => {
                    this.editing = true;
                    void this.updateComplete.then(() => {
                      const input = this.renderRoot.querySelector<HTMLInputElement>('h2 input');
                      input?.focus();
                      input?.select();
                    });
                  }}>${column.title}</button>`
                : html`<span>${column.title}</span>`
          }
        </h2>
        <span class=${classMap({ count: true, full, over })} aria-label=${countLabel + (full ? `, ${view.t('kanban.column.atLimit')}` : '')}>${limit !== undefined ? `${this.count} / ${limit}` : this.count}</span>
        ${
          hasMenu
            ? html`<tessera-icon-button size="sm" icon="more-horizontal" label=${view.t('kanban.column.settingsFor', { name: column.title })} @click=${() => (this.settingsOpen = true)}></tessera-icon-button>`
            : nothing
        }
      </header>
      <div class="cards" role="list" aria-label=${column.title} data-column=${column.id}>
        ${repeat(
          this.cards,
          (c) => c.id,
          (card) => html`<tessera-kanban-card .card=${card} .view=${view}></tessera-kanban-card>`,
        )}
        ${this.cards.length === 0 ? html`<div class="none" aria-hidden="true">${this.filtered ? view.t('kanban.column.noMatches') : view.t('kanban.column.empty')}</div>` : nothing}
      </div>
      ${
        !view.readonly && view.allow.createCard
          ? html`<footer part="add-card">
              ${
                this.composing
                  ? html`<form @submit=${this.#submitCard}>
                      <textarea
                        .value=${this.draft}
                        placeholder=${view.t('kanban.card.titlePlaceholder')}
                        aria-label=${view.t('kanban.card.newIn', { name: column.title })}
                        maxlength="200"
                        @input=${(e: Event) => (this.draft = (e.target as HTMLTextAreaElement).value)}
                        @keydown=${this.#composerKey}
                      ></textarea>
                      <div class="row">
                        <tessera-button size="sm" variant="primary" type="submit">${view.t('kanban.card.add')}</tessera-button>
                        <tessera-button size="sm" variant="ghost" @click=${() => {
                          this.composing = false;
                          this.draft = '';
                        }}>${view.t('kanban.cancel')}</tessera-button>
                      </div>
                    </form>`
                  : html`<button type="button" class="add" @click=${() => this.openComposer()}><tessera-icon name="plus"></tessera-icon>${view.t('kanban.card.addCard')}</button>`
              }
            </footer>`
          : nothing
      }
      ${hasMenu ? this.#renderSettings(column, view) : nothing}
    </section>`;
  }
}

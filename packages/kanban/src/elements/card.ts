import { baseStyles, focusRing, visuallyHidden } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import type { Card } from '../schemas.js';
import { chipStyles, colorStyles } from './styles.js';
import type { KanbanView } from './view.js';

const parseDay = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/**
 * One card on the board.
 *
 * @fires kb-open - `{ id }` on click or Enter
 * @fires kb-delete - `{ id }` on Delete
 * @csspart card @csspart title @csspart labels @csspart meta
 */
export class TesseraKanbanCard extends LitElement {
  static override properties: PropertyDeclarations = {
    card: { attribute: false },
    view: { attribute: false },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    colorStyles,
    chipStyles,
    css`
      :host {
        display: block;
        outline: none;
      }
      :host(:focus-visible) .card {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 2px;
      }
      :host([data-dragging]) .card {
        opacity: 0.35;
        border-style: dashed;
      }
      :host([data-drop-before]) {
        margin-top: var(--dnd-item-height, 0px);
      }
      :host([data-drop-end]) {
        margin-bottom: var(--dnd-item-height, 0px);
      }
      .card {
        position: relative;
        display: grid;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-3);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-bg);
        box-shadow: var(--tessera-shadow-sm);
        cursor: pointer;
        overflow: hidden;
      }
      :host([density='compact']) .card {
        padding: var(--tessera-space-2);
        gap: var(--tessera-space-1);
      }
      .card:hover {
        background: var(--tessera-color-surface);
      }
      .cover {
        height: 6px;
        margin: calc(var(--tessera-space-3) * -1) calc(var(--tessera-space-3) * -1) 0;
        background: var(--c);
      }
      .labels {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1);
      }
      .title {
        margin: 0;
        font-size: var(--tessera-font-size-md);
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-xs);
      }
      .meta .item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .due.overdue {
        color: var(--tessera-color-danger);
        font-weight: 700;
      }
      .done {
        color: var(--tessera-color-success);
      }
      .spacer {
        margin-inline-start: auto;
      }
      .custom {
        padding: 0 var(--tessera-space-1);
        border-radius: var(--tessera-radius-sm);
        background: var(--tessera-color-surface-2);
      }
      tessera-icon {
        --tessera-icon-size: 14px;
      }
    `,
  ];

  card: Card | undefined;
  view: KanbanView | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.tabIndex = 0;
    this.setAttribute('role', 'listitem');
    this.setAttribute('aria-roledescription', this.view?.t('kanban.card.role') ?? 'draggable card');
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKey);
  }

  /** A copy for the drag ghost: same data, no listeners. */
  cloneForGhost(): TesseraKanbanCard {
    const ghost = document.createElement('tessera-kanban-card') as TesseraKanbanCard;
    ghost.card = this.card;
    ghost.view = this.view;
    ghost.setAttribute('density', this.getAttribute('density') ?? 'comfortable');
    return ghost;
  }

  #onClick = (event: Event): void => {
    if (!this.card) return;
    if (event.composedPath().some((n) => n instanceof Element && n.hasAttribute('data-no-open')))
      return;
    this.dispatchEvent(
      new CustomEvent('kb-open', { detail: { id: this.card.id }, bubbles: true, composed: true }),
    );
  };

  #onKey = (event: KeyboardEvent): void => {
    if (!this.card || event.target !== this) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent('kb-open', { detail: { id: this.card.id }, bubbles: true, composed: true }),
      );
    } else if (event.key === 'Delete' && !this.view?.readonly) {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent('kb-delete', {
          detail: { id: this.card.id },
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  protected override willUpdate(): void {
    if (this.card) this.setAttribute('aria-label', this.card.title);
    if (this.view) this.setAttribute('density', this.view.density);
  }

  protected override render(): unknown {
    const card = this.card;
    const view = this.view;
    if (!card || !view) return nothing;
    const labels = card.labelIds
      .map((id) => view.labels.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => l !== undefined);
    const assignees = card.assigneeIds
      .map((id) => view.members.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);
    const done = card.checklist.filter((c) => c.done).length;
    const overdue = card.dueDate !== undefined && card.dueDate < view.today;
    const custom = view.customFields.filter(
      (f) => f.showOnCard && card.custom?.[f.key] !== undefined,
    );

    return html`<article class="card" part="card">
      ${card.coverColor ? html`<div class="cover" data-color=${card.coverColor} part="cover"></div>` : nothing}
      ${
        labels.length
          ? html`<div class="labels" part="labels">
              ${labels.map((l) => html`<span class="chip" data-color=${l.color}>${l.name}</span>`)}
            </div>`
          : nothing
      }
      <h3 class="title" part="title">${card.title}</h3>
      <div class="meta" part="meta">
        ${
          card.dueDate
            ? html`<span class=${classMap({ item: true, due: true, overdue })} title=${overdue ? view.t('kanban.card.overdue') : view.t('kanban.card.due')}>
                <tessera-icon name=${overdue ? 'alert' : 'calendar'}></tessera-icon>
                <span>${view.formatDate(parseDay(card.dueDate), { month: 'short', day: 'numeric' })}</span>
                ${overdue ? html`<span class="visually-hidden">${view.t('kanban.card.overdue')}</span>` : nothing}
              </span>`
            : nothing
        }
        ${
          card.description
            ? html`<span class="item" title=${view.t('kanban.card.hasDescription')}><tessera-icon name="note"></tessera-icon></span>`
            : nothing
        }
        ${
          card.checklist.length
            ? html`<span class=${classMap({ item: true, done: done === card.checklist.length })} title=${view.t('kanban.card.checklist')}>
                <tessera-icon name="check"></tessera-icon>${done}/${card.checklist.length}
              </span>`
            : nothing
        }
        ${card.estimate !== undefined ? html`<span class="item" title=${view.t('kanban.field.estimate')}>${card.estimate}</span>` : nothing}
        ${custom.map((f) => html`<span class="custom" title=${f.label}>${String(card.custom?.[f.key])}</span>`)}
        ${
          assignees.length
            ? html`<tessera-avatar-stack class="spacer" .users=${assignees} max="3" size="sm"></tessera-avatar-stack>`
            : nothing
        }
      </div>
      ${view.renderCardFooter ? html`<div class="footer" part="footer">${view.renderCardFooter(card)}</div>` : nothing}
    </article>`;
  }
}

import { baseStyles, focusRing } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { isFilterActive, type KanbanFilter } from '../filter.js';
import { chipStyles, colorStyles } from './styles.js';
import type { KanbanView } from './view.js';

/**
 * The filter bar: text search plus label, assignee and due-date filters.
 *
 * @fires kb-filter - `{ patch: Partial<KanbanFilter> }`
 * @csspart filters
 */
export class TesseraKanbanFilters extends LitElement {
  static override properties: PropertyDeclarations = {
    filter: { attribute: false },
    view: { attribute: false },
    open: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    colorStyles,
    chipStyles,
    css`
      :host {
        display: block;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .search {
        position: relative;
        flex: 1 1 12rem;
        max-width: 20rem;
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
      input:focus-visible,
      select:focus-visible,
      .toggle:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      .panel {
        display: grid;
        gap: var(--tessera-space-3);
        margin-top: var(--tessera-space-2);
        padding: var(--tessera-space-3);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-surface);
      }
      fieldset {
        margin: 0;
        padding: 0;
        border: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
        align-items: center;
      }
      legend {
        float: left;
        margin-inline-end: var(--tessera-space-2);
        padding: 0;
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
      }
      .toggle {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font: inherit;
        color: inherit;
        background: none;
        cursor: pointer;
        border-radius: var(--tessera-radius-full);
        border: 2px solid transparent;
      }
      .toggle.chip {
        padding: 1px var(--tessera-space-2);
        background: color-mix(in srgb, var(--c, var(--tessera-color-text-muted)) 16%, var(--tessera-color-bg));
      }
      .toggle[aria-pressed='true'] {
        border-color: var(--tessera-color-text);
      }
      .toggle.member {
        display: inline-flex;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: 2px var(--tessera-space-2) 2px 2px;
        background: var(--tessera-color-surface-2);
        font-size: var(--tessera-font-size-sm);
      }
      select {
        min-height: 32px;
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: 0 var(--tessera-space-2);
      }
      .hint {
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
    `,
  ];

  filter: KanbanFilter | undefined;
  view: KanbanView | undefined;
  open = false;

  /** Moves focus to the search box (the `/` shortcut). */
  focusSearch(): void {
    this.renderRoot.querySelector<HTMLInputElement>('input[type=search]')?.focus();
  }

  #emit(patch: Partial<KanbanFilter>): void {
    this.dispatchEvent(
      new CustomEvent('kb-filter', { detail: { patch }, bubbles: true, composed: true }),
    );
  }

  #toggle(list: readonly string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  protected override render(): unknown {
    const filter = this.filter;
    const view = this.view;
    if (!filter || !view) return nothing;
    const active = isFilterActive(filter);
    const extra =
      filter.labelIds.length + filter.assigneeIds.length + (filter.due !== 'any' ? 1 : 0);
    return html`<div part="filters">
      <div class="bar">
        <div class="search">
          <tessera-icon name="search"></tessera-icon>
          <input
            type="search"
            .value=${filter.text}
            placeholder=${view.t('kanban.filter.search')}
            aria-label=${view.t('kanban.filter.search')}
            @input=${(e: Event) => this.#emit({ text: (e.target as HTMLInputElement).value })}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Escape' && filter.text) {
                e.stopPropagation();
                this.#emit({ text: '' });
              }
            }}
          />
        </div>
        <tessera-button
          size="sm"
          variant=${extra ? 'primary' : 'secondary'}
          aria-expanded=${this.open ? 'true' : 'false'}
          @click=${() => (this.open = !this.open)}
        >
          <tessera-icon name="filter"></tessera-icon>${view.t('kanban.filter.filters')}${extra ? ` (${extra})` : ''}
        </tessera-button>
        ${
          active
            ? html`<tessera-button size="sm" variant="ghost" @click=${() => this.#emit({ text: '', labelIds: [], assigneeIds: [], due: 'any' })}>${view.t('kanban.filter.clear')}</tessera-button>`
            : nothing
        }
      </div>
      ${
        this.open
          ? html`<div class="panel">
              <fieldset>
                <legend>${view.t('kanban.filter.labels')}</legend>
                ${
                  view.labels.length
                    ? view.labels.map(
                        (l) =>
                          html`<button type="button" class="toggle chip" data-color=${l.color} aria-pressed=${filter.labelIds.includes(l.id) ? 'true' : 'false'} @click=${() => this.#emit({ labelIds: this.#toggle(filter.labelIds, l.id) })}>${l.name}</button>`,
                      )
                    : html`<span class="hint">${view.t('kanban.filter.noLabels')}</span>`
                }
              </fieldset>
              <fieldset>
                <legend>${view.t('kanban.filter.assignees')}</legend>
                ${
                  view.members.length
                    ? view.members.map(
                        (m) =>
                          html`<button type="button" class="toggle member" aria-pressed=${filter.assigneeIds.includes(m.id) ? 'true' : 'false'} @click=${() => this.#emit({ assigneeIds: this.#toggle(filter.assigneeIds, m.id) })}><tessera-avatar size="sm" name=${m.name} .src=${m.avatarUrl} .color=${m.color}></tessera-avatar>${m.name}</button>`,
                      )
                    : html`<span class="hint">${view.t('kanban.filter.noMembers')}</span>`
                }
              </fieldset>
              <fieldset>
                <legend><label for="due">${view.t('kanban.filter.due')}</label></legend>
                <select id="due" .value=${filter.due} @change=${(e: Event) => this.#emit({ due: (e.target as HTMLSelectElement).value as KanbanFilter['due'] })}>
                  <option value="any">${view.t('kanban.filter.dueAny')}</option>
                  <option value="overdue">${view.t('kanban.filter.dueOverdue')}</option>
                  <option value="week">${view.t('kanban.filter.dueWeek')}</option>
                  <option value="none">${view.t('kanban.filter.dueNone')}</option>
                </select>
              </fieldset>
            </div>`
          : nothing
      }
    </div>`;
  }
}

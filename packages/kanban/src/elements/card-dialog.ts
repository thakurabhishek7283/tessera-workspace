import { isRichDocEmpty, type RichDoc, richDocFromText, toPlainText } from '@tessera-kit/editor';
import { baseStyles, focusRing, visuallyHidden } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Card, ChecklistItem, Label, TokenColor } from '../schemas.js';
import { TOKEN_COLORS } from '../schemas.js';
import { version } from '../version.js';
import { chipStyles, colorStyles } from './styles.js';
import type { KanbanView } from './view.js';

let uid = 0;

/**
 * The card detail dialog. Every edit is sent as it is made (`kb-card-update`), so it joins the
 * board's undo history and shows up for other viewers.
 *
 * @fires kb-card-update - `{ id, patch }`
 * @fires kb-card-delete - `{ id }`
 * @fires kb-card-archive - `{ id }`
 * @fires kb-label-add - `{ name, color }`
 * @fires kb-label-delete - `{ id }`
 * @fires kb-dialog-close
 */
export class TesseraKanbanCardDialog extends LitElement {
  static tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    card: { attribute: false },
    columnName: {},
    view: { attribute: false },
    open: { type: Boolean },
    confirmDelete: { state: true },
    newItem: { state: true },
    newLabel: { state: true },
    newColor: { state: true },
    labelsOpen: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    colorStyles,
    chipStyles,
    css`
      :host {
        display: contents;
      }
      tessera-dialog::part(dialog) {
        width: min(46rem, calc(100vw - 2rem));
      }
      .grid {
        display: grid;
        gap: var(--tessera-space-4);
      }
      .two {
        display: grid;
        gap: var(--tessera-space-4);
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      }
      .title {
        width: 100%;
        font: inherit;
        font-size: var(--tessera-font-size-xl);
        font-weight: 700;
        color: var(--tessera-color-text);
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--tessera-radius-md);
        padding: var(--tessera-space-1) var(--tessera-space-2);
        margin-inline: calc(var(--tessera-space-2) * -1);
      }
      .title:hover {
        border-color: var(--tessera-color-border);
      }
      .title:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible,
      button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      .sub {
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
      section h3,
      .field > span,
      legend {
        margin: 0 0 var(--tessera-space-1);
        font-size: var(--tessera-font-size-sm);
        font-weight: 700;
      }
      fieldset {
        margin: 0;
        padding: 0;
        border: 0;
      }
      legend {
        padding: 0;
      }
      .field {
        display: grid;
        gap: var(--tessera-space-1);
      }
      input[type='text'],
      input[type='date'],
      input[type='number'],
      select,
      textarea {
        min-height: 36px;
        padding: 0 var(--tessera-space-3);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        max-width: 100%;
      }
      textarea {
        padding: var(--tessera-space-2) var(--tessera-space-3);
        min-height: 7rem;
        width: 100%;
        resize: vertical;
      }
      input:disabled,
      select:disabled,
      textarea:disabled {
        opacity: 0.7;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
        align-items: center;
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
      .toggle[disabled] {
        cursor: default;
      }
      .toggle.member {
        display: inline-flex;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: 2px var(--tessera-space-3) 2px 2px;
        background: var(--tessera-color-surface-2);
      }
      .swatch {
        all: unset;
        box-sizing: border-box;
        width: 28px;
        height: 28px;
        border-radius: var(--tessera-radius-full);
        background: var(--c);
        cursor: pointer;
        box-shadow: 0 0 0 1px var(--tessera-color-border);
      }
      .swatch[aria-pressed='true'] {
        box-shadow: 0 0 0 2px var(--tessera-color-text);
      }
      .swatch.none-color {
        background: var(--tessera-color-bg);
      }
      ul.checklist {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--tessera-space-1);
      }
      ul.checklist li {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      ul.checklist li input[type='text'] {
        flex: 1;
        min-width: 0;
      }
      li.done input[type='text'] {
        text-decoration: line-through;
        color: var(--tessera-color-text-muted);
      }
      progress {
        width: 100%;
        height: 8px;
        accent-color: var(--tessera-color-success);
      }
      details {
        margin-top: var(--tessera-space-2);
      }
      summary {
        cursor: pointer;
        font-size: var(--tessera-font-size-sm);
      }
      .editor-host {
        border-radius: var(--tessera-radius-md);
      }
    `,
  ];

  card: Card | undefined;
  columnName = '';
  view: KanbanView | undefined;
  open = false;
  confirmDelete = false;
  newItem = '';
  newLabel = '';
  newColor: TokenColor = 'blue';
  labelsOpen = false;

  readonly #id = `kb-dlg-${++uid}`;
  /** The description as the editor last knew it, so our own edits do not reset the cursor. */
  #descValue: RichDoc | undefined;
  #descKey = '';
  #descCard = '';
  #confirmTimer: ReturnType<typeof setTimeout> | undefined;

  protected override willUpdate(): void {
    const card = this.card;
    if (!card) return;
    const key = JSON.stringify(card.description ?? null);
    if (card.id !== this.#descCard || key !== this.#descKey) {
      this.#descCard = card.id;
      this.#descKey = key;
      this.#descValue = card.description;
    }
  }

  #update(patch: Partial<Card>): void {
    if (!this.card) return;
    this.dispatchEvent(
      new CustomEvent('kb-card-update', {
        detail: { id: this.card.id, patch },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #emit<T>(name: string, detail?: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #toggle(list: readonly string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  #changeDescription(doc: RichDoc): void {
    const next = isRichDocEmpty(doc) ? undefined : doc;
    // Remember what we sent: the echo from the store is then recognised as our own edit.
    this.#descKey = JSON.stringify(next ?? null);
    this.#update({ description: next });
  }

  #checklist(update: (items: ChecklistItem[]) => ChecklistItem[]): void {
    if (!this.card) return;
    this.#update({ checklist: update([...this.card.checklist]) });
  }

  #deleteClick = (): void => {
    if (!this.card) return;
    if (this.confirmDelete) {
      clearTimeout(this.#confirmTimer);
      this.confirmDelete = false;
      this.#emit('kb-card-delete', { id: this.card.id });
      return;
    }
    this.confirmDelete = true;
    this.#confirmTimer = setTimeout(() => {
      this.confirmDelete = false;
    }, 4000);
  };

  #close = (): void => {
    this.confirmDelete = false;
    this.#emit('kb-dialog-close');
  };

  #addItem = (event: Event): void => {
    event.preventDefault();
    const text = this.newItem.trim();
    if (!text) return;
    this.newItem = '';
    this.#checklist((items) => [...items, { id: crypto.randomUUID(), text, done: false }]);
  };

  #addLabel = (event: Event): void => {
    event.preventDefault();
    const name = this.newLabel.trim();
    if (!name) return;
    this.newLabel = '';
    this.#emit('kb-label-add', { name, color: this.newColor });
  };

  #renderDescription(card: Card, view: KanbanView, disabled: boolean): unknown {
    if (view.editor) {
      return html`<tessera-editor
        class="editor-host"
        .tessera=${view.instance}
        .value=${this.#descValue}
        ?readonly=${disabled}
        label=${view.t('kanban.field.description')}
        placeholder=${view.t('kanban.field.descriptionPlaceholder')}
        toolbar="bold,italic,underline,|,bullet-list,ordered-list,task-list,|,link,code-block"
        @change=${(e: CustomEvent<{ value: { json: RichDoc } }>) => this.#changeDescription(e.detail.value.json)}
      ></tessera-editor>`;
    }
    return html`<textarea
      aria-label=${view.t('kanban.field.description')}
      placeholder=${view.t('kanban.field.descriptionPlaceholder')}
      ?disabled=${disabled}
      .value=${card.description ? toPlainText(card.description) : ''}
      @change=${(e: Event) => {
        const text = (e.target as HTMLTextAreaElement).value;
        this.#changeDescription(text.trim() ? richDocFromText(text) : { type: 'doc' });
      }}
    ></textarea>`;
  }

  #renderLabels(card: Card, view: KanbanView, disabled: boolean): unknown {
    return html`<fieldset>
      <legend>${view.t('kanban.field.labels')}</legend>
      <div class="row">
        ${view.labels.map(
          (l: Label) =>
            html`<button type="button" class="toggle chip" data-color=${l.color} aria-pressed=${card.labelIds.includes(l.id) ? 'true' : 'false'} ?disabled=${disabled} @click=${() => this.#update({ labelIds: this.#toggle(card.labelIds, l.id) })}>${l.name}</button>`,
        )}
        ${view.labels.length === 0 ? html`<span class="sub">${view.t('kanban.label.none')}</span>` : nothing}
      </div>
      ${
        disabled
          ? nothing
          : html`<details ?open=${this.labelsOpen} @toggle=${(e: Event) => (this.labelsOpen = (e.target as HTMLDetailsElement).open)}>
              <summary>${view.t('kanban.label.manage')}</summary>
              <form class="row" @submit=${this.#addLabel}>
                <input type="text" aria-label=${view.t('kanban.label.name')} placeholder=${view.t('kanban.label.name')} maxlength="40" .value=${this.newLabel} @input=${(e: Event) => (this.newLabel = (e.target as HTMLInputElement).value)} />
                <select aria-label=${view.t('kanban.field.color')} .value=${this.newColor} @change=${(e: Event) => (this.newColor = (e.target as HTMLSelectElement).value as TokenColor)}>
                  ${TOKEN_COLORS.map((c) => html`<option value=${c} ?selected=${c === this.newColor}>${view.t(`kanban.color.${c}`)}</option>`)}
                </select>
                <tessera-button size="sm" type="submit">${view.t('kanban.label.add')}</tessera-button>
              </form>
              <div class="row" style="margin-top: var(--tessera-space-2)">
                ${view.labels.map(
                  (l) =>
                    html`<span class="chip" data-color=${l.color}>${l.name}<button type="button" class="toggle" aria-label=${view.t('kanban.label.delete', { name: l.name })} @click=${() => this.#emit('kb-label-delete', { id: l.id })}><tessera-icon name="x"></tessera-icon></button></span>`,
                )}
              </div>
            </details>`
      }
    </fieldset>`;
  }

  #renderChecklist(card: Card, view: KanbanView, disabled: boolean): unknown {
    const done = card.checklist.filter((c) => c.done).length;
    return html`<section>
      <h3>${view.t('kanban.field.checklist')} ${card.checklist.length ? html`<span class="sub">${done}/${card.checklist.length}</span>` : nothing}</h3>
      ${card.checklist.length ? html`<progress max=${card.checklist.length} value=${done} aria-label=${view.t('kanban.field.checklist')}></progress>` : nothing}
      <ul class="checklist">
        ${repeat(
          card.checklist,
          (i) => i.id,
          (item, index) => html`<li class=${item.done ? 'done' : ''}>
            <input type="checkbox" aria-label=${view.t('kanban.checklist.done', { text: item.text })} .checked=${item.done} ?disabled=${disabled} @change=${(e: Event) => this.#checklist((items) => items.map((x) => (x.id === item.id ? { ...x, done: (e.target as HTMLInputElement).checked } : x)))} />
            <input type="text" aria-label=${view.t('kanban.checklist.item')} maxlength="200" .value=${item.text} ?disabled=${disabled} @change=${(
              e: Event,
            ) => {
              const text = (e.target as HTMLInputElement).value.trim();
              this.#checklist((items) =>
                text
                  ? items.map((x) => (x.id === item.id ? { ...x, text } : x))
                  : items.filter((x) => x.id !== item.id),
              );
            }} />
            ${
              disabled
                ? nothing
                : html`<tessera-icon-button size="sm" icon="arrow-up" label=${view.t('kanban.checklist.up')} ?disabled=${index === 0} @click=${() => this.#checklist((items) => swap(items, index, index - 1))}></tessera-icon-button>
                  <tessera-icon-button size="sm" icon="arrow-down" label=${view.t('kanban.checklist.down')} ?disabled=${index === card.checklist.length - 1} @click=${() => this.#checklist((items) => swap(items, index, index + 1))}></tessera-icon-button>
                  <tessera-icon-button size="sm" icon="trash" label=${view.t('kanban.checklist.remove')} @click=${() => this.#checklist((items) => items.filter((x) => x.id !== item.id))}></tessera-icon-button>`
            }
          </li>`,
        )}
      </ul>
      ${
        disabled
          ? nothing
          : html`<form class="row" @submit=${this.#addItem} style="margin-top: var(--tessera-space-2)">
              <input type="text" style="flex:1" aria-label=${view.t('kanban.checklist.new')} placeholder=${view.t('kanban.checklist.new')} maxlength="200" .value=${this.newItem} @input=${(e: Event) => (this.newItem = (e.target as HTMLInputElement).value)} />
              <tessera-button size="sm" type="submit">${view.t('kanban.checklist.add')}</tessera-button>
            </form>`
      }
    </section>`;
  }

  #renderCustom(card: Card, view: KanbanView, disabled: boolean): unknown {
    const set = (key: string, value: string | number | boolean | undefined): void => {
      const custom = { ...(card.custom ?? {}) };
      if (value === undefined || value === '') delete custom[key];
      else custom[key] = value;
      this.#update({ custom: Object.keys(custom).length ? custom : undefined });
    };
    return view.customFields.map((f) => {
      const id = `${this.#id}-${f.key}`;
      const current = card.custom?.[f.key];
      return html`<div class="field">
        <label for=${id}><span>${f.label}</span></label>
        ${
          f.type === 'boolean'
            ? html`<input id=${id} type="checkbox" .checked=${current === true} ?disabled=${disabled} @change=${(e: Event) => set(f.key, (e.target as HTMLInputElement).checked)} />`
            : f.type === 'select'
              ? html`<select id=${id} ?disabled=${disabled} @change=${(e: Event) => set(f.key, (e.target as HTMLSelectElement).value)}>
                  <option value="">—</option>
                  ${(f.options ?? []).map((o) => html`<option value=${o} ?selected=${current === o}>${o}</option>`)}
                </select>`
              : html`<input id=${id} type=${f.type === 'number' ? 'number' : 'text'} .value=${current === undefined ? '' : String(current)} ?disabled=${disabled} @change=${(
                  e: Event,
                ) => {
                  const v = (e.target as HTMLInputElement).value;
                  set(f.key, f.type === 'number' && v !== '' ? Number(v) : v);
                }} />`
        }
      </div>`;
    });
  }

  protected override render(): unknown {
    const card = this.card;
    const view = this.view;
    if (!view) return nothing;
    const disabled = view.readonly;
    const has = (f: (typeof view.fields)[number]): boolean => view.fields.includes(f);
    const author = card?.createdBy
      ? view.members.find((m) => m.id === card.createdBy)?.name
      : undefined;

    return html`<tessera-dialog
      .tessera=${view.instance}
      .open=${this.open && card !== undefined}
      heading=${card ? view.t('kanban.card.in', { name: this.columnName }) : ''}
      @dialog-close=${this.#close}
    >
      ${
        card
          ? html`<div class="grid">
              <input class="title" type="text" aria-label=${view.t('kanban.field.title')} maxlength="200" .value=${card.title} ?disabled=${disabled}
                @change=${(e: Event) => {
                  const input = e.target as HTMLInputElement;
                  const title = input.value.trim();
                  if (title) this.#update({ title });
                  else input.value = card.title;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }} />
              ${has('description') ? html`<section><h3>${view.t('kanban.field.description')}</h3>${this.#renderDescription(card, view, disabled)}</section>` : nothing}
              ${has('labels') ? this.#renderLabels(card, view, disabled) : nothing}
              ${
                has('assignees')
                  ? html`<fieldset>
                      <legend>${view.t('kanban.field.assignees')}</legend>
                      <div class="row">
                        ${view.members.map((m) => html`<button type="button" class="toggle member" aria-pressed=${card.assigneeIds.includes(m.id) ? 'true' : 'false'} ?disabled=${disabled} @click=${() => this.#update({ assigneeIds: this.#toggle(card.assigneeIds, m.id) })}><tessera-avatar size="sm" name=${m.name} .src=${m.avatarUrl} .color=${m.color}></tessera-avatar>${m.name}</button>`)}
                        ${view.members.length === 0 ? html`<span class="sub">${view.t('kanban.assignee.none')}</span>` : nothing}
                      </div>
                    </fieldset>`
                  : nothing
              }
              ${
                has('dueDate') || has('startDate') || has('estimate')
                  ? html`<div class="two">
                      ${has('startDate') ? html`<div class="field"><label for=${`${this.#id}-start`}><span>${view.t('kanban.field.startDate')}</span></label><input id=${`${this.#id}-start`} type="date" .value=${card.startDate ?? ''} ?disabled=${disabled} @change=${(e: Event) => this.#update({ startDate: (e.target as HTMLInputElement).value || undefined })} /></div>` : nothing}
                      ${has('dueDate') ? html`<div class="field"><label for=${`${this.#id}-due`}><span>${view.t('kanban.field.dueDate')}</span></label><input id=${`${this.#id}-due`} type="date" .value=${card.dueDate ?? ''} ?disabled=${disabled} @change=${(e: Event) => this.#update({ dueDate: (e.target as HTMLInputElement).value || undefined })} /></div>` : nothing}
                      ${
                        has('estimate')
                          ? html`<div class="field"><label for=${`${this.#id}-est`}><span>${view.t('kanban.field.estimate')}</span></label><input id=${`${this.#id}-est`} type="number" min="0" step="any" .value=${card.estimate === undefined ? '' : String(card.estimate)} ?disabled=${disabled} @change=${(
                              e: Event,
                            ) => {
                              const v = (e.target as HTMLInputElement).value;
                              this.#update({
                                estimate: v === '' ? undefined : Math.max(0, Number(v)),
                              });
                            }} /></div>`
                          : nothing
                      }
                    </div>`
                  : nothing
              }
              ${has('checklist') ? this.#renderChecklist(card, view, disabled) : nothing}
              ${
                has('coverColor')
                  ? html`<fieldset>
                      <legend>${view.t('kanban.field.cover')}</legend>
                      <div class="row">
                        <button type="button" class="swatch none-color" aria-label=${view.t('kanban.color.none')} aria-pressed=${card.coverColor === undefined ? 'true' : 'false'} ?disabled=${disabled} @click=${() => this.#update({ coverColor: undefined })}></button>
                        ${TOKEN_COLORS.map((c) => html`<button type="button" class="swatch" data-color=${c} aria-label=${view.t(`kanban.color.${c}`)} aria-pressed=${card.coverColor === c ? 'true' : 'false'} ?disabled=${disabled} @click=${() => this.#update({ coverColor: c })}></button>`)}
                      </div>
                    </fieldset>`
                  : nothing
              }
              ${view.customFields.length ? html`<div class="two">${this.#renderCustom(card, view, disabled)}</div>` : nothing}
              <p class="sub">
                ${view.t('kanban.activity.created', { date: view.formatDate(card.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) })}${author ? ` · ${author}` : ''}
                · ${view.t('kanban.activity.updated', { date: view.formatDate(card.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
              </p>
            </div>`
          : nothing
      }
      ${
        card && !disabled
          ? html`
            ${view.allow.deleteCard ? html`<tessera-button slot="footer" variant="danger" @click=${this.#deleteClick}>${this.confirmDelete ? view.t('kanban.card.confirmDelete') : view.t('kanban.card.delete')}</tessera-button>` : nothing}
            <tessera-button slot="footer" @click=${() => this.#emit('kb-card-archive', { id: card.id })}>${view.t('kanban.card.archive')}</tessera-button>`
          : nothing
      }
      <tessera-button slot="footer" variant="primary" @click=${() => this.#close()}>${view.t('kanban.close')}</tessera-button>
    </tessera-dialog>`;
  }
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  const x = next[a] as T;
  next[a] = next[b] as T;
  next[b] = x;
  return next;
}

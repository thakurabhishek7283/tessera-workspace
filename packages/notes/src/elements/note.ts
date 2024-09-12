import { isRichDocEmpty, type RichDoc, richDocFromText, toPlainText } from '@tessera/editor';
import { baseStyles, focusRing } from '@tessera/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { MIN_HEIGHT, MIN_WIDTH, NOTE_COLORS, type Note, type NoteColor } from '../schemas.js';
import type { NotesView } from './view.js';

const COLOR_HUES: Record<NoteColor, string> = {
  yellow: '#eab308',
  pink: '#ec4899',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#f97316',
  gray: '#94a3b8',
};

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One sticky note. On the free canvas it is dragged by its header and resized from the corner;
 * pressing Enter (or clicking the text) edits it in place.
 *
 * @fires nt-update - `{ id, patch }`
 * @fires nt-move - `{ id, x, y }` when a drag or an arrow key moved it
 * @fires nt-resize - `{ id, w, h }`
 * @fires nt-raise - `{ id }` when it should come to the front
 * @fires nt-edit-start / nt-edit-end - `{ id }`
 * @fires nt-pin / nt-archive / nt-unarchive / nt-delete - `{ id }`
 * @csspart note @csspart header @csspart body @csspart footer
 */
export class TesseraNote extends LitElement {
  static override properties: PropertyDeclarations = {
    note: { attribute: false },
    view: { attribute: false },
    editing: { type: Boolean },
    geometry: { state: true },
    colorsOpen: { state: true },
    tagDraft: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
        outline: none;
        --_hue: var(--tessera-color-border);
      }
      :host([layout='grid']) {
        break-inside: avoid;
        margin-bottom: var(--tessera-space-3);
      }
      :host([layout='free']) {
        position: absolute;
      }
      :host(:focus-visible) .note,
      :host(:focus-within) .note {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 2px;
      }
      :host([dragging]) .note {
        box-shadow: var(--tessera-shadow-lg);
      }
      .note {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 7.5rem;
        border: 1px solid color-mix(in srgb, var(--_hue) 55%, var(--tessera-color-border));
        border-radius: var(--tessera-radius-md);
        background: color-mix(in srgb, var(--_hue) 26%, var(--tessera-color-bg));
        color: var(--tessera-color-text);
        box-shadow: var(--tessera-shadow-sm);
        overflow: hidden;
      }
      header {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px var(--tessera-space-1);
        background: color-mix(in srgb, var(--_hue) 20%, transparent);
        min-height: 32px;
      }
      :host([layout='free']:not([readonly])) header {
        cursor: grab;
        touch-action: none;
      }
      :host([dragging]) header {
        cursor: grabbing;
      }
      .spacer {
        flex: 1;
      }
      .pin[aria-pressed='true'] {
        color: var(--tessera-color-primary);
      }
      .body {
        flex: 1;
        min-height: 0;
        padding: var(--tessera-space-2) var(--tessera-space-3);
        overflow: auto;
        cursor: text;
      }
      .empty {
        color: var(--tessera-color-text-muted);
      }
      tessera-editor {
        --tessera-editor-min-height: 4rem;
      }
      textarea {
        width: 100%;
        height: 100%;
        min-height: 5rem;
        resize: none;
        font: inherit;
        color: inherit;
        background: transparent;
        border: 0;
        outline: none;
      }
      footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: var(--tessera-space-1) var(--tessera-space-3) var(--tessera-space-2);
      }
      footer:empty {
        display: none;
      }
      .tag {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 0 var(--tessera-space-2);
        border-radius: var(--tessera-radius-full);
        background: color-mix(in srgb, var(--tessera-color-text) 12%, transparent);
        font-size: var(--tessera-font-size-xs);
      }
      .tag button {
        all: unset;
        cursor: pointer;
        display: inline-flex;
        border-radius: var(--tessera-radius-full);
      }
      .tag button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      footer input {
        flex: 1;
        min-width: 5rem;
        font: inherit;
        font-size: var(--tessera-font-size-xs);
        color: inherit;
        background: transparent;
        border: 0;
        border-bottom: 1px dashed var(--tessera-color-border);
        padding: 2px 0;
      }
      footer input:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      .resize {
        position: absolute;
        inset-inline-end: 0;
        inset-block-end: 0;
        width: 24px;
        height: 24px;
        cursor: nwse-resize;
        touch-action: none;
        background: linear-gradient(135deg, transparent 50%, var(--tessera-color-text-muted) 50% 58%, transparent 58% 72%, var(--tessera-color-text-muted) 72% 80%, transparent 80%);
      }
      .swatches {
        display: flex;
        gap: var(--tessera-space-2);
      }
      .swatch {
        all: unset;
        box-sizing: border-box;
        width: 24px;
        height: 24px;
        border-radius: var(--tessera-radius-full);
        background: var(--s);
        box-shadow: 0 0 0 1px var(--tessera-color-border);
        cursor: pointer;
      }
      .swatch[aria-pressed='true'] {
        box-shadow: 0 0 0 2px var(--tessera-color-text);
      }
      .swatch:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 2px;
      }
    `,
  ];

  note: Note | undefined;
  view: NotesView | undefined;
  editing = false;
  geometry: Geometry | undefined;
  colorsOpen = false;
  tagDraft = '';

  /** Set when Escape ends editing, so keyboard focus returns to the note itself. */
  #refocus = false;
  #pointer:
    | { id: number; startX: number; startY: number; origin: Geometry; mode: 'move' | 'resize' }
    | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.tabIndex = 0;
    this.setAttribute('role', 'listitem');
    this.addEventListener('keydown', this.#onKey);
    this.addEventListener('focusin', this.#raise);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this.#onKey);
    this.removeEventListener('focusin', this.#raise);
  }

  /** Focus the host so the arrow keys move the note again. */
  focusNote(): void {
    this.focus();
  }

  #emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #update(patch: Partial<Note>): void {
    if (this.note) this.#emit('nt-update', { id: this.note.id, patch });
  }

  #raise = (): void => {
    if (this.note && this.view?.layout === 'free') this.#emit('nt-raise', { id: this.note.id });
  };

  #startEdit(): void {
    if (!this.note || this.view?.readonly || this.editing) return;
    this.#emit('nt-edit-start', { id: this.note.id });
  }

  #endEdit(refocus = false): void {
    if (!this.note || !this.editing) return;
    this.#refocus = refocus;
    this.#emit('nt-edit-end', { id: this.note.id });
  }

  #onKey = (event: KeyboardEvent): void => {
    const note = this.note;
    const view = this.view;
    if (!note || !view || event.target !== this) return;
    if (event.key === 'Enter' && !view.readonly) {
      event.preventDefault();
      this.#startEdit();
    } else if (event.key === 'Delete' && !view.readonly) {
      event.preventDefault();
      this.#emit('nt-delete', { id: note.id });
    } else if (view.layout === 'free' && !view.readonly && event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = event.shiftKey ? 32 : 8;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      this.#emit('nt-move', {
        id: note.id,
        x: Math.max(0, note.x + dx),
        y: Math.max(0, note.y + dy),
      });
    }
  };

  // ---------- pointer: drag by header, resize from the corner ----------
  #begin(event: PointerEvent, mode: 'move' | 'resize'): void {
    const note = this.note;
    if (!note || this.view?.readonly || this.view?.layout !== 'free' || event.button !== 0) return;
    if (
      mode === 'move' &&
      event
        .composedPath()
        .some((n) => n instanceof Element && n.matches('button, tessera-icon-button, input'))
    )
      return;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety (the drag keeps working off the element); synthetic events cannot have it.
    }
    this.#pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: note.x, y: note.y, w: note.w, h: note.h },
      mode,
    };
    this.setAttribute('dragging', '');
    this.#raise();
    event.preventDefault();
  }

  #track = (event: PointerEvent): void => {
    const p = this.#pointer;
    if (!p || event.pointerId !== p.id) return;
    const dx = event.clientX - p.startX;
    const dy = event.clientY - p.startY;
    this.geometry =
      p.mode === 'move'
        ? { ...p.origin, x: Math.max(0, p.origin.x + dx), y: Math.max(0, p.origin.y + dy) }
        : {
            ...p.origin,
            w: Math.max(MIN_WIDTH, p.origin.w + dx),
            h: Math.max(MIN_HEIGHT, p.origin.h + dy),
          };
  };

  #finish = (event: PointerEvent): void => {
    const p = this.#pointer;
    const note = this.note;
    if (!p || !note || event.pointerId !== p.id) return;
    this.#pointer = undefined;
    this.removeAttribute('dragging');
    const g = this.geometry;
    this.geometry = undefined;
    if (!g || event.type === 'pointercancel') return;
    if (p.mode === 'move' && (g.x !== note.x || g.y !== note.y))
      this.#emit('nt-move', { id: note.id, x: g.x, y: g.y });
    if (p.mode === 'resize' && (g.w !== note.w || g.h !== note.h))
      this.#emit('nt-resize', { id: note.id, w: g.w, h: g.h });
  };

  #resizeByKey = (event: KeyboardEvent): void => {
    const note = this.note;
    if (!note || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 32 : 8;
    const w = note.w + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
    const h = note.h + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0);
    this.#emit('nt-resize', { id: note.id, w: Math.max(MIN_WIDTH, w), h: Math.max(MIN_HEIGHT, h) });
  };

  // ---------- tags ----------
  #addTag(): void {
    const note = this.note;
    const tag = this.tagDraft.trim().replace(/,$/, '').trim();
    this.tagDraft = '';
    if (!note || !tag || note.tags.includes(tag)) return;
    this.#update({ tags: [...note.tags, tag] });
  }

  protected override willUpdate(): void {
    const note = this.note;
    const view = this.view;
    if (!note || !view) return;
    this.setAttribute('layout', view.layout);
    this.toggleAttribute('readonly', view.readonly);
    this.setAttribute(
      'aria-label',
      toPlainText(note.content).slice(0, 80) || view.t('notes.note.empty'),
    );
    this.style.setProperty('--_hue', COLOR_HUES[note.color]);
    if (view.layout === 'free') {
      const g = this.geometry ?? note;
      Object.assign(this.style, {
        left: `${g.x}px`,
        top: `${g.y}px`,
        width: `${g.w}px`,
        height: `${g.h}px`,
        zIndex: String(note.z + 1),
      });
    } else {
      for (const prop of ['left', 'top', 'width', 'height', 'zIndex'] as const)
        this.style[prop] = '';
    }
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('editing') && this.editing) {
      const editor = this.renderRoot.querySelector<
        HTMLElement & { editorReady?: Promise<{ focus(p?: 'end'): void }> }
      >('tessera-editor');
      if (editor?.editorReady) void editor.editorReady.then((h) => h.focus('end'));
      else this.renderRoot.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
    if (
      changed.has('editing') &&
      !this.editing &&
      changed.get('editing') === true &&
      this.#refocus
    ) {
      // The editor that had focus is gone; keep the keyboard on the note so arrow keys work.
      this.#refocus = false;
      this.focus();
    }
  }

  #renderBody(note: Note, view: NotesView): unknown {
    if (this.editing && view.editor) {
      return html`<tessera-editor
        part="editor"
        .tessera=${view.instance}
        .value=${note.content}
        toolbar=${view.toolbar.join(',')}
        label=${view.t('notes.note.edit')}
        placeholder=${view.t('notes.note.placeholder')}
        @change=${(e: CustomEvent<{ value: { json: RichDoc } }>) => this.#update({ content: e.detail.value.json })}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            this.#endEdit(true);
          }
        }}
        @focusout=${(e: FocusEvent) => {
          // Moving between the toolbar and the text keeps editing; leaving the note ends it.
          const next = e.relatedTarget as Node | null;
          if (!next || (!this.contains(next) && !this.renderRoot.contains(next)))
            queueMicrotask(() => this.#endEdit());
        }}
      ></tessera-editor>`;
    }
    if (this.editing) {
      return html`<textarea
        aria-label=${view.t('notes.note.edit')}
        .value=${toPlainText(note.content)}
        @change=${(e: Event) => {
          const text = (e.target as HTMLTextAreaElement).value;
          this.#update({ content: richDocFromText(text) });
        }}
        @blur=${() => this.#endEdit()}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            this.#endEdit(true);
          }
        }}
      ></textarea>`;
    }
    return isRichDocEmpty(note.content)
      ? html`<p class="empty">${view.readonly ? '' : view.t('notes.note.placeholder')}</p>`
      : html`<tessera-rich-text .doc=${note.content}></tessera-rich-text>`;
  }

  protected override render(): unknown {
    const note = this.note;
    const view = this.view;
    if (!note || !view) return nothing;
    const editable = !view.readonly;
    return html`<article class="note" part="note">
      <header
        part="header"
        @pointerdown=${(e: PointerEvent) => this.#begin(e, 'move')}
        @pointermove=${this.#track}
        @pointerup=${this.#finish}
        @pointercancel=${this.#finish}
      >
        ${
          editable && view.allow.pinning
            ? html`<tessera-icon-button class="pin" size="sm" icon="star" label=${note.pinned ? view.t('notes.note.unpin') : view.t('notes.note.pin')} @click=${() => this.#emit('nt-pin', { id: note.id })}></tessera-icon-button>`
            : note.pinned
              ? html`<tessera-icon name="star" label=${view.t('notes.note.pinned')}></tessera-icon>`
              : nothing
        }
        <span class="spacer"></span>
        ${
          editable
            ? html`<tessera-icon-button id="color" size="sm" icon="edit" label=${view.t('notes.note.color')} @click=${() => (this.colorsOpen = !this.colorsOpen)}></tessera-icon-button>
              <tessera-popover .anchor=${'#color'} .open=${this.colorsOpen} placement="bottom-end" @popover-close=${() => (this.colorsOpen = false)}>
                <div class="swatches" role="group" aria-label=${view.t('notes.note.color')}>
                  ${(view.colors.length ? view.colors : NOTE_COLORS).map(
                    (c) =>
                      html`<button type="button" class="swatch" style=${`--s:${COLOR_HUES[c]}`} aria-label=${view.t(`notes.color.${c}`)} aria-pressed=${note.color === c ? 'true' : 'false'} @click=${() => {
                        this.colorsOpen = false;
                        this.#update({ color: c });
                      }}></button>`,
                  )}
                </div>
              </tessera-popover>`
            : nothing
        }
        ${
          editable && view.allow.archive
            ? html`<tessera-icon-button size="sm" icon=${view.archived ? 'upload' : 'download'} label=${view.archived ? view.t('notes.note.restore') : view.t('notes.note.archive')} @click=${() => this.#emit(view.archived ? 'nt-unarchive' : 'nt-archive', { id: note.id })}></tessera-icon-button>`
            : nothing
        }
        ${editable ? html`<tessera-icon-button size="sm" icon="trash" label=${view.t('notes.note.delete')} @click=${() => this.#emit('nt-delete', { id: note.id })}></tessera-icon-button>` : nothing}
      </header>
      <div class="body" part="body" @click=${(e: Event) => {
        if (e.composedPath().some((n) => n instanceof HTMLAnchorElement)) return;
        this.#startEdit();
      }}>${this.#renderBody(note, view)}</div>
      <footer part="footer">
        ${note.tags.map(
          (tag) =>
            html`<span class="tag">${tag}${editable ? html`<button type="button" aria-label=${view.t('notes.tag.remove', { tag })} @click=${() => this.#update({ tags: note.tags.filter((t) => t !== tag) })}><tessera-icon name="x"></tessera-icon></button>` : nothing}</span>`,
        )}
        ${
          editable && view.allow.tags
            ? html`<input
                type="text"
                .value=${this.tagDraft}
                maxlength="40"
                placeholder=${view.t('notes.tag.add')}
                aria-label=${view.t('notes.tag.add')}
                @input=${(e: Event) => (this.tagDraft = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    this.#addTag();
                  } else if (e.key === 'Backspace' && !this.tagDraft && note.tags.length) {
                    this.#update({ tags: note.tags.slice(0, -1) });
                  }
                }}
                @blur=${() => this.#addTag()}
              />`
            : nothing
        }
      </footer>
      ${
        view.layout === 'free' && editable
          ? html`<div
              class="resize"
              role="button"
              tabindex="0"
              aria-label=${view.t('notes.note.resize')}
              @pointerdown=${(e: PointerEvent) => this.#begin(e, 'resize')}
              @pointermove=${this.#track}
              @pointerup=${this.#finish}
              @pointercancel=${this.#finish}
              @keydown=${this.#resizeByKey}
            ></div>`
          : nothing
      }
    </article>`;
  }
}

import { baseStyles } from '@tessera/elements';
import { type CSSResultGroup, css, html, LitElement, type PropertyDeclarations } from 'lit';

type Tab = 'editor' | 'notes' | 'kanban' | 'together';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'editor', label: 'Editor' },
  { id: 'notes', label: 'Notes' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'together', label: 'All together' },
];

/** The playground shell: one tab per kit. Each kit mounts into its own panel. */
export class PlaygroundApp extends LitElement {
  static override properties: PropertyDeclarations = { tab: { state: true } };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
        min-height: 100vh;
        background: var(--tessera-color-bg);
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-4);
        padding: var(--tessera-space-3) var(--tessera-space-4);
        border-bottom: 1px solid var(--tessera-color-border);
      }
      h1 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      nav {
        display: flex;
        gap: var(--tessera-space-1);
      }
      main {
        padding: var(--tessera-space-4);
      }
    `,
  ];

  tab: Tab = 'editor';

  protected override render(): unknown {
    return html`<tessera-root>
      <header>
        <h1>Tessera workspace</h1>
        <nav aria-label="Kits">
          ${TABS.map(
            (t) => html`<tessera-button
              size="sm"
              variant=${t.id === this.tab ? 'primary' : 'ghost'}
              aria-current=${t.id === this.tab ? 'page' : 'false'}
              @click=${() => {
                this.tab = t.id;
              }}
              >${t.label}</tessera-button
            >`,
          )}
        </nav>
      </header>
      <main id=${this.tab}></main>
    </tessera-root>`;
  }
}

if (!customElements.get('playground-app')) customElements.define('playground-app', PlaygroundApp);

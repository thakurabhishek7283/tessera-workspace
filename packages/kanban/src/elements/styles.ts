import { type CSSResult, css } from 'lit';

/** `data-color="red"` sets `--c` to that colour. Hues are tuned to work on both light and dark surfaces. */
export const colorStyles: CSSResult = css`
  [data-color='gray'] { --c: #64748b; }
  [data-color='red'] { --c: #dc2626; }
  [data-color='orange'] { --c: #ea580c; }
  [data-color='yellow'] { --c: #ca8a04; }
  [data-color='green'] { --c: #16a34a; }
  [data-color='teal'] { --c: #0d9488; }
  [data-color='blue'] { --c: #2563eb; }
  [data-color='purple'] { --c: #9333ea; }
  [data-color='pink'] { --c: #db2777; }
`;

export const chipStyles: CSSResult = css`
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 1px var(--tessera-space-2);
    border-radius: var(--tessera-radius-full);
    background: color-mix(in srgb, var(--c, var(--tessera-color-text-muted)) 16%, var(--tessera-color-bg));
    color: var(--tessera-color-text);
    font-size: var(--tessera-font-size-xs);
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip::before {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: var(--tessera-radius-full);
    background: var(--c, var(--tessera-color-text-muted));
  }
`;

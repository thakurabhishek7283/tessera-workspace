import { createStore, type Store } from '@tessera/core';
import type { Editor } from '@tiptap/core';
import type { PluginKey } from '@tiptap/pm/state';
import { exitSuggestion, type SuggestionOptions } from '@tiptap/suggestion';
import type { Rect, SuggestState } from '../types.js';

export interface SuggestController<T> {
  readonly store: Store<SuggestState<T> | null>;
  /** The `render` option for `Suggestion`/`Mention`. */
  render: NonNullable<SuggestionOptions<T, T>['render']>;
  pick(index: number): void;
  dismiss(editor: Editor): void;
}

const toRect = (rect: DOMRect | null | undefined): Rect =>
  rect
    ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    : { x: 0, y: 0, width: 0, height: 0 };

/**
 * Bridges Tiptap's suggestion plugin to a store the element can draw from. The editor handles
 * arrow keys, Enter, Tab and Escape so the menu works while focus stays in the text.
 */
export function createSuggestController<T>(key: PluginKey): SuggestController<T> {
  const store = createStore<SuggestState<T> | null>(null);
  let command: ((item: T) => void) | undefined;

  const open = (props: {
    query: string;
    items: T[];
    command: (item: T) => void;
    clientRect?: (() => DOMRect | null) | null;
  }): void => {
    command = props.command;
    const previous = store.get();
    const selected = previous
      ? Math.min(previous.selected, Math.max(0, props.items.length - 1))
      : 0;
    store.set({
      query: props.query,
      rect: toRect(props.clientRect?.()),
      items: props.items,
      selected,
    });
  };

  return {
    store,
    render: () => ({
      onStart: (props) => {
        open(props);
      },
      onUpdate: open,
      onExit: () => {
        command = undefined;
        store.set(null);
      },
      onKeyDown: ({ event }) => {
        const state = store.get();
        if (!state) return false;
        const count = state.items.length;
        switch (event.key) {
          case 'ArrowDown':
            if (count) store.set({ ...state, selected: (state.selected + 1) % count });
            return true;
          case 'ArrowUp':
            if (count) store.set({ ...state, selected: (state.selected - 1 + count) % count });
            return true;
          case 'Enter':
          case 'Tab': {
            const item = state.items[state.selected];
            if (!item) return false;
            command?.(item);
            return true;
          }
          default:
            // Escape is handled by the suggestion plugin itself, which then calls onExit.
            return false;
        }
      },
    }),
    pick(index) {
      const item = store.get()?.items[index];
      if (item !== undefined) command?.(item);
    },
    dismiss(editor) {
      exitSuggestion(editor.view, key);
    },
  };
}

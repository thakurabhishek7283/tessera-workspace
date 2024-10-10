import { registerIcons } from '@tessera/elements';

// 24×24 stroke icons (same style as the core set). Drawn for this kit.
const ICONS: Record<string, string> = {
  'editor-bold': '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  'editor-italic': '<path d="M10 5h8M6 19h8M14.5 5l-5 14"/>',
  'editor-underline': '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
  'editor-strike':
    '<path d="M4 12h16M16.5 7.5C15.8 6 14.2 5 12 5c-2.5 0-4.3 1.2-4.3 3.2 0 1.5 1 2.4 2.6 2.8M7.5 16.5C8.2 18 9.8 19 12 19c2.5 0 4.3-1.2 4.3-3.2 0-.6-.2-1.1-.5-1.5"/>',
  'editor-code': '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  'editor-highlight': '<path d="M14 4l6 6-8 8H7l-3-3 10-11zM4 21h16"/>',
  'editor-bullet-list':
    '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  'editor-ordered-list':
    '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v4M3.5 14.5c0-1 2.5-1 2.5 0 0 1-2.5 2-2.5 3h2.5"/>',
  'editor-task-list':
    '<rect x="3" y="4" width="6" height="6" rx="1"/><path d="M4.5 7l1.2 1.2L7.8 6M12 7h9M12 17h9"/><rect x="3" y="14" width="6" height="6" rx="1"/>',
  'editor-quote': '<path d="M5 17c0-4 1-7 4-9M13 17c0-4 1-7 4-9M4 17h5v-5H4zM12 17h5v-5h-5z"/>',
  'editor-heading': '<path d="M6 4v16M18 4v16M6 12h12"/>',
  'editor-paragraph': '<path d="M13 4v16M17 4v16M13 4H9a4 4 0 0 0 0 8h4"/>',
  'editor-align-left': '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  'editor-align-center': '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  'editor-align-right': '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  'editor-clear': '<path d="M5 5h9M9.5 5L8 14M4 20l16-16M12 20h8"/>',
};

/** Adds the editor's icons to the shared set. A function (not a bare import) so bundlers keep it. */
export function registerEditorIcons(): void {
  registerIcons(ICONS);
}

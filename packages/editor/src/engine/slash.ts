import type { SlashItem } from '../types.js';

/** Blocks offered by the `/` menu. Labels come from `editor.block.<id>` messages. */
export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: 'paragraph', icon: 'note', keywords: ['text', 'plain', 'paragraph'] },
  { id: 'heading-1', icon: 'note', keywords: ['title', 'h1', 'heading', 'large'] },
  { id: 'heading-2', icon: 'note', keywords: ['subtitle', 'h2', 'heading', 'medium'] },
  { id: 'heading-3', icon: 'note', keywords: ['h3', 'heading', 'small'] },
  {
    id: 'bullet-list',
    icon: 'editor-bullet-list',
    keywords: ['list', 'ul', 'bullets', 'unordered'],
  },
  {
    id: 'ordered-list',
    icon: 'editor-ordered-list',
    keywords: ['list', 'ol', 'numbers', 'numbered'],
  },
  {
    id: 'task-list',
    icon: 'editor-task-list',
    keywords: ['todo', 'checklist', 'tasks', 'checkbox'],
  },
  { id: 'blockquote', icon: 'editor-quote', keywords: ['quote', 'citation'] },
  { id: 'code-block', icon: 'editor-code', keywords: ['code', 'snippet', 'pre'] },
  { id: 'hr', icon: 'minus', keywords: ['divider', 'rule', 'line', 'separator'] },
  { id: 'image', icon: 'image', keywords: ['picture', 'photo', 'upload'] },
  { id: 'table', icon: 'columns', keywords: ['grid', 'rows', 'columns'] },
];

/** Items matching `query` by id or keyword, in menu order. */
export function filterSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (item) => item.id.includes(q) || item.keywords.some((keyword) => keyword.startsWith(q)),
  );
}

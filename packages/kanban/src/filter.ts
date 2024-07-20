import { toPlainText } from '@tessera/editor';
import type { Card } from './schemas.js';

export interface KanbanFilter {
  /** Case- and accent-insensitive match on title, description and checklist. */
  text: string;
  labelIds: string[];
  assigneeIds: string[];
  due: 'any' | 'overdue' | 'week' | 'none';
}

export const EMPTY_FILTER: KanbanFilter = { text: '', labelIds: [], assigneeIds: [], due: 'any' };

export const isFilterActive = (f: KanbanFilter): boolean =>
  f.text.trim() !== '' || f.labelIds.length > 0 || f.assigneeIds.length > 0 || f.due !== 'any';

/** Lower-cases and strips accents so "café" matches "cafe". */
export const normalize = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** `YYYY-MM-DD` for the day containing `ms`, in the user's time zone. */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return isoDay(new Date(y, m - 1, d + days).getTime());
};

/** True when the card passes every part of the filter. `now` is the current time in ms. */
export function matchesFilter(card: Card, filter: KanbanFilter, now: number): boolean {
  const text = normalize(filter.text.trim());
  if (text) {
    const haystack = normalize(
      [
        card.title,
        card.description ? toPlainText(card.description) : '',
        ...card.checklist.map((c) => c.text),
      ].join('\n'),
    );
    if (!haystack.includes(text)) return false;
  }
  if (filter.labelIds.length && !filter.labelIds.some((id) => card.labelIds.includes(id)))
    return false;
  if (
    filter.assigneeIds.length &&
    !filter.assigneeIds.some((id) => card.assigneeIds.includes(id))
  ) {
    return false;
  }
  if (filter.due !== 'any') {
    const today = isoDay(now);
    if (filter.due === 'none') return card.dueDate === undefined;
    if (card.dueDate === undefined) return false;
    if (filter.due === 'overdue') return card.dueDate < today;
    return card.dueDate >= today && card.dueDate <= addDays(today, 7);
  }
  return true;
}

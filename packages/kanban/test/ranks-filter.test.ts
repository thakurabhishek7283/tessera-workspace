import { describe, expect, it } from 'vitest';
import {
  addDays,
  type Card,
  EMPTY_FILTER,
  evenRanks,
  isFilterActive,
  isoDay,
  matchesFilter,
  rankBetween,
} from '../src/index.js';

describe('ranks', () => {
  it('finds keys between neighbours and at either end', () => {
    const [a, b] = evenRanks(2) as [string, string];
    const mid = rankBetween(a, b);
    expect(mid && a < mid && mid < b).toBe(true);
    expect((rankBetween(null, a) ?? a) < a).toBe(true);
    expect((rankBetween(b, null) ?? '') > b).toBe(true);
    expect(rankBetween(null, null)).toBeTruthy();
  });

  it('refuses equal or reversed neighbours instead of throwing', () => {
    expect(rankBetween('a1', 'a1')).toBeNull();
    expect(rankBetween('a2', 'a1')).toBeNull();
  });

  it('gives sorted, distinct even keys', () => {
    const keys = evenRanks(20);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(20);
    expect(evenRanks(0)).toEqual([]);
  });
});

const card = (over: Partial<Card> = {}): Card => ({
  id: 'c1',
  boardId: 'b',
  columnId: 'col',
  rank: 'a0',
  title: 'Café menu',
  labelIds: [],
  assigneeIds: [],
  checklist: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const NOW = new Date(2026, 2, 10, 12).getTime(); // 2026-03-10 local

describe('matchesFilter', () => {
  it('matches title, description and checklist ignoring case and accents', () => {
    const c = card({
      description: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Call the SUPPLIER' }] }],
      },
      checklist: [{ id: '1', text: 'Résumé review', done: false }],
    });
    for (const text of ['cafe', 'CAFÉ', 'supplier', 'resume']) {
      expect(matchesFilter(c, { ...EMPTY_FILTER, text }, NOW)).toBe(true);
    }
    expect(matchesFilter(c, { ...EMPTY_FILTER, text: 'banana' }, NOW)).toBe(false);
    expect(matchesFilter(c, { ...EMPTY_FILTER, text: '   ' }, NOW)).toBe(true);
  });

  it('matches when any chosen label or assignee is present', () => {
    const c = card({ labelIds: ['l1'], assigneeIds: ['u1'] });
    expect(matchesFilter(c, { ...EMPTY_FILTER, labelIds: ['l2', 'l1'] }, NOW)).toBe(true);
    expect(matchesFilter(c, { ...EMPTY_FILTER, labelIds: ['l2'] }, NOW)).toBe(false);
    expect(matchesFilter(c, { ...EMPTY_FILTER, assigneeIds: ['u2'] }, NOW)).toBe(false);
  });

  it('filters by due date', () => {
    const f = (due: 'overdue' | 'week' | 'none') => ({ ...EMPTY_FILTER, due });
    expect(matchesFilter(card({ dueDate: '2026-03-09' }), f('overdue'), NOW)).toBe(true);
    expect(matchesFilter(card({ dueDate: '2026-03-10' }), f('overdue'), NOW)).toBe(false);
    expect(matchesFilter(card({ dueDate: '2026-03-10' }), f('week'), NOW)).toBe(true);
    expect(matchesFilter(card({ dueDate: '2026-03-17' }), f('week'), NOW)).toBe(true);
    expect(matchesFilter(card({ dueDate: '2026-03-18' }), f('week'), NOW)).toBe(false);
    expect(matchesFilter(card(), f('week'), NOW)).toBe(false);
    expect(matchesFilter(card(), f('none'), NOW)).toBe(true);
    expect(matchesFilter(card({ dueDate: '2026-03-10' }), f('none'), NOW)).toBe(false);
  });

  it('knows when a filter is active', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, text: ' ' })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, due: 'week' })).toBe(true);
  });
});

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(isoDay(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });
});

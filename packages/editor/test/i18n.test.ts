import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de.js';
import { en } from '../src/i18n/en.js';

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

describe('German catalog', () => {
  it('has exactly the keys of the English one', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('uses the same {placeholders} in every message', () => {
    for (const [key, text] of Object.entries(en)) {
      expect(placeholders(de[key] ?? ''), key).toEqual(placeholders(text));
    }
  });

  it('has no empty messages', () => {
    for (const [key, text] of Object.entries(de)) expect(text.trim(), key).not.toBe('');
  });
});

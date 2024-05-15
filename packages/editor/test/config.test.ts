import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOLBAR, EditorConfig } from '../src/index.js';

describe('EditorConfig', () => {
  it('accepts { enabled: true } alone and fills every default', () => {
    const cfg = EditorConfig.parse({ enabled: true });
    expect(cfg.toolbar).toEqual(DEFAULT_TOOLBAR);
    expect(cfg).toMatchObject({
      bubbleMenu: true,
      slashCommands: true,
      markdownShortcuts: true,
      codeHighlight: true,
      tables: false,
      images: { enabled: true },
      links: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      mentions: { enabled: false },
    });
  });

  it('rejects unknown toolbar ids and bad limits', () => {
    expect(EditorConfig.safeParse({ enabled: true, toolbar: ['bold', 'sparkle'] }).success).toBe(
      false,
    );
    expect(EditorConfig.safeParse({ enabled: true, maxLength: 0 }).success).toBe(false);
  });
});

import { deepQuery } from '@tessera-internal/test-utils';

/** Everything the toast region currently says. */
export const toastRegionText = (): string =>
  deepQuery(document.body, 'tessera-toast-region')?.shadowRoot?.textContent?.replace(/\s+/g, ' ') ??
  '';

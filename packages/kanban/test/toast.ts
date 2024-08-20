import { deepQuery } from '@tessera-internal/test-utils';

/** Everything the toast region currently says. */
export const toastRegionText = (): string => {
  const region = deepQuery(document.body, 'tessera-toast-region');
  return region?.shadowRoot?.textContent?.replace(/\s+/g, ' ') ?? '';
};

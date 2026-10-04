import type { TesseraInstance, UserInfo } from '@tessera-kit/core';
import type { TemplateResult } from 'lit';
import type { CardField, CustomFieldConfig } from '../config.js';
import type { Card, Label } from '../schemas.js';

/**
 * Everything the internal elements (column, card, dialog, filters) need from the board. The board
 * builds a new object whenever one of these changes, so children simply re-render.
 */
export interface KanbanView {
  t(key: string, params?: Record<string, unknown>): string;
  formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions): string;
  /** Today as `YYYY-MM-DD`, for overdue badges. */
  today: string;
  readonly: boolean;
  density: 'comfortable' | 'compact';
  fields: readonly CardField[];
  customFields: readonly CustomFieldConfig[];
  members: readonly UserInfo[];
  labels: readonly Label[];
  allow: {
    createCard: boolean;
    deleteCard: boolean;
    renameColumn: boolean;
    deleteColumn: boolean;
    reorderColumns: boolean;
    createColumn: boolean;
    moveCard: boolean;
  };
  wipLimits: boolean;
  /** The instance the board runs on, handed on to elements that need it (the editor). */
  instance: TesseraInstance | undefined;
  /** True when the rich text editor can be used for descriptions. */
  editor: boolean;
  renderCardFooter?: ((card: Card) => TemplateResult | HTMLElement | string) | undefined;
}

export const colorOf = (view: Pick<KanbanView, 'members'>, id: string): UserInfo | undefined =>
  view.members.find((m) => m.id === id);

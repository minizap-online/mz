import type { InboxItem } from './types.js';
import type { InboxIntake, InboxScope } from './intake-types.js';
export const INBOX_CLASSIFICATIONS = [
  'unclassified',
  'idea',
  'bug',
  'feature',
  'feedback',
  'decision',
  'reference',
  'other',
] as const;
export type InboxClassification = (typeof INBOX_CLASSIFICATIONS)[number];
export interface InboxTriageChange {
  sequence: number;
  id: string;
  inboxItemId: string;
  revision: number;
  actorId: string;
  changedAt: string;
  classification: InboxClassification;
  scope: InboxScope;
  triaged: boolean;
  eventId: string;
}
export interface InboxDetails {
  sequence: number;
  item: InboxItem;
  intake: InboxIntake | null;
  classification: InboxClassification;
  scope: InboxScope;
  triaged: boolean;
  revision: number;
  lastChange: InboxTriageChange | null;
  sourceRef: string;
  summary: 'Summary pending';
  untrusted: true;
}
export interface InboxCursor {
  afterSequence?: number;
  limit?: number;
}
export interface InboxHistoryCursor extends InboxCursor {
  inboxItemId: string;
}
export interface TriageInboxItem {
  id: string;
  actorId: string;
  classification?: InboxClassification;
  scope?: InboxScope;
  triaged?: boolean;
  changedAt?: string;
}

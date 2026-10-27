export const MAX_INTAKE_BYTES = 1048576;
export type InboxScope =
  'unclassified' | 'company' | 'project-candidate' | `project:${string}`;
export interface NewInboxIntake {
  sourceType: 'file' | 'stdin';
  sourceBytes: number;
  scope?: InboxScope;
}
export interface InboxIntake {
  inboxItemId: string;
  sourceType: 'file' | 'stdin';
  sourceBytes: number;
  scope: InboxScope;
  createdBy: string;
  summaryStatus: 'pending';
}

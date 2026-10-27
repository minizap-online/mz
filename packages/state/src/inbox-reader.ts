import { readRuntimeDatabase } from './inspection.js';
import { getInboxDetails, listInbox, listInboxChanges } from './inbox.js';
import type {
  InboxCursor,
  InboxDetails,
  InboxHistoryCursor,
  InboxTriageChange,
} from './inbox-types.js';
import { record, uuid } from './records.js';
import { stateError } from './types.js';
export interface InboxListOptions extends InboxCursor {
  path: string;
}
export interface InboxInspectOptions {
  path: string;
  id: string;
}
export interface InboxChangesOptions extends InboxHistoryCursor {
  path: string;
}
export function listSqliteInbox(options: InboxListOptions): InboxDetails[] {
  try {
    const values = record(options, ['path', 'afterSequence', 'limit']);
    return readRuntimeDatabase(values['path'], (db) =>
      listInbox(db, {
        afterSequence: values['afterSequence'] as number,
        limit: values['limit'] as number,
      }),
    );
  } catch (error) {
    throw stateError(error);
  }
}
export function inspectSqliteInboxItem(
  options: InboxInspectOptions,
): InboxDetails | null {
  try {
    const values = record(options, ['path', 'id']);
    const id = uuid(values['id'], 'id');
    return readRuntimeDatabase(values['path'], (db) => getInboxDetails(db, id));
  } catch (error) {
    throw stateError(error);
  }
}
export function listSqliteInboxChanges(
  options: InboxChangesOptions,
): InboxTriageChange[] {
  try {
    const values = record(options, [
      'path',
      'inboxItemId',
      'afterSequence',
      'limit',
    ]);
    const inboxItemId = uuid(values['inboxItemId'], 'inboxItemId');
    return readRuntimeDatabase(values['path'], (db) =>
      listInboxChanges(db, {
        inboxItemId,
        afterSequence: values['afterSequence'] as number,
        limit: values['limit'] as number,
      }),
    );
  } catch (error) {
    throw stateError(error);
  }
}

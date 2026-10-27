import { isAbsolute } from 'node:path';
import {
  inspectInboxItem,
  listInbox,
  listInboxChanges,
  loadCompanyRepository,
  openRuntimeState,
  parseInboxClassification,
  parseInboxScope,
  type InboxClassification,
  type InboxDetails,
  type InboxScope,
  type InboxTriageChange,
  type RuntimeState,
} from '@mz/core';
import type { CliResult } from './cli.js';
const help = `Usage: mz inbox [list] [options]
       mz inbox inspect UUID [options]
       mz inbox history UUID [options]
       mz inbox triage UUID [--classify CLASS] [--scope SCOPE] [--triaged | --untriaged] [options]

Common options:
  --company DIR     Private company repository (or MZ_COMPANY_DIR)
  --runtime FILE    Existing absolute runtime database (or MZ_RUNTIME_DB)
  --json            Emit structural metadata without raw source content
  -h, --help        Show help without state access

List/history: --after N --limit N (default 100, maximum 1000)
Triage: --actor UUID (or MZ_ACTOR_ID); at least one change flag is required.
Classes: unclassified, idea, bug, feature, feedback, decision, reference, other
Scopes: unclassified, company, project-candidate, project:<id>

Read commands never initialize or migrate state. Changes use Core and record audit history.
Triage is private review metadata; no publication, project activation or authority grant.
Exit codes: 0 success, 1 access/missing/conflict failure, 2 invalid invocation.
`;
function invalid(): never {
  throw new Error();
}
function uuid(value: string | undefined): string {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    return invalid();
  return value;
}
function number(value: string): number {
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)))
    return invalid();
  return Number(value);
}
function viewText(view: InboxDetails): string {
  return `${view.sequence} ${view.item.id}\n  ${view.classification}, ${view.scope}, ${view.triaged ? 'triaged' : 'untriaged'}, revision ${view.revision}\n  Source ${view.sourceRef} (untrusted)\n  Summary pending\n`;
}
function changeText(change: InboxTriageChange): string {
  return `${change.sequence} ${change.id}, revision ${change.revision}\n  ${change.classification}, ${change.scope}, ${change.triaged ? 'triaged' : 'untriaged'}\n  Actor ${change.actorId}, ${change.changedAt}, event ${change.eventId}\n`;
}
type InboxOperation = 'list' | 'inspect' | 'history' | 'triage';
export async function runInboxCli(args: readonly string[]): Promise<CliResult> {
  if (
    (args.length === 1 && ['--help', '-h'].includes(args[0]!)) ||
    (args.length === 2 &&
      ['list', 'inspect', 'history', 'triage'].includes(args[0]!) &&
      ['--help', '-h'].includes(args[1]!))
  )
    return { stdout: help, stderr: '', exitCode: 0 };
  let operation: InboxOperation = 'list';
  let id: string | undefined;
  let company: string | undefined;
  let path: string;
  let actorId: string | undefined;
  let classification: InboxClassification | undefined;
  let scope: InboxScope | undefined;
  let triaged: boolean | undefined;
  let afterSequence = 0;
  let limit = 100;
  let json = false;
  try {
    let index = 0;
    if (args[0] && !args[0].startsWith('-')) {
      if (!['list', 'inspect', 'history', 'triage'].includes(args[0]))
        invalid();
      operation = args[0] as InboxOperation;
      index++;
    }
    if (operation !== 'list') id = uuid(args[index++]);
    let selectedPath = process.env['MZ_RUNTIME_DB'];
    let selectedActor = process.env['MZ_ACTOR_ID'];
    const seen = new Set<string>();
    for (; index < args.length; index++) {
      const flag = args[index]!;
      if (seen.has(flag)) invalid();
      seen.add(flag);
      if (flag === '--json') {
        json = true;
        continue;
      }
      if (flag === '--triaged' || flag === '--untriaged') {
        if (operation !== 'triage' || triaged !== undefined) invalid();
        triaged = flag === '--triaged';
        continue;
      }
      const allowed = [
        '--company',
        '--runtime',
        ...(operation === 'list' || operation === 'history'
          ? ['--after', '--limit']
          : []),
        ...(operation === 'triage' ? ['--actor', '--classify', '--scope'] : []),
      ];
      if (!allowed.includes(flag)) invalid();
      const value = args[++index];
      if (!value || value.startsWith('--') || value.includes('\0')) invalid();
      if (flag === '--company') company = value;
      else if (flag === '--runtime') selectedPath = value;
      else if (flag === '--actor') selectedActor = value;
      else if (flag === '--classify')
        classification = parseInboxClassification(value);
      else if (flag === '--scope') scope = parseInboxScope(value);
      else if (flag === '--after') afterSequence = number(value);
      else {
        limit = number(value);
        if (limit < 1 || limit > 1000) invalid();
      }
    }
    if (
      !selectedPath ||
      !isAbsolute(selectedPath) ||
      selectedPath.includes('\0')
    )
      invalid();
    path = selectedPath;
    if (operation === 'triage') {
      actorId = uuid(selectedActor);
      if (
        classification === undefined &&
        scope === undefined &&
        triaged === undefined
      )
        invalid();
    }
  } catch {
    return {
      stdout: '',
      stderr: 'Invalid inbox options. Run mz inbox --help.\n',
      exitCode: 2,
    };
  }
  let state: RuntimeState | undefined;
  let result: CliResult;
  try {
    await loadCompanyRepository(
      company === undefined ? {} : { directory: company },
    );
    let value: InboxDetails | InboxDetails[] | InboxTriageChange[];
    if (operation === 'list') value = listInbox({ path, afterSequence, limit });
    else if (operation === 'history')
      value = listInboxChanges({
        path,
        inboxItemId: id!,
        afterSequence,
        limit,
      });
    else if (operation === 'inspect') {
      const detail = inspectInboxItem({ path, id: id! });
      if (!detail) throw new Error();
      value = detail;
    } else {
      state = openRuntimeState({ path, existingOnly: true });
      value = state.triageInboxItem({
        id: id!,
        actorId: actorId!,
        ...(classification === undefined ? {} : { classification }),
        ...(scope === undefined ? {} : { scope }),
        ...(triaged === undefined ? {} : { triaged }),
      });
    }
    let text: string;
    if (operation === 'list') {
      const rows = value as InboxDetails[];
      text = rows.length ? rows.map(viewText).join('') : 'Inbox is empty.\n';
    } else if (operation === 'history') {
      const rows = value as InboxTriageChange[];
      text = rows.length
        ? rows.map(changeText).join('')
        : 'No triage changes.\n';
    } else text = viewText(value as InboxDetails);
    result = {
      stdout: json ? JSON.stringify(value) + '\n' : text,
      stderr: '',
      exitCode: 0,
    };
  } catch {
    result = {
      stdout: '',
      stderr:
        'Inbox access/change failed. Check company, current schema, item identity, actor and existing runtime access. Run mz inbox --help.\n',
      exitCode: 1,
    };
  } finally {
    try {
      state?.close();
    } catch {
      result = {
        stdout: '',
        stderr:
          'Triage finalization failed; inspect committed history before retrying.\n',
        exitCode: 1,
      };
    }
  }
  return result;
}

import { randomUUID } from 'node:crypto';
import {
  openStewardArtifacts,
  readStewardSnapshot,
  StewardError,
  stewardText,
  validateStewardResponse,
  type RuntimeState,
  type StewardInteraction,
  type StewardRequest,
  type StewardResponse,
  type StewardWorker,
  type StewardScope,
} from '@mz/core';
import { compileContext } from './compiler.js';
import { getStewardStatus } from './status.js';
import type { ContextOptions } from './types.js';
export interface AskStewardOptions extends ContextOptions {
  state: RuntimeState;
  /** Trusted host must pair this read path with state and the selected company. */
  runtimePath: string;
  artifactDirectory: string;
  actorId: string;
  workerId: string;
  question: string;
  worker: StewardWorker;
  timeoutMs?: number;
}
export interface AskStewardResult {
  interaction: StewardInteraction;
  response: StewardResponse;
  advisory: true;
}
function identity(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new StewardError();
}
export async function askSteward(
  options: AskStewardOptions,
): Promise<AskStewardResult> {
  let interaction: StewardInteraction | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { state, actorId, workerId, worker } = options;
    identity(actorId);
    identity(workerId);
    const timeout = options.timeoutMs ?? 60000;
    if (
      !Number.isSafeInteger(timeout) ||
      timeout < 1 ||
      timeout > 120000 ||
      typeof worker?.invoke !== 'function'
    )
      throw new StewardError();
    const question = stewardText(options.question, 8192);
    const artifacts = await openStewardArtifacts({
      directory: options.artifactDirectory,
    });
    const context = await compileContext({
      company: options.company,
      role: options.role,
      task: options.task,
      ...(options.project === undefined ? {} : { project: options.project }),
      maxBytes: options.maxBytes ?? 65536,
    });
    const scope: StewardScope =
      options.project === undefined ? 'company' : `project:${options.project}`;
    const status = await getStewardStatus({
      company: options.company,
      runtimePath: options.runtimePath,
      ...(options.project === undefined
        ? { companyOnly: true }
        : { project: options.project }),
    });
    const snapshot = readStewardSnapshot({
      path: options.runtimePath,
      scope,
      limit: 8,
    });
    const history: StewardRequest['history'] = [];
    for (const prior of snapshot.recentInteractions) {
      if (prior.scope !== scope) throw new StewardError();
      if (prior.outcome !== 'succeeded') continue;
      const response = await artifacts.readResponse(prior.sourceId);
      history.push({ interactionId: prior.id, summary: response.summary });
      if (history.length === 4) break;
    }
    const request: StewardRequest = {
      schemaVersion: 1,
      scope,
      question,
      context: context.text,
      status: JSON.stringify(status),
      history: history.reverse(),
    };
    stewardText(JSON.stringify(request), 131072);
    const sourceId = randomUUID();
    await artifacts.create(sourceId, request);
    interaction = state.startStewardInteraction({
      sourceId,
      actorId,
      workerId,
      scope,
    });
    const controller = new AbortController();
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new StewardError());
      }, timeout);
    });
    // A host adapter is trusted code; a worker never receives state/filesystem/approval ports.
    const response = validateStewardResponse(
      await Promise.race([
        Promise.resolve().then(() =>
          worker.invoke(structuredClone(request), controller.signal),
        ),
        timedOut,
      ]),
    );
    clearTimeout(timer);
    timer = undefined;
    await artifacts.complete(sourceId, response);
    interaction = state.finishStewardInteraction({
      id: interaction.id,
      actorId,
      outcome: 'succeeded',
    });
    return { interaction, response, advisory: true };
  } catch {
    if (interaction?.outcome === null) {
      try {
        options.state.finishStewardInteraction({
          id: interaction.id,
          actorId: options.actorId,
          outcome: 'failed',
        });
      } catch {
        /* Keep pending on audit failure; operator reconciles artifacts and runs. */
      }
    }
    throw new StewardError();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

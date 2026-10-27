import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  requireKnownRuntimeState,
  type RuntimeState,
  type StewardDecision,
  type StewardScope,
} from '@mz/state';
import { privateHostDirectory } from './private-host-directory.js';
import { StewardError, stewardText } from './steward.js';
import {
  stewardSync,
  stewardUuid,
  stewardWrite,
  type StewardArtifacts,
} from './steward-artifacts.js';
export interface StewardDecisionProposal {
  id: string;
  knowledgeId: string;
  interactionId: string;
  proposalIndex: number;
  scope: StewardScope;
  text: string;
}
/** Trusted host-only authority boundary. The callback must verify real approval for this exact proposal. */
export type StewardDecisionApprover = (
  proposal: Readonly<StewardDecisionProposal>,
) => Promise<
  { approved: false } | { approved: true; approvalId: string; actorId: string }
>;
export interface StewardDecisionWriter {
  /** Durable private knowledge write; never interpret prose as a command or publish it. */
  write(
    proposal: Readonly<StewardDecisionProposal>,
    receipt: Readonly<{ approvalId: string; actorId: string }>,
  ): Promise<void>;
}
export async function createPrivateStewardDecisionWriter(options: {
  directory: string;
}): Promise<StewardDecisionWriter> {
  try {
    // This is a host-selected private curated decisions directory; Git is allowed here.
    const root = await privateHostDirectory(options.directory);
    return Object.freeze({
      async write(
        proposal: Readonly<StewardDecisionProposal>,
        receipt: Readonly<{ approvalId: string; actorId: string }>,
      ): Promise<void> {
        try {
          stewardUuid(proposal.id);
          stewardUuid(proposal.interactionId);
          stewardUuid(receipt.actorId);
          stewardUuid(receipt.approvalId);
          if (
            proposal.knowledgeId !== 'decision-' + proposal.id ||
            !/^(?:company|project:[a-z][a-z0-9-]{0,63})$/.test(
              proposal.scope,
            ) ||
            !Number.isSafeInteger(proposal.proposalIndex) ||
            proposal.proposalIndex < 0 ||
            proposal.proposalIndex > 15
          )
            throw new StewardError();
          const body = stewardText(proposal.text, 2048);
          if ((await privateHostDirectory(root)) !== root)
            throw new StewardError();
          await stewardWrite(
            join(root, proposal.knowledgeId + '.md'),
            `---\nscope: ${proposal.scope}\ninteraction: ${proposal.interactionId}\nproposalIndex: ${proposal.proposalIndex}\napproval: ${receipt.approvalId}\nactor: ${receipt.actorId}\n---\n# Confirmed decision\n\n${body}\n`,
          );
          await stewardSync(root);
        } catch {
          throw new StewardError();
        }
      },
    });
  } catch {
    throw new StewardError();
  }
}
export async function recordApprovedStewardDecision(options: {
  state: RuntimeState;
  artifacts: StewardArtifacts;
  interactionId: string;
  proposalIndex: number;
  approve: StewardDecisionApprover;
  writer: StewardDecisionWriter;
}): Promise<StewardDecision> {
  try {
    const { state, artifacts, proposalIndex, approve, writer } = options;
    requireKnownRuntimeState(state);
    const interactionId = stewardUuid(options.interactionId);
    if (
      !Number.isSafeInteger(proposalIndex) ||
      proposalIndex < 0 ||
      proposalIndex > 15 ||
      typeof approve !== 'function' ||
      typeof writer?.write !== 'function'
    )
      throw new StewardError();
    if (state.getStewardDecisionForProposal(interactionId, proposalIndex))
      throw new StewardError();
    const interaction = state.getStewardInteraction(interactionId);
    if (interaction?.outcome !== 'succeeded') throw new StewardError();
    const response = await artifacts.readResponse(interaction.sourceId);
    const text = response.decisions[proposalIndex];
    if (text === undefined) throw new StewardError();
    const id = randomUUID();
    const proposal = Object.freeze({
      id,
      knowledgeId: 'decision-' + id,
      interactionId,
      proposalIndex,
      scope: interaction.scope,
      text,
    });
    const approval = await approve(proposal);
    if (approval?.approved !== true) throw new StewardError();
    const receipt = Object.freeze({
      approvalId: stewardUuid(approval.approvalId),
      actorId: stewardUuid(approval.actorId),
    });
    await writer.write(proposal, receipt);
    // File durability precedes the SQLite reference. Failure here leaves an orphan for explicit reconciliation.
    return state.recordStewardDecision({
      id,
      interactionId,
      proposalIndex,
      ...receipt,
    });
  } catch {
    throw new StewardError();
  }
}

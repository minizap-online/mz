import type { RunOutcome } from './types.js';
export type StewardScope = 'company' | `project:${string}`;
export interface StewardInteraction {
  sequence: number;
  id: string;
  sourceId: string;
  runId: string;
  scope: StewardScope;
  actorId: string;
  workerId: string;
  createdAt: string;
  finishedAt: string | null;
  outcome: RunOutcome | null;
}
export interface StewardDecision {
  sequence: number;
  id: string;
  interactionId: string;
  proposalIndex: number;
  actorId: string;
  recordedAt: string;
  approvalId: string;
  eventId: string;
  knowledgeId: string;
}
export interface StartStewardInteraction {
  id?: string;
  sourceId: string;
  actorId: string;
  workerId: string;
  scope: StewardScope;
  startedAt?: string;
}
export interface FinishStewardInteraction {
  id: string;
  actorId: string;
  outcome: RunOutcome;
  finishedAt?: string;
}
export interface RecordStewardDecision {
  id?: string;
  interactionId: string;
  proposalIndex: number;
  actorId: string;
  approvalId: string;
  recordedAt?: string;
}
export interface StewardCursor {
  scope?: StewardScope;
  afterSequence?: number;
  limit?: number;
}

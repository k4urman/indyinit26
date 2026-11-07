import type { BlockEvent, Category, EventCategory, GateAction, GateChoice, Reason, Verdict } from '../shared/contract';
import type { PageDecision } from './policy';
import type { PageSignals } from './signals';

/** Engine-internal messages (content <-> background). The UI uses contract.ts `Request` instead. */
export type InternalRequest =
  | { type: 'ss:page'; signals: PageSignals }
  | { type: 'ss:event'; category: EventCategory; action: BlockEvent['action']; reasons: Reason[]; userOverride?: BlockEvent['userOverride'] }
  | { type: 'ss:override'; eventId: string; userOverride: NonNullable<BlockEvent['userOverride']> }
  | { type: 'ss:trust' } // "I trust this site" from an in-page gate
  | { type: 'ss:scareware' } // mute the tab
  | { type: 'ss:goSafe'; url?: string };

export interface PageResult {
  verdict: Verdict;
  decision: PageDecision;
  /** Event logged for the page-level block/warn, so a later override can update it. */
  eventId?: string;
}

/** Background -> content. */
export type ContentRequest = { type: 'ss:gate'; verdict: Verdict; action: GateAction; category: Category };

export interface GateReply {
  choice: GateChoice;
}

export function isInternal(msg: unknown): msg is InternalRequest {
  return typeof msg === 'object' && msg !== null && typeof (msg as { type?: unknown }).type === 'string' && (msg as { type: string }).type.startsWith('ss:');
}

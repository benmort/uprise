import { ActionPageStatus } from "@uprise/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

/**
 * Action-page lifecycle. DRAFT ↔ PUBLISHED (publish/unpublish), either may be
 * ARCHIVED, and ARCHIVED → DRAFT is restore. Publishing is additionally gated
 * by the publish-gate validation in ActionsService (FSM legality is necessary,
 * not sufficient).
 */
export const ACTION_PAGE_TRANSITIONS: TransitionMap<ActionPageStatus> = {
  [ActionPageStatus.DRAFT]: [ActionPageStatus.PUBLISHED, ActionPageStatus.ARCHIVED],
  [ActionPageStatus.PUBLISHED]: [ActionPageStatus.DRAFT, ActionPageStatus.ARCHIVED],
  [ActionPageStatus.ARCHIVED]: [ActionPageStatus.DRAFT],
};

/** Throwing guard for command paths — 409 INVALID_ACTION_PAGE_TRANSITION. */
export function assertValidActionPageTransition(from: ActionPageStatus, to: ActionPageStatus): void {
  assertTransition(ACTION_PAGE_TRANSITIONS, from, to, "INVALID_ACTION_PAGE_TRANSITION", "action page");
}

/** Non-throwing variant for advisory checks (e.g. list-row affordances). */
export function canTransitionActionPage(from: ActionPageStatus, to: ActionPageStatus): boolean {
  return ACTION_PAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

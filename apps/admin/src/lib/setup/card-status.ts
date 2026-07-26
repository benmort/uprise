import type { SetupStepKey, TenantSetupState } from "@uprise/api-client";
import { flowsOf } from "./setup-state";

/**
 * Maps the server's setup state onto a settings card's header chip. A settings card and its
 * getting-started row are the same fact rendered twice, so both derive from GET /tenants/:id/setup
 * rather than from whatever the form happens to be holding – a card can't claim "Done" for
 * unsaved input.
 */
export type CardStatus = "DONE" | "TODO" | "OPTIONAL";

/**
 * The chip for the card that owns `key`, or undefined when there's nothing to say: the state
 * hasn't loaded yet, or the step isn't in this principal's flows at all (an organiser never
 * receives the owner-only org steps). Undefined renders no chip, so a card never flickers
 * "To do" while the fetch is in flight.
 */
export function stepCardStatus(
  state: TenantSetupState | undefined,
  key: SetupStepKey,
): CardStatus | undefined {
  if (!state) return undefined;
  for (const flow of flowsOf(state)) {
    const step = flow.steps.find((s) => s.key === key);
    if (!step) continue;
    if (step.status === "done") return "DONE";
    // "recommended" is the server's word for never-blocking polish – the card says "Optional".
    return step.status === "recommended" ? "OPTIONAL" : "TODO";
  }
  return undefined;
}

import { ApiHttpException } from "../http/api-response";

/** A status state machine: each state maps to the states it may transition to. */
export type TransitionMap<S extends string> = Record<S, readonly S[]>;

/**
 * Generic FSM transition guard (meld doc 12 pattern). Throws a 409 on an illegal
 * transition. Aggregate ports (tx-sms, email, payment, call) build a TransitionMap
 * and wrap this in an `assertValid<X>Transition`.
 */
export function assertTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
  code = "INVALID_TRANSITION",
  label = "entity",
): void {
  if (!map[from]?.includes(to)) {
    throw new ApiHttpException(code, `Cannot transition ${label} from ${from} to ${to}`, 409);
  }
}

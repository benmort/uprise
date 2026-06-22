import { EmailStatus } from "@yarns/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

// QUEUED → SENDING → SENT → DELIVERED | BOUNCED | FAILED. open/click are
// timestamps (first-write-wins), NOT statuses — they don't move the machine.
export const EMAIL_TRANSITIONS: TransitionMap<EmailStatus> = {
  [EmailStatus.QUEUED]: [EmailStatus.SENDING, EmailStatus.FAILED],
  [EmailStatus.SENDING]: [EmailStatus.SENT, EmailStatus.FAILED],
  [EmailStatus.SENT]: [EmailStatus.DELIVERED, EmailStatus.BOUNCED, EmailStatus.FAILED],
  // A late hard-bounce can arrive after delivered (prog parity); allow delivered→bounced.
  [EmailStatus.DELIVERED]: [EmailStatus.BOUNCED],
  [EmailStatus.BOUNCED]: [],
  [EmailStatus.FAILED]: [],
};

export function assertValidEmailTransition(from: EmailStatus, to: EmailStatus): void {
  assertTransition(EMAIL_TRANSITIONS, from, to, "INVALID_EMAIL_TRANSITION", "email");
}

export function canTransitionEmail(from: EmailStatus, to: EmailStatus): boolean {
  return EMAIL_TRANSITIONS[from]?.includes(to) ?? false;
}

import { EmailStatus } from "@yarns/db";
import { assertValidEmailTransition, canTransitionEmail } from "./email-state.machine";

describe("email state machine", () => {
  it.each([
    [EmailStatus.QUEUED, EmailStatus.SENDING],
    [EmailStatus.QUEUED, EmailStatus.FAILED],
    [EmailStatus.SENDING, EmailStatus.SENT],
    [EmailStatus.SENT, EmailStatus.DELIVERED],
    [EmailStatus.SENT, EmailStatus.BOUNCED],
    [EmailStatus.SENT, EmailStatus.FAILED],
    [EmailStatus.DELIVERED, EmailStatus.BOUNCED], // late hard-bounce after delivered
  ])("allows %s → %s", (from, to) => {
    expect(() => assertValidEmailTransition(from, to)).not.toThrow();
  });

  it.each([
    [EmailStatus.QUEUED, EmailStatus.SENT],
    [EmailStatus.SENDING, EmailStatus.DELIVERED],
    [EmailStatus.DELIVERED, EmailStatus.SENT],
    [EmailStatus.BOUNCED, EmailStatus.DELIVERED],
    [EmailStatus.SENT, EmailStatus.QUEUED],
  ])("rejects %s → %s", (from, to) => {
    expect(() => assertValidEmailTransition(from, to)).toThrow();
  });

  it("canTransitionEmail is false from a terminal state", () => {
    expect(canTransitionEmail(EmailStatus.DELIVERED, EmailStatus.SENT)).toBe(false);
    expect(canTransitionEmail(EmailStatus.SENT, EmailStatus.DELIVERED)).toBe(true);
  });
});

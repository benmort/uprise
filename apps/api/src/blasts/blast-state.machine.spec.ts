import { assertValidBlastTransition } from "./blast-state.machine";
import { BlastStatus } from "../common/enums/blast-status.enum";

describe("blast state machine", () => {
  it("allows drafted -> proofed", () => {
    expect(() =>
      assertValidBlastTransition(BlastStatus.DRAFTED, BlastStatus.PROOFED),
    ).not.toThrow();
  });

  it("rejects sent -> drafted", () => {
    expect(() =>
      assertValidBlastTransition(BlastStatus.SENT, BlastStatus.DRAFTED),
    ).toThrow();
  });
});

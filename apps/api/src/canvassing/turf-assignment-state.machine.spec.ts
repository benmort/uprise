import { TurfAssignmentStatus } from "@uprise/db";
import {
  assertTurfAssignmentTransition,
  canTransitionTurfAssignment,
} from "./turf-assignment-state.machine";

const { REQUESTED, ASSIGNED, RELEASED } = TurfAssignmentStatus;

describe("turf-assignment FSM", () => {
  it("approves and denies from REQUESTED", () => {
    expect(canTransitionTurfAssignment(REQUESTED, ASSIGNED)).toBe(true); // approve
    expect(canTransitionTurfAssignment(REQUESTED, RELEASED)).toBe(true); // deny
  });

  it("only releases from ASSIGNED", () => {
    expect(canTransitionTurfAssignment(ASSIGNED, RELEASED)).toBe(true);
    expect(canTransitionTurfAssignment(ASSIGNED, REQUESTED)).toBe(false);
    expect(canTransitionTurfAssignment(ASSIGNED, ASSIGNED)).toBe(false);
  });

  it("treats RELEASED as terminal", () => {
    expect(canTransitionTurfAssignment(RELEASED, ASSIGNED)).toBe(false);
    expect(canTransitionTurfAssignment(RELEASED, REQUESTED)).toBe(false);
    expect(canTransitionTurfAssignment(RELEASED, RELEASED)).toBe(false);
  });

  it("assert throws on an illegal move, passes a legal one", () => {
    expect(() => assertTurfAssignmentTransition(RELEASED, ASSIGNED)).toThrow();
    expect(() => assertTurfAssignmentTransition(ASSIGNED, REQUESTED)).toThrow();
    expect(() => assertTurfAssignmentTransition(REQUESTED, ASSIGNED)).not.toThrow();
    expect(() => assertTurfAssignmentTransition(ASSIGNED, RELEASED)).not.toThrow();
  });
});

import { ShiftAssignmentStatus } from "@uprise/db";
import {
  assertShiftAssignmentTransition,
  canTransitionShiftAssignment,
} from "./shift-assignment-state.machine";

describe("shift-assignment FSM", () => {
  it("allows REQUESTED → ASSIGNED / RELEASED", () => {
    expect(canTransitionShiftAssignment(ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.ASSIGNED)).toBe(true);
    expect(canTransitionShiftAssignment(ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.RELEASED)).toBe(true);
  });
  it("allows ASSIGNED → RELEASED only", () => {
    expect(canTransitionShiftAssignment(ShiftAssignmentStatus.ASSIGNED, ShiftAssignmentStatus.RELEASED)).toBe(true);
    expect(canTransitionShiftAssignment(ShiftAssignmentStatus.ASSIGNED, ShiftAssignmentStatus.REQUESTED)).toBe(false);
  });
  it("treats RELEASED as terminal", () => {
    expect(canTransitionShiftAssignment(ShiftAssignmentStatus.RELEASED, ShiftAssignmentStatus.ASSIGNED)).toBe(false);
  });
  it("assert throws INVALID_SHIFT_TRANSITION on an illegal move", () => {
    expect(() =>
      assertShiftAssignmentTransition(ShiftAssignmentStatus.RELEASED, ShiftAssignmentStatus.ASSIGNED),
    ).toThrow();
    expect(() =>
      assertShiftAssignmentTransition(ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.ASSIGNED),
    ).not.toThrow();
  });
});

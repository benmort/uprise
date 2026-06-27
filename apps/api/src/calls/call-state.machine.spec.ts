import { CallStatus } from "@uprise/db";
import {
  assertValidCallTransition,
  canTransitionCall,
  mapTwilioCallStatus,
} from "./call-state.machine";

describe("call state machine", () => {
  it.each([
    [CallStatus.INITIATED, CallStatus.RINGING],
    [CallStatus.INITIATED, CallStatus.IN_PROGRESS],
    [CallStatus.INITIATED, CallStatus.COMPLETED],
    [CallStatus.INITIATED, CallStatus.BUSY],
    [CallStatus.INITIATED, CallStatus.NO_ANSWER],
    [CallStatus.INITIATED, CallStatus.FAILED],
    [CallStatus.RINGING, CallStatus.IN_PROGRESS],
    [CallStatus.RINGING, CallStatus.COMPLETED],
    [CallStatus.RINGING, CallStatus.NO_ANSWER],
    [CallStatus.IN_PROGRESS, CallStatus.COMPLETED],
    [CallStatus.IN_PROGRESS, CallStatus.FAILED],
  ])("allows %s → %s", (from, to) => {
    expect(() => assertValidCallTransition(from, to)).not.toThrow();
    expect(canTransitionCall(from, to)).toBe(true);
  });

  it.each([
    [CallStatus.COMPLETED, CallStatus.FAILED],
    [CallStatus.COMPLETED, CallStatus.COMPLETED],
    [CallStatus.FAILED, CallStatus.COMPLETED],
    [CallStatus.BUSY, CallStatus.IN_PROGRESS],
    [CallStatus.NO_ANSWER, CallStatus.RINGING],
    [CallStatus.IN_PROGRESS, CallStatus.RINGING],
  ])("rejects %s → %s", (from, to) => {
    expect(() => assertValidCallTransition(from, to)).toThrow();
    expect(canTransitionCall(from, to)).toBe(false);
  });

  it("maps Twilio CallStatus strings to our enum", () => {
    expect(mapTwilioCallStatus("ringing")).toBe(CallStatus.RINGING);
    expect(mapTwilioCallStatus("in-progress")).toBe(CallStatus.IN_PROGRESS);
    expect(mapTwilioCallStatus("completed")).toBe(CallStatus.COMPLETED);
    expect(mapTwilioCallStatus("busy")).toBe(CallStatus.BUSY);
    expect(mapTwilioCallStatus("no-answer")).toBe(CallStatus.NO_ANSWER);
    expect(mapTwilioCallStatus("failed")).toBe(CallStatus.FAILED);
    expect(mapTwilioCallStatus("canceled")).toBe(CallStatus.FAILED);
  });

  it("maps non-transitional Twilio statuses to null (no-op)", () => {
    expect(mapTwilioCallStatus("queued")).toBeNull();
    expect(mapTwilioCallStatus("initiated")).toBeNull();
    expect(mapTwilioCallStatus("anything-else")).toBeNull();
  });
});

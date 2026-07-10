import { describe, expect, it, vi } from "vitest";
import { PROFILE_UPDATED_EVENT, emitProfileUpdated, onProfileUpdated } from "./profile-events";

describe("profile-events", () => {
  it("delivers each emit to active subscribers", () => {
    const spy = vi.fn();
    const off = onProfileUpdated(spy);
    emitProfileUpdated();
    emitProfileUpdated();
    expect(spy).toHaveBeenCalledTimes(2);
    off();
  });

  it("stops delivery after unsubscribe", () => {
    const spy = vi.fn();
    const off = onProfileUpdated(spy);
    off();
    emitProfileUpdated();
    expect(spy).not.toHaveBeenCalled();
  });

  it("exposes a stable, namespaced event name", () => {
    expect(PROFILE_UPDATED_EVENT).toBe("uprise:profile-updated");
  });
});

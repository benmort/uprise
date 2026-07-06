import { describe, it, expect } from "vitest";
import { nextReconnectDelay } from "./reconnect-backoff";

describe("nextReconnectDelay", () => {
  it("grows exponentially from 2s on the first attempt", () => {
    expect(nextReconnectDelay(1)).toBe(2_000);
    expect(nextReconnectDelay(2)).toBe(4_000);
    expect(nextReconnectDelay(3)).toBe(8_000);
    expect(nextReconnectDelay(4)).toBe(16_000);
  });

  it("caps at 60s so a persistent failure stops hammering", () => {
    expect(nextReconnectDelay(6)).toBe(60_000);
    expect(nextReconnectDelay(20)).toBe(60_000);
  });

  it("floors a 0/negative attempt to the first-attempt delay (never 1s spam)", () => {
    expect(nextReconnectDelay(0)).toBe(2_000);
    expect(nextReconnectDelay(-3)).toBe(2_000);
  });
});

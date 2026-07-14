import "fake-indexeddb/auto"; // provides a real in-memory IndexedDB for the node test env
import { afterEach, describe, expect, it } from "vitest";
import { apiCacheGet, apiCacheSet } from "./api-cache-store";

afterEach(async () => {
  // Wipe the store between cases so keys don't leak across tests.
  await apiCacheSet("__probe__", undefined);
});

describe("api-cache-store (durable GET cache)", () => {
  it("round-trips a stored response by key", async () => {
    await apiCacheSet("/canvass/assignments?volunteerId=v1", [{ turfId: "t1" }]);
    expect(await apiCacheGet("/canvass/assignments?volunteerId=v1")).toEqual([{ turfId: "t1" }]);
  });

  it("returns undefined for a key that was never stored", async () => {
    expect(await apiCacheGet("/never/stored")).toBeUndefined();
  });

  it("overwrites an existing key with the latest value", async () => {
    await apiCacheSet("/k", { v: 1 });
    await apiCacheSet("/k", { v: 2 });
    expect(await apiCacheGet("/k")).toEqual({ v: 2 });
  });

  it("keys are independent", async () => {
    await apiCacheSet("/a", "AA");
    await apiCacheSet("/b", "BB");
    expect(await apiCacheGet("/a")).toBe("AA");
    expect(await apiCacheGet("/b")).toBe("BB");
  });
});

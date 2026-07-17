import { describe, expect, it } from "vitest";
import { hashContact, orderByHash } from "./hash-order";

describe("hash-order determinism", () => {
  it("golden vectors — the seed⎵space⎵id concatenation is locked", () => {
    // Regenerating these means the sort key changed — preview==send breaks. Don't.
    expect(hashContact("contact-1", "seed-a")).toBe(
      "423d02fd937b56806f960af3417d7ce552d01e48310b16713755330f6c52faa4",
    );
    expect(hashContact("contact-2", "seed-a")).toBe(
      "cd6a63a8c5f23b99b82a60dcd950aab2e38e32b4f915daa7e69b50332cd417ea",
    );
    expect(hashContact("contact-1", "seed-b")).toBe(
      "3f91236a0d61c37667f89bc1c9645e224447cad0f558b35cae62fd72cd91933d",
    );
  });

  it("same (ids, seed) → identical order on every call", () => {
    const ids = ["c1", "c2", "c3", "c4", "c5"];
    const a = orderByHash(ids, "s1");
    const b = orderByHash([...ids].reverse(), "s1");
    expect(a).toEqual(b);
  });

  it("a different seed reshuffles", () => {
    const ids = Array.from({ length: 32 }, (_, i) => `c${i}`);
    expect(orderByHash(ids, "s1")).not.toEqual(orderByHash(ids, "s2"));
  });

  it("adding a contact never reshuffles the relative order of the others", () => {
    const ids = ["c1", "c2", "c3", "c4"];
    const before = orderByHash(ids, "s1");
    const after = orderByHash([...ids, "c99"], "s1").filter((id) => id !== "c99");
    expect(after).toEqual(before);
  });

  it("output is a permutation of the input", () => {
    const ids = ["z", "y", "x"];
    expect([...orderByHash(ids, "s")].sort()).toEqual([...ids].sort());
  });
});

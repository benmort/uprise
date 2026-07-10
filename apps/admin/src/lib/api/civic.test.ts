import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path each wrapper builds.
vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  listPoliticians,
  getPolitician,
  listPolicies,
  getPolicy,
  attendancePct,
} from "./civic";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("civic api client — wrappers", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listPoliticians encodes only the set filters into the query", async () => {
    await listPoliticians();
    expect(mockReq.mock.calls[0][0]).toBe("/civic/politicians");
    await listPoliticians({ house: "SENATE", geoKind: "ced", geoCode: "204", q: "smith", party: "" });
    const url = mockReq.mock.calls[1][0] as string;
    expect(url).toContain("/civic/politicians?");
    expect(url).toContain("house=SENATE");
    expect(url).toContain("geoCode=204");
    expect(url).toContain("q=smith");
    expect(url).not.toContain("party="); // empty filter dropped
  });

  it("getPolitician encodes the id", async () => {
    await getPolitician("p 1");
    expect(mockReq.mock.calls[0][0]).toBe("/civic/politicians/p%201");
  });

  it("listPolicies serialises the provisional boolean and q", async () => {
    await listPolicies({ q: "marriage", provisional: false });
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("q=marriage");
    expect(url).toContain("provisional=false");
    await listPolicies();
    expect(mockReq.mock.calls[1][0]).toBe("/civic/policies");
  });

  it("getPolicy encodes the id", async () => {
    await getPolicy("pc1");
    expect(mockReq.mock.calls[0][0]).toBe("/civic/policies/pc1");
  });
});

describe("attendancePct", () => {
  it("computes a whole-percent, guarding a null/zero base", () => {
    expect(attendancePct({ votesAttended: 90, votesPossible: 100 })).toBe(90);
    expect(attendancePct({ votesAttended: 1, votesPossible: 3 })).toBe(33);
    expect(attendancePct({ votesAttended: null, votesPossible: 100 })).toBeNull();
    expect(attendancePct({ votesAttended: 5, votesPossible: 0 })).toBeNull();
  });
});

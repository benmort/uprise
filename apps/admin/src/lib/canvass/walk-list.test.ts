import { describe, expect, it } from "vitest";
import type { TurfContact, RouteLeg } from "@/lib/api";
import { buildWalkGroups, stopLabel, doorNumber } from "./walk-list";

const c = (id: string, over: Partial<TurfContact> = {}): TurfContact => ({
  id,
  firstName: null,
  lastName: null,
  gnafPid: null,
  address: null,
  street: null,
  locality: null,
  postcode: null,
  lat: 0,
  lng: 0,
  ...over,
});

describe("stopLabel", () => {
  it("prefers a contact name, else the address, else a placeholder", () => {
    expect(stopLabel(c("1", { firstName: "Ada", lastName: "Lovelace" }))).toBe("Ada Lovelace");
    expect(stopLabel(c("2", { address: "96 Smith Street, Richmond VIC 3121" }))).toBe("96 Smith Street, Richmond VIC 3121");
    expect(stopLabel(c("3"))).toBe("Unknown address");
  });
});

describe("doorNumber", () => {
  it("extracts the leading street number", () => {
    expect(doorNumber(c("1", { address: "96 Smith Street, Richmond VIC 3121" }))).toBe("96");
    expect(doorNumber(c("2", { address: "12A Jones Rd" }))).toBe("12A");
    expect(doorNumber(c("3", { address: "2/48 Punt Road" }))).toBe("2/48");
    expect(doorNumber(c("4", { address: "96 · 3121" }))).toBe("96");
  });
});

describe("buildWalkGroups", () => {
  const contacts = [
    c("a", { street: "Smith Street", locality: "Richmond", address: "2 Smith Street" }),
    c("b", { street: "Smith Street", locality: "Richmond", address: "4 Smith Street" }),
    c("d", { street: "Jones Road", locality: "Richmond", address: "1 Jones Road" }),
    c("e", { street: "Smith Street", locality: "Richmond", address: "6 Smith Street" }),
  ];
  // Walk order: a, b (Smith), d (Jones), e (Smith again).
  const ordered = ["a", "b", "d", "e"];
  const legs: RouteLeg[] = [
    { fromId: "a", toId: "b", distanceM: 20, durationS: 16 },
    { fromId: "b", toId: "d", distanceM: 90, durationS: 72 },
    { fromId: "d", toId: "e", distanceM: 110, durationS: 88 },
  ];

  it("collapses CONSECUTIVE same-street stops, splitting when the street changes and back", () => {
    const { groups } = buildWalkGroups(contacts, ordered, legs);
    expect(groups.map((g) => g.street)).toEqual(["Smith Street", "Jones Road", "Smith Street"]);
    expect(groups[0].stops.map((s) => s.id)).toEqual(["a", "b"]); // grouped
    expect(groups[2].stops.map((s) => s.id)).toEqual(["e"]); // separate run, not merged with group 0
  });

  it("numbers stops by walk order and attaches the leaving-leg to each group", () => {
    const { groups, stops } = buildWalkGroups(contacts, ordered, legs);
    expect(stops.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
    // group0 (a,b) leaves from b → 90 m; group1 (d) leaves from d → 110 m; last group has none.
    expect(groups[0].legToNext).toMatchObject({ distanceM: 90 });
    expect(groups[1].legToNext).toMatchObject({ distanceM: 110 });
    expect(groups[2].legToNext).toBeNull();
  });

  it("falls back to locality when there's no street", () => {
    const noStreet = [c("x", { locality: "Fitzroy" }), c("y", { locality: "Fitzroy" })];
    const { groups } = buildWalkGroups(noStreet, ["x", "y"], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].locality).toBe("Fitzroy");
  });

  it("never drops a contact missing from the order, and treats blank keys as singletons", () => {
    const { groups, stops } = buildWalkGroups([c("a"), c("b")], ["a"], []);
    expect(stops).toHaveLength(2); // b appended even though not in `ordered`
    expect(groups).toHaveLength(2); // blank street/locality → each its own group, not merged
  });
});

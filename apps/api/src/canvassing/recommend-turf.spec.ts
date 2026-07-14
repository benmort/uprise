import { preferredDoorLoad, rankTurfsByPrefs } from "./recommend-turf";

describe("preferredDoorLoad", () => {
  it("returns null with no prefs", () => {
    expect(preferredDoorLoad(null)).toBeNull();
    expect(preferredDoorLoad(undefined)).toBeNull();
    expect(preferredDoorLoad({})).toBeNull();
  });

  it("returns null when only walking capability is set (no session base to scale)", () => {
    expect(preferredDoorLoad({ walkingCapability: "long" })).toBeNull();
  });

  it("returns null for a flexible session length", () => {
    expect(preferredDoorLoad({ sessionLength: "flexible" })).toBeNull();
    expect(preferredDoorLoad({ sessionLength: "flexible", walkingCapability: "long" })).toBeNull();
  });

  it("uses the session base when capability is unset (×1)", () => {
    expect(preferredDoorLoad({ sessionLength: "short" })).toBe(20);
    expect(preferredDoorLoad({ sessionLength: "standard" })).toBe(40);
    expect(preferredDoorLoad({ sessionLength: "long" })).toBe(70);
  });

  it("scales the base by walking capability and rounds", () => {
    expect(preferredDoorLoad({ sessionLength: "standard", walkingCapability: "minimal" })).toBe(24); // 40×0.6
    expect(preferredDoorLoad({ sessionLength: "standard", walkingCapability: "short" })).toBe(32); // 40×0.8
    expect(preferredDoorLoad({ sessionLength: "long", walkingCapability: "long" })).toBe(91); // 70×1.3
  });
});

describe("rankTurfsByPrefs", () => {
  const turfs = [
    { id: "a", contactCount: 10 },
    { id: "b", contactCount: 45 },
    { id: "c", contactCount: 90 },
  ];

  it("orders closest to the preferred load first when a target exists", () => {
    // standard (40) → target 40; 45 is closest, then 10, then 90.
    expect(rankTurfsByPrefs(turfs, { sessionLength: "standard" }).map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("orders smallest-first when there is no target", () => {
    expect(rankTurfsByPrefs(turfs, null).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("is stable for equal scores and does not mutate the input", () => {
    const input = [
      { id: "x", contactCount: 30 },
      { id: "y", contactCount: 50 },
    ];
    // target 40 → both are 10 away; original order preserved.
    expect(rankTurfsByPrefs(input, { sessionLength: "standard" }).map((t) => t.id)).toEqual(["x", "y"]);
    expect(input.map((t) => t.id)).toEqual(["x", "y"]);
  });
});

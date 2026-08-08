import { describe, expect, it } from "vitest";
import { nameDivisionSources } from "./boundary-names";

const sources = [
  { kind: "division", type: "sed", code: "SED10015" },
  { kind: "division", type: "sed", code: "SED10042" },
  { kind: "area", layer: "sa1", code: "SA1-1" },
  { kind: "polygon", geometry: {} },
] as never;

const described = [
  { kind: "division", key: "sed", code: "SED10015", name: "Balmain" },
  { kind: "division", key: "sed", code: "SED10042", name: "Newtown" },
  { kind: "polygon", key: "polygon", name: null },
] as never;

describe("nameDivisionSources", () => {
  /**
   * THE regression. The page filled the display name with the raw code, so a boundary that read
   * "Balmain, Newtown" while it was being built came back as "SED10015, SED10042" on reload —
   * the campaign's own definition unreadable to the organiser who wrote it. The names were in
   * the same response.
   */
  it("resolves each division to its human name", () => {
    expect(nameDivisionSources(sources, described)).toEqual([
      { type: "sed", code: "SED10015", name: "Balmain" },
      { type: "sed", code: "SED10042", name: "Newtown" },
    ]);
  });

  it("keeps only divisions — areas and drawn polygons are handled elsewhere", () => {
    expect(nameDivisionSources(sources, described)).toHaveLength(2);
  });

  // Honest degradation: a code with no described entry keeps the code rather than vanishing from
  // the campaign's definition.
  it("falls back to the code when no name was returned for it", () => {
    expect(nameDivisionSources(sources, [described[0]] as never)).toEqual([
      { type: "sed", code: "SED10015", name: "Balmain" },
      { type: "sed", code: "SED10042", name: "SED10042" },
    ]);
  });

  it("survives missing or empty inputs", () => {
    expect(nameDivisionSources(null, null)).toEqual([]);
    expect(nameDivisionSources(undefined, undefined)).toEqual([]);
    expect(nameDivisionSources(sources, [])).toEqual([
      { type: "sed", code: "SED10015", name: "SED10015" },
      { type: "sed", code: "SED10042", name: "SED10042" },
    ]);
  });

  // A polygon carries name: null and no code — it must not poison the lookup.
  it("ignores described polygons", () => {
    expect(() => nameDivisionSources(sources, described)).not.toThrow();
  });
});

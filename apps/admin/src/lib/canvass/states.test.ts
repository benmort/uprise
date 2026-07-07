import { describe, it, expect } from "vitest";
import { STATE_ABBREVS, stateBounds } from "./states";

describe("stateBounds", () => {
  it("returns [w,s,e,n] bounds for every known state abbreviation", () => {
    for (const abbrev of STATE_ABBREVS) {
      const b = stateBounds(abbrev);
      expect(b).toBeDefined();
      const [w, s, e, n] = b!;
      expect(w).toBeLessThan(e); // west < east
      expect(s).toBeLessThan(n); // south < north
    }
  });

  it("frames NSW around the east coast", () => {
    const [w, s, e, n] = stateBounds("NSW")!;
    expect(w).toBeCloseTo(141.0, 1);
    expect(e).toBeCloseTo(153.55, 1);
    expect(s).toBeLessThan(-28); // southern hemisphere
    expect(n).toBeLessThan(-28);
  });

  it("returns undefined for no state or an unknown abbreviation", () => {
    expect(stateBounds(undefined)).toBeUndefined();
    expect(stateBounds(null)).toBeUndefined();
    expect(stateBounds("")).toBeUndefined();
    expect(stateBounds("XYZ")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import type { ReferendumRow } from "@/lib/api/geo";
import { referendumBands, referendumFill, referendumNoDataFilter, yesColour } from "./referendum-fill";

const D = ["strongYes", "leanYes", "even", "leanNo", "strongNo"];

const row = (over: Partial<ReferendumRow>): ReferendumRow => ({
  name: "X",
  stateAb: null,
  geoCode: "101",
  enrolment: null,
  ordinaryVotes: null,
  absentVotes: null,
  provisionalVotes: null,
  prepollVotes: null,
  postalVotes: null,
  totalVotes: null,
  turnoutPct: null,
  yesVotes: null,
  noVotes: null,
  informalVotes: null,
  formalVotes: null,
  yesPct: 50,
  noPct: null,
  ...over,
});

describe("yesColour", () => {
  it("maps the Yes share onto the diverging ramp, centred on 50%", () => {
    expect(yesColour(61, D)).toBe("strongYes");
    expect(yesColour(53, D)).toBe("leanYes");
    expect(yesColour(50, D)).toBe("even");
    expect(yesColour(46, D)).toBe("leanNo");
    expect(yesColour(32, D)).toBe("strongNo");
  });

  it("puts the band boundaries on the higher band", () => {
    expect(yesColour(55, D)).toBe("strongYes");
    expect(yesColour(48, D)).toBe("even");
    expect(yesColour(45, D)).toBe("leanNo");
  });
});

describe("referendumFill", () => {
  it("builds a match expression of code → colour, ending in the nodata fallback", () => {
    const expr = referendumFill(
      [row({ geoCode: "201", yesPct: 61 }), row({ geoCode: "318", yesPct: 32 })],
      D,
      "grey",
    ) as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr[1]).toEqual(["get", "code"]);
    expect(expr.slice(2)).toEqual(["201", "strongYes", "318", "strongNo", "grey"]);
  });

  it("skips rows with no boundary code or no Yes share", () => {
    const expr = referendumFill(
      [row({ geoCode: null, yesPct: 61 }), row({ geoCode: "201", yesPct: null }), row({ geoCode: "305", yesPct: 40 })],
      D,
      "grey",
    ) as unknown[];
    expect(expr.slice(2)).toEqual(["305", "strongNo", "grey"]);
  });

  it("returns the bare nodata colour when there is nothing to paint", () => {
    expect(referendumFill([], D, "grey")).toBe("grey");
    expect(referendumFill([row({ geoCode: null })], D, "grey")).toBe("grey");
  });
});

describe("referendumBands", () => {
  it("labels five diverging swatches from Yes to No", () => {
    const bands = referendumBands(D);
    expect(bands).toHaveLength(5);
    expect(bands[0]).toEqual({ color: "strongYes", label: "Yes ≥ 55%" });
    expect(bands[4]).toEqual({ color: "strongNo", label: "Yes < 45%" });
  });
});

describe("referendumNoDataFilter", () => {
  it("selects everything NOT in the results set", () => {
    const rows = [
      { geoCode: "101", yesPct: 61 },
      { geoCode: "102", yesPct: null },
      { geoCode: null, yesPct: 40 },
    ] as unknown as ReferendumRow[];
    expect(referendumNoDataFilter(rows)).toEqual(["!", ["in", ["get", "code"], ["literal", ["101"]]]]);
  });

  it("is undefined when there are no results", () => {
    expect(referendumNoDataFilter([])).toBeUndefined();
  });
});

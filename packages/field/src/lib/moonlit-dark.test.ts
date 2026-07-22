import { describe, expect, it } from "vitest";
import { applyMoonlitDark, installMoonlitDark, type MoonlitMap } from "./moonlit-dark";

/** A fake map exposing a fixed layer list and recording paint writes + event handlers. */
function fakeMap(layers: Array<{ id: string; type: string }>) {
  const paint: Array<[string, string, unknown]> = [];
  const handlers: Record<string, Array<() => void>> = {};
  const map: MoonlitMap = {
    getStyle: () => ({ layers }),
    setPaintProperty: (id, prop, value) => paint.push([id, prop, value]),
    on: (event, cb) => {
      (handlers[event] ??= []).push(cb);
    },
  };
  return { map, paint, fire: (event: string) => handlers[event]?.forEach((cb) => cb()) };
}

// A slice of the dark-v11 base plus a few of OUR overlay layers, which must be left alone.
const STYLE = [
  { id: "background", type: "background" },
  { id: "land", type: "fill" },
  { id: "landuse-residential", type: "fill" },
  { id: "national-park", type: "fill" },
  { id: "building", type: "fill" },
  { id: "water", type: "fill" },
  { id: "waterway", type: "line" },
  { id: "road-motorway", type: "line" },
  { id: "road-street", type: "line" },
  { id: "admin-1-boundary", type: "line" },
  // Our overlays — distinct ids, must NOT be recoloured:
  { id: "turf-fill", type: "fill" },
  { id: "poll-fill", type: "fill" },
  { id: "boundaries-line", type: "line" },
  { id: "walk-route-line", type: "line" },
  { id: "walk-next-leg-line", type: "line" },
  { id: "walk-route-chevrons", type: "symbol" },
  { id: "walk-next-leg-chevrons", type: "symbol" },
  { id: "replay-past-line", type: "line" },
  { id: "replay-future-line", type: "line" },
];

describe("applyMoonlitDark", () => {
  it("recolours the base ground, parks, buildings, water, roads and borders in dark", () => {
    const { map, paint } = fakeMap(STYLE);
    applyMoonlitDark(map, "dark");
    const painted = Object.fromEntries(paint.map(([id, prop, value]) => [id, { prop, value }]));

    expect(painted["background"].prop).toBe("background-color");
    expect(painted["water"].prop).toBe("fill-color");
    expect(painted["road-motorway"].prop).toBe("line-color");
    expect(painted["admin-1-boundary"].prop).toBe("line-color");

    // Distinction between areas: each category gets its own colour.
    expect(painted["water"].value).not.toBe(painted["land"].value);
    expect(painted["national-park"].value).not.toBe(painted["land"].value); // parks read green
    expect(painted["building"].value).not.toBe(painted["land"].value);
    expect(painted["road-motorway"].value).not.toBe(painted["road-street"].value); // arterials pop
  });

  it("never touches our overlay layers", () => {
    const { map, paint } = fakeMap(STYLE);
    applyMoonlitDark(map, "dark");
    const painted = paint.map((p) => p[0]);
    expect(painted).not.toContain("turf-fill");
    expect(painted).not.toContain("poll-fill");
    expect(painted).not.toContain("boundaries-line");
    expect(painted).not.toContain("walk-route-line");
    expect(painted).not.toContain("walk-next-leg-line");
    expect(painted).not.toContain("walk-route-chevrons");
    expect(painted).not.toContain("replay-past-line");
    expect(painted).not.toContain("replay-future-line");
  });

  it("does nothing in the light theme", () => {
    const { map, paint } = fakeMap(STYLE);
    applyMoonlitDark(map, "light");
    expect(paint).toHaveLength(0);
  });

  it("no-ops when the style has no layers yet", () => {
    const { paint } = fakeMap([]);
    const bare: MoonlitMap = { getStyle: () => undefined, setPaintProperty: () => {}, on: () => {} };
    applyMoonlitDark(bare, "dark");
    expect(paint).toHaveLength(0);
  });
});

describe("installMoonlitDark", () => {
  it("applies once immediately and re-applies on every style.load, reading the live theme", () => {
    const { map, paint, fire } = fakeMap(STYLE);
    let theme = "light";
    installMoonlitDark(map, () => theme);
    expect(paint).toHaveLength(0); // light on install → no writes

    theme = "dark";
    fire("style.load"); // a theme toggle swaps the style
    expect(paint.map((p) => p[0])).toEqual(expect.arrayContaining(["background", "water"]));
  });
});

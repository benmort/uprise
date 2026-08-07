import { describe, it, expect } from "vitest";
import type { AreaLevel } from "@/lib/api/geo";
import { AREA_MIN_ZOOM, areaMinZoom, areaSearchMinChars } from "./area-limits";

const LEVELS: AreaLevel[] = ["mb", "sa1", "sa2", "sa3", "sa4"];

describe("areaMinZoom", () => {
  it("floors only the dense levels, matching the API's TILE_MIN_ZOOM", () => {
    expect(areaMinZoom("mb")).toBe(9);
    expect(areaMinZoom("sa1")).toBe(7);
    expect(AREA_MIN_ZOOM).toEqual({ mb: 9, sa1: 7 });
  });

  it("leaves every level small enough to serve whole unfloored", () => {
    for (const level of ["sa2", "sa3", "sa4"] as AreaLevel[]) {
      expect(areaMinZoom(level)).toBe(0);
    }
  });
});

describe("areaSearchMinChars", () => {
  it("needs three characters on the dense levels and two elsewhere", () => {
    expect(areaSearchMinChars("mb")).toBe(3);
    expect(areaSearchMinChars("sa1")).toBe(3);
    expect(areaSearchMinChars("sa2")).toBe(2);
    expect(areaSearchMinChars("sa3")).toBe(2);
    expect(areaSearchMinChars("sa4")).toBe(2);
  });

  it("never asks for fewer than two characters on any level", () => {
    for (const level of LEVELS) expect(areaSearchMinChars(level)).toBeGreaterThanOrEqual(2);
  });
});

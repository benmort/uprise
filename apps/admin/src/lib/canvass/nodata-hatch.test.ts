import { describe, expect, it, vi } from "vitest";
import {
  NODATA_HATCH_ID,
  NODATA_OUTLINE_PAINT,
  buildHatchImage,
  ensureNoDataHatch,
} from "./nodata-hatch";

describe("buildHatchImage", () => {
  it("returns an RGBA buffer of the right size", () => {
    const img = buildHatchImage(8);
    expect(img.width).toBe(8);
    expect(img.height).toBe(8);
    expect(img.data).toHaveLength(8 * 8 * 4);
  });

  it("has both opaque hatch pixels and fully transparent gaps", () => {
    const img = buildHatchImage(8);
    let opaque = 0;
    let clear = 0;
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] === 0) clear += 1;
      else opaque += 1;
    }
    expect(opaque).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
  });

  it("paints line pixels a consistent slate colour", () => {
    const img = buildHatchImage(8);
    // First on-pixel is (0,0): (x+y)%period=0 < lineWidth.
    expect([img.data[0], img.data[1], img.data[2]]).toEqual([100, 116, 139]);
    expect(img.data[3]).toBeGreaterThan(0);
  });
});

describe("ensureNoDataHatch", () => {
  it("registers the pattern once, idempotently", () => {
    let has = false;
    const addImage = vi.fn((_id: string, _img: unknown, _opts?: { pixelRatio?: number }) => {
      has = true;
    });
    const map = { hasImage: () => has, addImage };
    ensureNoDataHatch(map);
    ensureNoDataHatch(map);
    expect(addImage).toHaveBeenCalledTimes(1);
    expect(addImage.mock.calls[0][0]).toBe(NODATA_HATCH_ID);
    expect(addImage.mock.calls[0][2]).toEqual({ pixelRatio: 2 });
  });
});

describe("NODATA_OUTLINE_PAINT", () => {
  it("is a dashed muted outline", () => {
    expect(NODATA_OUTLINE_PAINT["line-dasharray"]).toEqual([2, 2]);
    expect(NODATA_OUTLINE_PAINT["line-color"]).toBe("#64748b");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reverseGeocode } from "./geocode";

const OLD_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

describe("reverseGeocode", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = OLD_TOKEN;
    vi.restoreAllMocks();
  });

  it("builds 'house-number street, suburb' from structured fields (drops state/postcode/country)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          features: [
            {
              place_type: ["address"],
              address: "46",
              text: "Simmons Street",
              place_name: "46 Simmons Street, Newtown New South Wales 2042, Australia",
              context: [
                { id: "locality.1", text: "Newtown" },
                { id: "region.1", text: "New South Wales" },
              ],
            },
          ],
        }),
      })),
    );
    expect(await reverseGeocode(-33.9, 151.18)).toBe("46 Simmons Street, Newtown");
  });

  it("falls back to the first two place_name segments when there are no structured fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ features: [{ place_name: "Newtown, New South Wales, Australia" }] }),
      })),
    );
    expect(await reverseGeocode(-33.9, 151.18)).toBe("Newtown, New South Wales");
  });

  it("calls Mapbox with lng,lat order", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ place_name: "X, Y" }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    await reverseGeocode(-33.9, 151.18);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/151.18,-33.9.json");
  });

  it("returns null with no token", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "";
    expect(await reverseGeocode(-33.9, 151.18)).toBeNull();
  });

  it("returns null for non-finite coords", async () => {
    expect(await reverseGeocode(Number.NaN, 151.18)).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await reverseGeocode(-33.9, 151.18)).toBeNull();
  });

  it("returns null when there are no features", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })));
    expect(await reverseGeocode(-33.9, 151.18)).toBeNull();
  });

  it("returns null on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await reverseGeocode(-33.9, 151.18)).toBeNull();
  });
});

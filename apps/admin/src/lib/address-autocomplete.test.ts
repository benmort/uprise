import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MIN_ADDRESS_QUERY,
  addressSearchToken,
  buildAddressSearchUrl,
  countryForIsoCode,
  hasAddressSearch,
  isoCodeForCountry,
  searchAddresses,
  toSuggestion,
  type AddressSuggestion,
  type MapboxFeature,
} from "./address-autocomplete";

/** toSuggestion() is nullable; every case below expects a row, so assert once here. */
function suggest(feature: MapboxFeature, index?: number): AddressSuggestion {
  const s = toSuggestion(feature, index);
  if (!s) throw new Error("expected a suggestion");
  return s;
}

/** A Mapbox `address` feature shaped like a real AU hit. */
const AU_ADDRESS: MapboxFeature = {
  id: "address.123",
  place_type: ["address"],
  text: "Glebe Point Road",
  address: "12",
  place_name: "12 Glebe Point Road, Glebe, New South Wales 2037, Australia",
  context: [
    { id: "neighborhood.1", text: "Forest Lodge" },
    { id: "postcode.2", text: "2037" },
    { id: "locality.3", text: "Glebe" },
    { id: "place.4", text: "Sydney" },
    { id: "region.5", text: "New South Wales", short_code: "AU-NSW" },
    { id: "country.6", text: "Australia", short_code: "au" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("country mapping", () => {
  it("maps an ISO code to the form's country option and back", () => {
    expect(countryForIsoCode("au")).toBe("australia");
    expect(countryForIsoCode("AU")).toBe("australia");
    expect(countryForIsoCode("gb")).toBe("england");
    expect(isoCodeForCountry("new-zealand")).toBe("nz");
    expect(isoCodeForCountry("America")).toBe("us");
  });

  it("returns an empty string for a country we don't list", () => {
    expect(countryForIsoCode("br")).toBe("");
    expect(countryForIsoCode(undefined)).toBe("");
    expect(isoCodeForCountry("brazil")).toBe("");
    expect(isoCodeForCountry(undefined)).toBe("");
  });
});

describe("addressSearchToken / hasAddressSearch", () => {
  it("reads the public token and reports availability", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test");
    expect(addressSearchToken()).toBe("pk.test");
    expect(hasAddressSearch()).toBe(true);
  });

  it("degrades to unavailable with no token", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    expect(addressSearchToken()).toBe("");
    expect(hasAddressSearch()).toBe(false);
  });
});

describe("buildAddressSearchUrl", () => {
  it("builds an address-biased autocomplete URL", () => {
    const url = new URL(buildAddressSearchUrl("12 Glebe Point Rd", { token: "pk.test" }));
    expect(url.pathname).toContain("12%20Glebe%20Point%20Rd.json");
    expect(url.searchParams.get("access_token")).toBe("pk.test");
    expect(url.searchParams.get("types")).toBe("address,place,locality,postcode");
    expect(url.searchParams.get("autocomplete")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("6");
    expect(url.searchParams.get("country")).toBeNull();
  });

  it("scopes to the selected country and honours a limit", () => {
    const url = new URL(buildAddressSearchUrl("queen st", { token: "t", country: "AU", limit: 3 }));
    expect(url.searchParams.get("country")).toBe("au");
    expect(url.searchParams.get("limit")).toBe("3");
  });
});

describe("toSuggestion", () => {
  it("splits an address feature into the street line and the structured parts", () => {
    expect(toSuggestion(AU_ADDRESS)).toEqual({
      id: "address.123",
      line1: "12 Glebe Point Road",
      context: "Glebe, New South Wales 2037, Australia",
      suburb: "Glebe",
      city: "Sydney",
      state: "NSW",
      postcode: "2037",
      country: "australia",
    });
  });

  it("falls back to the neighbourhood, then the place, for the suburb", () => {
    const noLocality = { ...AU_ADDRESS, context: AU_ADDRESS.context?.filter((c) => !c.id?.startsWith("locality.")) };
    expect(suggest(noLocality).suburb).toBe("Forest Lodge");

    const placeOnly: MapboxFeature = {
      ...AU_ADDRESS,
      context: [
        { id: "place.4", text: "Katoomba" },
        { id: "region.5", text: "New South Wales", short_code: "AU-NSW" },
      ],
    };
    const s = suggest(placeOnly);
    expect(s).toMatchObject({ suburb: "Katoomba", city: "Katoomba", postcode: "" });
  });

  it("uses the region's full name when there is no short code", () => {
    const noShortCode: MapboxFeature = {
      ...AU_ADDRESS,
      context: [{ id: "region.5", text: "Ile-de-France" }],
    };
    expect(suggest(noShortCode).state).toBe("Ile-de-France");
  });

  it("reads a postcode feature's own name as the postcode", () => {
    const feature: MapboxFeature = {
      id: "postcode.9",
      place_type: ["postcode"],
      text: "2037",
      place_name: "2037, Glebe, New South Wales, Australia",
      context: [{ id: "place.4", text: "Sydney" }],
    };
    const s = suggest(feature);
    expect(s).toMatchObject({ line1: "2037", postcode: "2037", context: "Glebe, New South Wales, Australia" });
  });

  it("keeps the full place name as context when it doesn't start with the street line", () => {
    const feature: MapboxFeature = { id: "place.1", text: "Glebe", place_name: "Sydney, Australia" };
    expect(suggest(feature).context).toBe("Sydney, Australia");
  });

  it("synthesises an id when Mapbox omits one, and returns null for an empty feature", () => {
    expect(suggest({ text: "Glebe" }, 2).id).toBe("Glebe-2");
    expect(toSuggestion({})).toBeNull();
    expect(toSuggestion({ context: [] })).toBeNull();
  });

  it("leaves the country blank for a place we don't list", () => {
    const brazil: MapboxFeature = {
      ...AU_ADDRESS,
      context: [{ id: "country.6", text: "Brazil", short_code: "br" }],
    };
    expect(suggest(brazil).country).toBe("");
  });
});

describe("searchAddresses", () => {
  const okResponse = (features: MapboxFeature[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ features }),
  });

  it("returns suggestions for a token-backed query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([AU_ADDRESS, {}]));
    vi.stubGlobal("fetch", fetchMock);

    const hits = await searchAddresses(" 12 Glebe Point Rd ", { token: "pk.test", country: "au" });

    expect(hits).toHaveLength(1);
    expect(hits[0].line1).toBe("12 Glebe Point Road");
    const called = new URL(fetchMock.mock.calls[0][0] as string);
    expect(called.pathname).toContain("12%20Glebe%20Point%20Rd.json");
    expect(called.searchParams.get("country")).toBe("au");
  });

  it("passes an abort signal through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await searchAddresses("glebe point", { token: "pk.test", signal });

    expect(fetchMock.mock.calls[0][1]).toEqual({ signal });
  });

  it("tolerates a body with no features array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    await expect(searchAddresses("glebe point", { token: "pk.test" })).resolves.toEqual([]);
  });

  it("skips the request for a short query or a missing token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");

    expect(await searchAddresses("gl", { token: "pk.test" })).toEqual([]);
    expect(await searchAddresses("glebe point")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(MIN_ADDRESS_QUERY).toBe(3);
  });

  it("falls back to the env token when none is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([AU_ADDRESS]));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.env");

    await searchAddresses("glebe point");

    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("access_token")).toBe("pk.env");
  });

  it("throws on an HTTP failure so the caller can show the error row", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    await expect(searchAddresses("glebe point", { token: "pk.test" })).rejects.toThrow(
      "Address search failed (429)"
    );
  });
});

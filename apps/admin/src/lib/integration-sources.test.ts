import { describe, expect, it } from "vitest";
import {
  actionNetworkGroupOptions,
  nationBuilderNationOptions,
  audienceNameForList,
  audienceSourceFor,
  autoSelectedSourceId,
  findSource,
  providerLabel,
  syncCardTitle,
  toImportSources,
} from "./integration-sources";
import type { IntegrationConnectionRow } from "./api";

const row = (over: Partial<IntegrationConnectionRow> = {}): IntegrationConnectionRow =>
  ({
    id: "c1",
    type: "ACTION_NETWORK",
    name: "Action Network",
    status: "ACTIVE",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  }) as IntegrationConnectionRow;

describe("toImportSources", () => {
  it("returns nothing when the tenant has connected nothing", () => {
    // The empty case is the point: no connection ⇒ no source ⇒ the page offers no
    // import at all, rather than falling through to a platform-wide account.
    expect(toImportSources([])).toEqual([]);
    expect(toImportSources(null)).toEqual([]);
    expect(toImportSources(undefined)).toEqual([]);
  });

  it("excludes disconnected connections", () => {
    const sources = toImportSources([row({ id: "a" }), row({ id: "b", status: "INACTIVE" })]);
    expect(sources.map((s) => s.id)).toEqual(["a"]);
  });

  it("labels a default-named connection with just the provider", () => {
    expect(toImportSources([row()])[0].optionLabel).toBe("Action Network");
  });

  it("disambiguates a custom-named connection with the provider", () => {
    const [source] = toImportSources([row({ name: "Campaign account" })]);
    expect(source.optionLabel).toBe("Action Network – Campaign account");
    expect(source.providerLabel).toBe("Action Network");
  });

  it("falls back to the provider label when a connection has no name", () => {
    const [source] = toImportSources([row({ name: "   " })]);
    expect(source.name).toBe("Action Network");
    expect(source.optionLabel).toBe("Action Network");
  });

  it("leads with the group when the connection is group-scoped", () => {
    const [source] = toImportSources([row({ name: "Main", group: "Riverside West" })]);
    expect(source.group).toBe("Riverside West");
    expect(source.optionLabel).toBe("Action Network – Riverside West");
  });

  it("maps the internal provider", () => {
    const [source] = toImportSources([row({ type: "INTERNAL", name: "Internal source" })]);
    expect(source.optionLabel).toBe("Internal source");
    expect(source.type).toBe("INTERNAL");
  });
});

describe("autoSelectedSourceId", () => {
  it("selects the only source when there is exactly one", () => {
    const sources = toImportSources([row({ id: "only" })]);
    expect(autoSelectedSourceId(sources)).toBe("only");
  });

  it("selects nothing when there are several — the organiser must choose", () => {
    const sources = toImportSources([row({ id: "a" }), row({ id: "b", type: "INTERNAL" })]);
    expect(autoSelectedSourceId(sources)).toBe("");
  });

  it("selects nothing when there are none", () => {
    expect(autoSelectedSourceId([])).toBe("");
  });
});

describe("findSource", () => {
  it("finds by id and returns undefined for an unknown id", () => {
    const sources = toImportSources([row({ id: "a" })]);
    expect(findSource(sources, "a")?.id).toBe("a");
    expect(findSource(sources, "nope")).toBeUndefined();
  });
});

describe("audienceNameForList", () => {
  const source = toImportSources([row()])[0];

  it("prefixes the list name with the provider", () => {
    expect(audienceNameForList(source, "VIC MOB")).toBe("Action Network: VIC MOB");
  });

  it("does not double-prefix an already-prefixed name", () => {
    expect(audienceNameForList(source, "Action Network: VIC MOB")).toBe("Action Network: VIC MOB");
    expect(audienceNameForList(source, "action network:  VIC MOB")).toBe("Action Network: VIC MOB");
  });

  it("names an unnamed list rather than leaving a bare prefix", () => {
    expect(audienceNameForList(source, "")).toBe("Action Network: Unnamed list");
    expect(audienceNameForList(source, null)).toBe("Action Network: Unnamed list");
  });

  it("uses the internal provider label for an internal source", () => {
    const internal = toImportSources([row({ type: "INTERNAL", name: "Internal source" })])[0];
    expect(audienceNameForList(internal, "Members")).toBe("Internal source: Members");
  });

  it("falls back to a neutral prefix with no source", () => {
    expect(audienceNameForList(undefined, "Members")).toBe("Import: Members");
  });
});

describe("audienceSourceFor / providerLabel / syncCardTitle", () => {
  it("maps the connection type to the audience source column", () => {
    expect(audienceSourceFor("ACTION_NETWORK")).toBe("ACTION_NETWORK");
    expect(audienceSourceFor("NATION_BUILDER")).toBe("NATION_BUILDER");
    expect(audienceSourceFor("INTERNAL")).toBe("INTERNAL");
  });

  it("passes an unknown provider through rather than blanking it", () => {
    expect(providerLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("titles the card neutrally, trailing the provider once a source is chosen", () => {
    expect(syncCardTitle(undefined)).toBe("External integration list sync");
    expect(syncCardTitle(toImportSources([row()])[0])).toBe(
      "External integration list sync – Action Network",
    );
  });
});

describe("actionNetworkGroupOptions", () => {
  it("lists one option per connected Action Network group, labelled by group", () => {
    const sources = toImportSources([
      row({ id: "vic", group: "Riverside West" }),
      row({ id: "nsw", group: "Riverside North" }),
      row({ id: "int", type: "INTERNAL", name: "Warehouse" }),
    ]);
    expect(actionNetworkGroupOptions(sources)).toEqual([
      { id: "vic", label: "Riverside West" },
      { id: "nsw", label: "Riverside North" },
    ]);
  });

  it("falls back to the connection name for a legacy group-less connection", () => {
    const sources = toImportSources([row({ id: "a", name: "Main account" })]);
    expect(actionNetworkGroupOptions(sources)).toEqual([{ id: "a", label: "Main account" }]);
  });
});

describe("nationBuilderNationOptions", () => {
  it("lists one option per connected nation, labelled by the nation (group)", () => {
    const sources = toImportSources([
      row({ id: "nb1", type: "NATION_BUILDER", name: "Nation", group: "riverside" }),
      row({ id: "an1", group: "Riverside West" }),
    ]);
    expect(nationBuilderNationOptions(sources)).toEqual([{ id: "nb1", label: "riverside" }]);
  });
});

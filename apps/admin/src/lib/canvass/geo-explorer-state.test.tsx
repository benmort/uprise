import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import { GeoExplorerProvider, useGeoExplorer, type GeocodeHit } from "./geo-explorer-state";
import type { AreaHit, NearbyAddress, PollingPlacePoint } from "@/lib/api/geo";
import type { SelectedArea } from "@/components/canvass/turf-draw-map";

/**
 * The durable state behind the unified geo explorer. Its whole reason to exist is that the map
 * and the panels are hoisted into the `(geo)` layout while the panel underneath is swapped on a
 * kind switch – anything a panel held in its own `useState` would be lost mid-flow. What is
 * pinned here is that contract: state survives the swap, the callbacks handed to the map keep a
 * stable identity, and the map's viewport chatter is deduplicated before it reaches the panels.
 */

/**
 * JSX shim, not a behaviour double. `apps/admin/tsconfig.json` sets `jsx: "preserve"` (Next does
 * the compiling), so vitest's esbuild falls back to the CLASSIC transform and emits bare
 * `React.createElement` calls – and `geo-explorer-state.tsx`, like every Next client component,
 * never imports React. Without React on the global the real provider cannot render at all. The
 * proper fix is `esbuild: { jsx: "automatic" }` in `vitest.config.ts`; until that lands this is
 * what any test rendering a `src/lib` component needs.
 */
vi.stubGlobal("React", React);

const wrapper = ({ children }: { children: ReactNode }) => (
  <GeoExplorerProvider>{children}</GeoExplorerProvider>
);
const renderGeo = () => renderHook(() => useGeoExplorer(), { wrapper });

const area = (over: Partial<SelectedArea> = {}): SelectedArea => ({
  level: "sa1",
  code: "10101100101",
  name: "Braddon (North)",
  geometry: { type: "Polygon", coordinates: [] },
  ...over,
});

const hit: GeocodeHit = {
  id: "addr.1",
  label: "1 Test St",
  context: "Braddon ACT 2612",
  lat: -35.27,
  lng: 149.13,
};

afterEach(() => vi.restoreAllMocks());

describe("useGeoExplorer guard", () => {
  // Silently handing back a null context would surface as "cannot read setUniverse of null" deep
  // inside whichever panel happened to mount first; the named throw points at the real mistake.
  it("throws a provider-shaped error when used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useGeoExplorer())).toThrow(/GeoExplorerProvider/);
  });
});

describe("initial state", () => {
  it("starts on the hybrid universe with nothing picked", () => {
    const { result } = renderGeo();
    // "hybrid" is the shared default the four kinds used to each hold their own copy of.
    expect(result.current.universe).toBe("hybrid");
    expect(result.current.divisionSelected).toBeNull();
    expect(result.current.selectedAreas).toEqual([]);
    expect(result.current.drawnPolygons).toEqual([]);
    expect(result.current.viewportAreas).toEqual([]);
    expect(result.current.viewTooZoomed).toBe(false);
    expect(result.current.picked).toBeNull();
    expect(result.current.doors).toEqual([]);
    expect(result.current.activePid).toBe("");
    expect(result.current.pollingPlaces).toEqual([]);
    expect(result.current.pollingSelectedId).toBe("");
  });

  // `mapBounds` is the "has the map reported yet" signal – the polling-places panel only scopes
  // its booth query to a bbox when this is non-null, and in list view there is no map at all.
  // A `[0,0,0,0]` seed would scope the very first query to the Gulf of Guinea.
  it("has no map bounds until the map reports", () => {
    expect(renderGeo().result.current.mapBounds).toBeNull();
  });

  // DrawControl clears the freehand layer on `if (clearToken)`, so a truthy seed would wipe the
  // draw the moment the map mounted.
  it("starts the clear token falsy", () => {
    expect(renderGeo().result.current.clearToken).toBe(0);
  });
});

describe("toggleSelectedArea", () => {
  it("adds an area, then removes it on a second toggle", () => {
    const { result } = renderGeo();
    act(() => result.current.toggleSelectedArea(area()));
    expect(result.current.selectedAreas).toHaveLength(1);
    act(() => result.current.toggleSelectedArea(area()));
    expect(result.current.selectedAreas).toEqual([]);
  });

  /**
   * The deselect path never gets the same object back. Clicking the area on the map builds a hit
   * from the vector tile, while the "in view" row re-fetches the boundary via `getArea` and the
   * selected chip passes the stored object – three different geometries for one area. Matching on
   * identity (or on geometry) would leave the area stuck selected and quietly double it up on the
   * next click.
   */
  it("matches on level + code, not on the object or its geometry", () => {
    const { result } = renderGeo();
    act(() => result.current.toggleSelectedArea(area()));
    act(() =>
      result.current.toggleSelectedArea(
        area({ name: "SA1 10101100101", geometry: { type: "MultiPolygon", coordinates: [] } }),
      ),
    );
    expect(result.current.selectedAreas).toEqual([]);
  });

  // The same numeric code exists at more than one ASGS level; treating them as one entry would
  // make selecting the SA2 silently deselect the SA1 the organiser had already banked.
  it("keeps areas that share a code across different levels", () => {
    const { result } = renderGeo();
    act(() => result.current.toggleSelectedArea(area({ level: "sa1" })));
    act(() => result.current.toggleSelectedArea(area({ level: "sa2" })));
    expect(result.current.selectedAreas.map((a) => a.level)).toEqual(["sa1", "sa2"]);
  });

  it("removes only the toggled area and leaves the rest in order", () => {
    const { result } = renderGeo();
    const codes = ["a", "b", "c"];
    act(() => codes.forEach((code) => result.current.toggleSelectedArea(area({ code }))));
    act(() => result.current.toggleSelectedArea(area({ code: "b" })));
    expect(result.current.selectedAreas.map((a) => a.code)).toEqual(["a", "c"]);
  });

  // React batches the three toggles above into one commit. Reading `selectedAreas` from the
  // closure instead of the updater would drop everything but the last of them.
  it("applies every toggle in a batch, not just the last", () => {
    const { result } = renderGeo();
    act(() => ["a", "b", "c"].forEach((code) => result.current.toggleSelectedArea(area({ code }))));
    expect(result.current.selectedAreas).toHaveLength(3);
  });
});

describe("bumpClearToken", () => {
  // The token is a signal, not a count: DrawControl only reacts to it *changing*. Both callers
  // that bump it ("add drawn to basket" and "clear drawn") also null the polygons in the same
  // commit, so a bump that collapsed into the previous value would leave the freehand shapes
  // painted on a map whose state says there are none.
  it("changes on every bump, including two in one commit", () => {
    const { result } = renderGeo();
    act(() => result.current.bumpClearToken());
    expect(result.current.clearToken).toBe(1);
    act(() => {
      result.current.bumpClearToken();
      result.current.bumpClearToken();
    });
    expect(result.current.clearToken).toBe(3);
  });
});

describe("setViewportAreas", () => {
  // The list and the "zoom in to see areas" hint are one piece of information. Publishing them
  // through a single callback keeps them in one commit, so the panel can never paint a fresh
  // list of areas under a banner telling the organiser the view is too zoomed out to have any.
  it("publishes the list and the too-zoomed flag together", () => {
    const { result } = renderGeo();
    const areas: AreaHit[] = [{ level: "sa1", code: "10101100101", name: "Braddon (North)" }];
    act(() => result.current.setViewportAreas(areas, true));
    expect(result.current.viewportAreas).toEqual(areas);
    expect(result.current.viewTooZoomed).toBe(true);

    act(() => result.current.setViewportAreas([], false));
    expect(result.current.viewportAreas).toEqual([]);
    expect(result.current.viewTooZoomed).toBe(false);
  });
});

describe("setMapBounds", () => {
  const canberra: [number, number, number, number] = [149.0, -35.4, 149.2, -35.2];

  it("records the first report from the map", () => {
    const { result } = renderGeo();
    act(() => result.current.setMapBounds(canberra));
    expect(result.current.mapBounds).toEqual(canberra);
  });

  /**
   * Mapbox fires `moveend` for gestures that do not actually move the viewport – a click-drag of
   * a pixel, a resize settle, the end of an inertial glide. Handing back a fresh array for each
   * of those would rebuild the context value and re-render every panel mounted under it, and any
   * effect or memo keyed on `mapBounds` compares by identity, so it would refire too.
   */
  it("keeps the previous array when the viewport has not moved", () => {
    const { result } = renderGeo();
    act(() => result.current.setMapBounds(canberra));
    const first = result.current.mapBounds;

    act(() => result.current.setMapBounds([...canberra]));
    expect(result.current.mapBounds).toBe(first);
  });

  // Sub-microdegree jitter is roughly a tenth of a millimetre on the ground – below anything the
  // organiser can see and well below the 5dp the booth-list bbox key is rounded to.
  it("absorbs jitter below the tolerance", () => {
    const { result } = renderGeo();
    act(() => result.current.setMapBounds(canberra));
    const first = result.current.mapBounds;

    act(() => result.current.setMapBounds([149.0000001, -35.4, 149.2, -35.2]));
    expect(result.current.mapBounds).toBe(first);
  });

  // The other half of the deal: a real pan must get through, or the "scope to map" booth list
  // would keep answering for wherever the map first landed.
  it("takes a genuine move, in any one corner", () => {
    const { result } = renderGeo();
    act(() => result.current.setMapBounds(canberra));
    const moved: [number, number, number, number] = [149.0, -35.4, 149.2, -35.1];
    act(() => result.current.setMapBounds(moved));
    expect(result.current.mapBounds).toEqual(moved);
  });
});

describe("callback identity", () => {
  /**
   * These four are handed to the always-mounted map as props (`onToggleArea`, `onBoundsChange`,
   * `onViewportAreasChange`) and into panel dep arrays. A new identity on every state change
   * would tear down and re-register the map's own handlers on every pan, which is precisely the
   * churn the hoisted map exists to avoid.
   */
  it("survives unrelated state changes", () => {
    const { result } = renderGeo();
    const before = {
      toggleSelectedArea: result.current.toggleSelectedArea,
      bumpClearToken: result.current.bumpClearToken,
      setViewportAreas: result.current.setViewportAreas,
      setMapBounds: result.current.setMapBounds,
    };

    act(() => {
      result.current.setUniverse("none");
      result.current.setPicked(hit);
      result.current.setMapBounds([149.0, -35.4, 149.2, -35.2]);
    });

    expect(result.current.toggleSelectedArea).toBe(before.toggleSelectedArea);
    expect(result.current.bumpClearToken).toBe(before.bumpClearToken);
    expect(result.current.setViewportAreas).toBe(before.setViewportAreas);
    expect(result.current.setMapBounds).toBe(before.setMapBounds);
  });
});

describe("the published value", () => {
  /**
   * The context object is memoised over a hand-written dep list of seventeen entries. A field
   * left out of that list pins every consumer to the value it held when some *other* field last
   * changed – the panel renders stale data and nothing errors. Each field therefore has to be
   * moved on its own here: change several at once and a missing dep hides, because a sibling
   * dep's change recomputes the memo anyway.
   */
  it("re-publishes each field on a change to that field alone", () => {
    const { result } = renderGeo();
    const doors = [{ gnafPid: "GAACT714857062", address: "1 Test St" }] as NearbyAddress[];
    const places = [
      { id: "pp-1", lat: -35.27, lng: 149.13, name: "Braddon Hall" },
    ] as PollingPlacePoint[];
    const polygons: GeoJSON.Polygon[] = [{ type: "Polygon", coordinates: [] }];

    act(() => result.current.setUniverse("existing"));
    expect(result.current.universe).toBe("existing");

    act(() => result.current.setDivisionSelected({ type: "ced", code: "CED801" }));
    expect(result.current.divisionSelected).toEqual({ type: "ced", code: "CED801" });

    act(() => result.current.setSelectedAreas([area()]));
    expect(result.current.selectedAreas).toEqual([area()]);

    act(() => result.current.setDrawnPolygons(polygons));
    expect(result.current.drawnPolygons).toEqual(polygons);

    act(() => result.current.bumpClearToken());
    expect(result.current.clearToken).toBe(1);

    act(() => result.current.setViewportAreas([{ level: "sa2", code: "801011", name: "Braddon" }], true));
    expect(result.current.viewportAreas).toHaveLength(1);
    expect(result.current.viewTooZoomed).toBe(true);

    act(() => result.current.setPicked(hit));
    expect(result.current.picked).toEqual(hit);

    act(() => result.current.setDoors(doors));
    expect(result.current.doors).toEqual(doors);

    act(() => result.current.setActivePid("GAACT714857062"));
    expect(result.current.activePid).toBe("GAACT714857062");

    act(() => result.current.setPollingPlaces(places));
    expect(result.current.pollingPlaces).toEqual(places);

    act(() => result.current.setPollingSelectedId("pp-1"));
    expect(result.current.pollingSelectedId).toBe("pp-1");

    act(() => result.current.setMapBounds([149.0, -35.4, 149.2, -35.2]));
    expect(result.current.mapBounds).toEqual([149.0, -35.4, 149.2, -35.2]);
  });
});

describe("durability across a kind switch", () => {
  function AddressesPanel() {
    const { setPicked, setActivePid } = useGeoExplorer();
    return (
      <button
        onClick={() => {
          setPicked(hit);
          setActivePid("GAACT714857062");
        }}
      >
        plot
      </button>
    );
  }

  function PollingPanel() {
    const { picked, activePid } = useGeoExplorer();
    return <span data-testid="carried">{`${picked?.label ?? "none"}|${activePid || "none"}`}</span>;
  }

  /**
   * THE reason this provider exists. The panels cross-fade under an always-mounted map, so the
   * Addresses panel unmounts when the organiser flips to Polling places. Held in the panel's own
   * `useState`, the plotted point and the active door would be gone on the way back – the map
   * would still be sitting over the address, with nothing selected.
   */
  it("holds panel state while the panel itself unmounts and remounts", () => {
    const { rerender } = render(
      <GeoExplorerProvider>
        <AddressesPanel />
      </GeoExplorerProvider>,
    );
    act(() => screen.getByText("plot").click());

    rerender(
      <GeoExplorerProvider>
        <PollingPanel />
      </GeoExplorerProvider>,
    );
    expect(screen.getByTestId("carried")).toHaveTextContent("1 Test St|GAACT714857062");
  });

  // Sibling panels read one store, not a copy each – the kind-agnostic "who to include" control
  // is rendered outside the panel and has to move the same universe the panel cuts turf with.
  it("shares one store between siblings", () => {
    function UniverseControl() {
      const { setUniverse } = useGeoExplorer();
      return <button onClick={() => setUniverse("none")}>empty</button>;
    }
    function UniverseReadout() {
      return <span data-testid="universe">{useGeoExplorer().universe}</span>;
    }

    render(
      <GeoExplorerProvider>
        <UniverseControl />
        <UniverseReadout />
      </GeoExplorerProvider>,
    );
    expect(screen.getByTestId("universe")).toHaveTextContent("hybrid");
    act(() => screen.getByText("empty").click());
    expect(screen.getByTestId("universe")).toHaveTextContent("none");
  });
});

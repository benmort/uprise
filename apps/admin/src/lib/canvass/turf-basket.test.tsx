import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import {
  TurfBasketProvider,
  useTurfBasket,
  type BasketAddress,
  type BasketArea,
  type BasketDivision,
} from "./turf-basket";

/**
 * The cross-tab "my turf" basket. Two things make it worth pinning: it is the only piece of the
 * turf-cut flow that survives a reload (there is no server draft), and it is the only place that
 * knows the geo tree – whether a part the organiser is about to add is already inside a part they
 * banked three panels ago. Both failures are silent: a lost basket looks like "the site forgot",
 * and a missed containment ships a turf that double-counts a whole state's doors.
 */

/**
 * JSX shim, not a behaviour double. `apps/admin/tsconfig.json` sets `jsx: "preserve"` (Next does
 * the compiling), so vitest's esbuild falls back to the CLASSIC transform and emits bare
 * `React.createElement` calls – and `turf-basket.tsx`, like every Next client component, never
 * imports React. Without React on the global the real provider cannot render at all. Same shim,
 * same reason, as `geo-explorer-state.test.tsx`.
 */
vi.stubGlobal("React", React);

/**
 * Hard-coded on purpose. The key is the persistence contract: renaming it silently orphans every
 * basket already sitting in an organiser's browser, and the basket is meant to span tabs, so both
 * sides of that handshake have to agree on one literal string.
 */
const STORAGE_KEY = "uprise.turfBasket";

const wrapper = ({ children }: { children: ReactNode }) => (
  <TurfBasketProvider>{children}</TurfBasketProvider>
);
const renderBasket = () => renderHook(() => useTurfBasket(), { wrapper });

// ASGS codes at their real lengths – SA4 3, SA3 5, SA2 9, SA1 11 – because the containment rule
// is a prefix-and-length test and shortened stand-ins would not exercise it honestly.
const ACT = { digit: "8", sa4: "801", sa3: "80101", sa2: "801011001", sa1: "80101100101" };
const NSW = { digit: "1", sa4: "101", sa1: "10102100701" };

const stateAct: BasketDivision = { type: "ste", code: ACT.digit, name: "Australian Capital Territory" };
const canberra: BasketDivision = { type: "ced", code: "CED801", name: "Canberra", stateDigit: ACT.digit };
const sydney: BasketDivision = { type: "ced", code: "CED101", name: "Sydney", stateDigit: NSW.digit };

const area = (over: Partial<BasketArea> = {}): BasketArea => ({
  level: "sa1",
  code: ACT.sa1,
  name: "Braddon (North)",
  ...over,
});

const door = (over: Partial<BasketAddress> = {}): BasketAddress => ({
  gnafPid: "GAACT714857062",
  label: "1 Test St, Braddon",
  lat: -35.27,
  lng: 149.13,
  stateDigit: ACT.digit,
  ...over,
});

const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[149, -35], [149.1, -35], [149.1, -35.1], [149, -35]]] };

/**
 * An in-memory `localStorage`, not a behaviour double – the real one is missing here. Node 22
 * defines a global `localStorage` that is undefined unless `--localstorage-file` is passed, and
 * vitest copies the Node globals over jsdom's own, so `window.localStorage` comes out undefined
 * and the provider's persistence lands in its `catch` on every run. Installing a faithful Storage
 * is what makes the reload path testable at all; the semantics below are the spec's (values are
 * stringified, a missing key reads back null).
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}
const installStorage = (storage: Storage) =>
  Object.defineProperty(window, "localStorage", { configurable: true, writable: true, value: storage });

beforeEach(() => installStorage(memoryStorage()));
afterEach(() => vi.restoreAllMocks());

describe("useTurfBasket guard", () => {
  // Handing back a null context instead would surface as "cannot read addDivision of null" inside
  // whichever panel mounted first, rather than pointing at the layout that forgot the provider.
  it("throws a provider-shaped error when used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTurfBasket())).toThrow(/TurfBasketProvider/);
  });
});

describe("initial state", () => {
  it("starts empty with a zero count", () => {
    const { result } = renderBasket();
    expect(result.current.basket).toEqual({ divisions: [], areas: [], polygons: [], addresses: [] });
    expect(result.current.count).toBe(0);
  });

  // `MyTurfPanel` renders nothing at all while `count` is 0, so the count is what makes the basket
  // appear – it has to sum all four buckets, not just the divisions the first explorer adds.
  it("counts divisions, areas, polygons and addresses together", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.addDivision(canberra);
      result.current.toggleArea(area());
      result.current.setPolygons([polygon]);
      result.current.addAddress(door());
    });
    expect(result.current.count).toBe(4);
  });
});

describe("persistence", () => {
  // The basket spans four explorer pages and a reload; without this it is a per-page scratchpad
  // and the "stack parts, then cut once" flow it exists for is impossible.
  it("restores a stored basket on mount", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ divisions: [canberra], areas: [area()], polygons: [], addresses: [door()] }),
    );
    const { result } = renderBasket();
    expect(result.current.basket.divisions).toEqual([canberra]);
    expect(result.current.basket.areas).toEqual([area()]);
    expect(result.current.basket.addresses).toEqual([door()]);
    expect(result.current.count).toBe(3);
  });

  it("writes every change back", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(canberra));
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).divisions).toEqual([canberra]);

    act(() => result.current.removeDivision("ced", "CED801"));
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).divisions).toEqual([]);
  });

  /**
   * A basket stored before `addresses` (or `polygons`) existed comes back missing that key, and
   * every consumer maps over all four – `MyTurfPanel` does `basket.addresses.map`, `cut()` does
   * `basket.polygons`. Without the EMPTY floor an organiser with an old basket would hit a blank
   * page on the turf-cut screen with no way back except clearing site data.
   */
  it("fills in keys an older stored shape is missing", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ divisions: [canberra] }));
    const { result } = renderBasket();
    expect(result.current.basket.areas).toEqual([]);
    expect(result.current.basket.polygons).toEqual([]);
    expect(result.current.basket.addresses).toEqual([]);
  });

  // Corrupt JSON is a render-time throw in an effect, which React escalates to unmounting the
  // whole `(geo)` tree. Starting empty loses a basket; throwing loses the four explorer pages.
  it("starts empty rather than throwing on corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderBasket();
    expect(result.current.count).toBe(0);
  });

  // Safari private mode throws from the Storage methods themselves. The basket is still perfectly
  // usable for the length of the session – it just cannot outlive the tab.
  it("still works in memory when storage is unavailable", () => {
    const throwing = () => {
      throw new Error("QuotaExceededError");
    };
    installStorage({ ...memoryStorage(), getItem: throwing, setItem: throwing } as Storage);
    const { result } = renderBasket();
    act(() => result.current.addDivision(canberra));
    expect(result.current.basket.divisions).toEqual([canberra]);
  });
});

describe("addDivision", () => {
  it("adds a division and refuses an exact duplicate", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(canberra));
    act(() => result.current.addDivision({ ...canberra, name: "Canberra (2021)" }));
    expect(result.current.basket.divisions).toEqual([canberra]);
  });

  // The same numeric code exists across layers – an LGA and a state seat can both be "801". Keying
  // the dedup on the code alone would make adding the LGA silently drop the seat.
  it("keeps the same code at different division types", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.addDivision(canberra);
      result.current.addDivision({ ...canberra, type: "lga" });
    });
    expect(result.current.basket.divisions.map((d) => d.type)).toEqual(["ced", "lga"]);
  });

  /**
   * The whole point of the containment rule. Every part is unioned server-side by
   * `createTurfFromSources`, so a seat already inside a banked state contributes nothing but does
   * pad the "My turf (n)" count and the parts list the organiser is reading to decide what they
   * cut. `coveredBy` is what tells them why the Add button did nothing.
   */
  it("blocks a division whose state is already in the basket", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() => result.current.addDivision(canberra));
    expect(result.current.basket.divisions).toHaveLength(1);
    expect(result.current.hasDivision("ced", "CED801")).toBe(false);
    expect(result.current.coveredBy({ kind: "division", type: "ced", code: "CED801", stateDigit: ACT.digit })).toBe(
      "Australian Capital Territory",
    );
  });

  // A state-wide upper-house electorate (the Senate, a Legislative Council) is a division whose
  // boundary IS the jurisdiction – banking the state has to absorb it like any other seat.
  it("blocks a state-wide chamber electorate the same way", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() =>
      result.current.addDivision({
        type: "chamber_electorate",
        code: "SENATE-ACT",
        name: "Senate (ACT)",
        stateDigit: ACT.digit,
      }),
    );
    expect(result.current.basket.divisions).toHaveLength(1);
  });

  it("adding a whole state absorbs the areas, doors and seats inside it", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.addDivision(canberra);
      result.current.addDivision(sydney);
      result.current.toggleArea(area({ code: ACT.sa1 }));
      result.current.toggleArea(area({ code: NSW.sa1, name: "Braidwood" }));
      result.current.addAddress(door());
      result.current.addAddress(door({ gnafPid: "GANSW1", stateDigit: NSW.digit }));
    });
    act(() => result.current.addDivision(stateAct));

    // Only the ACT parts go: the NSW seat, area and door are a different jurisdiction and the
    // organiser never said anything about them.
    expect(result.current.basket.divisions.map((d) => d.code)).toEqual(["CED101", ACT.digit]);
    expect(result.current.basket.areas.map((a) => a.code)).toEqual([NSW.sa1]);
    expect(result.current.basket.addresses.map((a) => a.gnafPid)).toEqual(["GANSW1"]);
  });

  // Adding a state stamps its own digit on the stored item so the later cover checks – which read
  // `stateDigit`, not `code` – recognise it however it was added.
  it("stamps the state's own digit onto the stored item", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    expect(result.current.basket.divisions[0]).toMatchObject({ type: "ste", code: ACT.digit, stateDigit: ACT.digit });
  });

  // Re-clicking the state row on the States panel must not stack a second copy – "My turf (2)"
  // for one state is how an organiser starts doubting the whole basket.
  it("never duplicates a state, but still absorbs what arrived since", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() => result.current.toggleArea(area({ code: NSW.sa1 })));
    act(() => result.current.addDivision({ ...stateAct, name: "ACT" }));
    expect(result.current.basket.divisions).toHaveLength(1);
    expect(result.current.basket.divisions[0].name).toBe("Australian Capital Territory");
  });

  // The Divisions panel adds straight from a search-result row, and a row for a division whose
  // state the API did not resolve must still be addable rather than silently dropped.
  it("adds a division with no known state", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() => result.current.addDivision({ type: "lga", code: "LGA89399", name: "Unincorporated" }));
    expect(result.current.basket.divisions).toHaveLength(2);
  });
});

describe("removeDivision and hasDivision", () => {
  it("removes only the named division and leaves the rest in order", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.addDivision(canberra);
      result.current.addDivision(sydney);
      result.current.addDivision({ ...canberra, type: "lga" });
    });
    act(() => result.current.removeDivision("ced", "CED801"));
    expect(result.current.basket.divisions.map((d) => `${d.type}:${d.code}`)).toEqual(["ced:CED101", "lga:CED801"]);
  });

  // `hasDivision` drives the row's Add/Remove toggle. Reading a stale basket would leave "Add" on
  // a division already banked, and clicking it again is a no-op the organiser cannot explain.
  it("tracks the basket without a render in between", () => {
    const { result } = renderBasket();
    expect(result.current.hasDivision("ced", "CED801")).toBe(false);
    act(() => result.current.addDivision(canberra));
    expect(result.current.hasDivision("ced", "CED801")).toBe(true);
    expect(result.current.hasDivision("lga", "CED801")).toBe(false);
  });
});

describe("toggleArea", () => {
  it("adds an area, then removes it on a second toggle", () => {
    const { result } = renderBasket();
    act(() => result.current.toggleArea(area()));
    expect(result.current.basket.areas).toHaveLength(1);
    act(() => result.current.toggleArea(area({ name: "SA1 80101100101" })));
    expect(result.current.basket.areas).toEqual([]);
  });

  // The same numeric code exists at more than one ASGS level, so the toggle keys on level + code.
  it("keeps areas that share a code across levels", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.toggleArea(area({ level: "sa1", code: ACT.sa1 }));
      result.current.toggleArea(area({ level: "mb", code: ACT.sa1 }));
    });
    expect(result.current.basket.areas.map((a) => a.level)).toEqual(["sa1", "mb"]);
  });

  /**
   * Areas are added one row at a time from a viewport list, so a quick organiser fires several
   * toggles inside one React commit. Reading `basket` from the closure rather than the updater
   * would keep only the last of them – the classic "I ticked six, four went in" bug.
   */
  it("applies every toggle in a batch, not just the last", () => {
    const { result } = renderBasket();
    act(() =>
      ["80101100101", "80101100102", "80101100103"].forEach((code) => result.current.toggleArea(area({ code }))),
    );
    expect(result.current.basket.areas).toHaveLength(3);
  });

  it("blocks an area inside a basketed state and says which state", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() => result.current.toggleArea(area()));
    expect(result.current.basket.areas).toEqual([]);
    expect(result.current.hasArea("sa1", ACT.sa1)).toBe(false);
    expect(result.current.coveredBy({ kind: "area", level: "sa1", code: ACT.sa1 })).toBe(
      "Australian Capital Territory",
    );
  });

  // ASGS codes nest by prefix, so the SA4 banked from one panel has to be recognised by the SA1
  // row on another – the organiser is several screens away from where they added the coarse area.
  it("blocks a finer area inside a coarser basketed one, at every level gap", () => {
    const { result } = renderBasket();
    act(() => result.current.toggleArea(area({ level: "sa4", code: ACT.sa4, name: "Australian Capital Territory" })));
    act(() => {
      result.current.toggleArea(area({ level: "sa3", code: ACT.sa3 }));
      result.current.toggleArea(area({ level: "sa2", code: ACT.sa2 }));
      result.current.toggleArea(area({ level: "sa1", code: ACT.sa1 }));
    });
    expect(result.current.basket.areas.map((a) => a.code)).toEqual([ACT.sa4]);
    expect(result.current.coveredBy({ kind: "area", level: "sa1", code: ACT.sa1 })).toBe(
      "Australian Capital Territory",
    );
  });

  // The reverse order is the one that actually happens: pick a few SA1s, then decide to take the
  // whole SA3. Leaving the SA1s behind would list the same ground twice in "My turf".
  it("adding a coarser area drops the finer ones it now covers", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.toggleArea(area({ level: "sa1", code: ACT.sa1 }));
      result.current.toggleArea(area({ level: "sa2", code: ACT.sa2 }));
      result.current.toggleArea(area({ level: "sa1", code: NSW.sa1, name: "Braidwood" }));
    });
    act(() => result.current.toggleArea(area({ level: "sa3", code: ACT.sa3, name: "Canberra Inner North" })));
    expect(result.current.basket.areas.map((a) => a.code)).toEqual([NSW.sa1, ACT.sa3]);
  });

  // A code is only a container when it is a strict prefix. Two SA1s sharing nine digits are
  // neighbours, not parent and child, and dropping one for the other loses banked ground.
  it("treats an equal-length code as a sibling, not a container", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.toggleArea(area({ code: "80101100101" }));
      result.current.toggleArea(area({ code: "80101100102" }));
    });
    expect(result.current.basket.areas).toHaveLength(2);
  });
});

describe("removeArea and hasArea", () => {
  it("removes by level + code and leaves a same-code area at another level", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.toggleArea(area({ level: "sa1", code: ACT.sa1 }));
      result.current.toggleArea(area({ level: "mb", code: ACT.sa1 }));
    });
    act(() => result.current.removeArea("sa1", ACT.sa1));
    expect(result.current.basket.areas.map((a) => a.level)).toEqual(["mb"]);
    expect(result.current.hasArea("sa1", ACT.sa1)).toBe(false);
    expect(result.current.hasArea("mb", ACT.sa1)).toBe(true);
  });
});

describe("setPolygons", () => {
  // The draw tool owns its whole layer, so the basket takes a replacement set rather than
  // appending – appending would re-add every shape each time the map re-published its state.
  it("replaces the drawn set outright", () => {
    const { result } = renderBasket();
    act(() => result.current.setPolygons([polygon, polygon]));
    expect(result.current.count).toBe(2);
    act(() => result.current.setPolygons([]));
    expect(result.current.basket.polygons).toEqual([]);
    expect(result.current.count).toBe(0);
  });
});

describe("addresses", () => {
  // Doors are added from a map pin the organiser can click twice without noticing.
  it("adds a door once and refuses the same G-NAF pid again", () => {
    const { result } = renderBasket();
    act(() => result.current.addAddress(door()));
    act(() => result.current.addAddress(door({ label: "1 Test Street, Braddon" })));
    expect(result.current.basket.addresses).toHaveLength(1);
    expect(result.current.hasAddress("GAACT714857062")).toBe(true);
  });

  it("blocks a door inside a basketed state and says which state", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() => result.current.addAddress(door()));
    expect(result.current.basket.addresses).toEqual([]);
    expect(result.current.coveredBy({ kind: "address", stateDigit: ACT.digit })).toBe("Australian Capital Territory");
  });

  // The Addresses panel derives the digit from the door's SA4, which is not always resolved. An
  // unknown state must not silently swallow the door – the organiser picked it deliberately.
  it("adds a door whose state is unknown", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    act(() => result.current.addAddress(door({ stateDigit: undefined })));
    expect(result.current.basket.addresses).toHaveLength(1);
  });

  it("removes a door by pid", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.addAddress(door());
      result.current.addAddress(door({ gnafPid: "GAACT2", stateDigit: undefined }));
    });
    act(() => result.current.removeAddress("GAACT714857062"));
    expect(result.current.basket.addresses.map((a) => a.gnafPid)).toEqual(["GAACT2"]);
    expect(result.current.hasAddress("GAACT714857062")).toBe(false);
  });
});

describe("coveredBy", () => {
  it("returns null when nothing in the basket contains the candidate", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    expect(result.current.coveredBy({ kind: "area", level: "sa1", code: NSW.sa1 })).toBeNull();
    expect(result.current.coveredBy({ kind: "address", stateDigit: NSW.digit })).toBeNull();
    expect(result.current.coveredBy({ kind: "division", type: "ced", code: "CED101", stateDigit: NSW.digit })).toBeNull();
  });

  // With no digit there is nothing to match on, and guessing would hide an addable part behind a
  // "already covered by …" note naming a state the organiser never chose.
  it("returns null for a candidate with no state digit", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    expect(result.current.coveredBy({ kind: "division", type: "lga", code: "LGA89399" })).toBeNull();
    expect(result.current.coveredBy({ kind: "address" })).toBeNull();
  });

  /**
   * A state's own code IS its digit, so the naive cover check matches it against itself. The
   * States panel calls `coveredBy` for every row it renders, and a self-match would tell the
   * organiser "Victoria is already covered by Victoria" on the row they are trying to remove.
   */
  it("never reports a state as covered by itself", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    expect(result.current.coveredBy({ kind: "division", type: "ste", code: ACT.digit })).toBeNull();
  });

  // The panels ask before every add, so the answer has to follow the basket rather than the state
  // it was memoised against – a stale "covered" note disables a row that is now addable.
  it("stops reporting cover once the covering part is removed", () => {
    const { result } = renderBasket();
    act(() => result.current.addDivision(stateAct));
    expect(result.current.coveredBy({ kind: "area", level: "sa1", code: ACT.sa1 })).not.toBeNull();
    act(() => result.current.removeDivision("ste", ACT.digit));
    expect(result.current.coveredBy({ kind: "area", level: "sa1", code: ACT.sa1 })).toBeNull();
  });
});

describe("clear", () => {
  // `clear()` runs the instant the cut succeeds, before the router push lands. Anything left
  // behind would be silently unioned into the NEXT turf the organiser cuts.
  it("empties every bucket", () => {
    const { result } = renderBasket();
    act(() => {
      result.current.addDivision(canberra);
      result.current.toggleArea(area());
      result.current.setPolygons([polygon]);
      result.current.addAddress(door({ stateDigit: undefined }));
    });
    act(() => result.current.clear());
    expect(result.current.basket).toEqual({ divisions: [], areas: [], polygons: [], addresses: [] });
    expect(result.current.count).toBe(0);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).divisions).toEqual([]);
  });

  // Clearing twice must not corrupt the shared empty basket for the next cut.
  it("leaves the basket usable afterwards", () => {
    const { result } = renderBasket();
    act(() => result.current.clear());
    act(() => result.current.addDivision(canberra));
    expect(result.current.basket.divisions).toEqual([canberra]);
  });
});

describe("the published value", () => {
  /**
   * The mutators are handed to panel rows as click handlers and sit in effect dep arrays. A fresh
   * identity on every basket change would re-register handlers for every row on every add, which
   * is exactly the churn the hoisted `(geo)` layout exists to avoid.
   */
  it("keeps the mutators stable across basket changes", () => {
    const { result } = renderBasket();
    const before = {
      addDivision: result.current.addDivision,
      toggleArea: result.current.toggleArea,
      setPolygons: result.current.setPolygons,
      addAddress: result.current.addAddress,
      clear: result.current.clear,
    };
    act(() => {
      result.current.addDivision(canberra);
      result.current.toggleArea(area());
      result.current.addAddress(door({ stateDigit: undefined }));
    });
    expect(result.current.addDivision).toBe(before.addDivision);
    expect(result.current.toggleArea).toBe(before.toggleArea);
    expect(result.current.setPolygons).toBe(before.setPolygons);
    expect(result.current.addAddress).toBe(before.addAddress);
    expect(result.current.clear).toBe(before.clear);
  });
});

describe("one basket across the explorers", () => {
  function DivisionsPanel() {
    const { addDivision } = useTurfBasket();
    return <button onClick={() => addDivision(canberra)}>add seat</button>;
  }
  function TurfPanel() {
    const { count, basket } = useTurfBasket();
    return <span data-testid="parts">{`${count}:${basket.divisions.map((d) => d.name).join(",")}`}</span>;
  }

  // The reason the provider sits in the `(geo)` layout rather than in a page: the panel that adds
  // a part and the panel that lists it are siblings, and the explorer underneath is swapped on
  // every kind switch. Two copies of the state would mean parts added on Divisions never reach
  // the "My turf" card the organiser cuts from.
  it("shares one store between the panel that adds and the panel that cuts", () => {
    render(
      <TurfBasketProvider>
        <DivisionsPanel />
        <TurfPanel />
      </TurfBasketProvider>,
    );
    expect(screen.getByTestId("parts")).toHaveTextContent("0:");
    act(() => screen.getByText("add seat").click());
    expect(screen.getByTestId("parts")).toHaveTextContent("1:Canberra");
  });
});

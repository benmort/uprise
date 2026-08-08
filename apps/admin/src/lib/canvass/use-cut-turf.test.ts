import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTurfUniverse } from "@/lib/api";
import { invalidateApi } from "@/lib/use-api";
import type { TurfUniverse } from "@/lib/api/geo";
import { routerMock } from "@/test/setup";
import { useCutTurf } from "./use-cut-turf";

/**
 * The one cut-turf flow behind every geo panel (states, divisions, areas, addresses).
 * It owns three things a panel can't see for itself: whether the chosen universe gets
 * materialised into cold doors, whether the panel navigates away, and the boolean the
 * areas panel uses to decide if it may throw the organiser's map selection away.
 */

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@/lib/api", () => ({ loadTurfUniverse: vi.fn() }));
vi.mock("@/lib/use-api", () => ({ invalidateApi: vi.fn() }));

const loadUniverse = vi.mocked(loadTurfUniverse);
const invalidate = vi.mocked(invalidateApi);

type CreateResult = { ok: true; data: { id: string } } | { ok: false; error: string };

const creates = (id = "turf-1") => vi.fn(async (): Promise<CreateResult> => ({ ok: true, data: { id } }));
const refuses = (error: string) => vi.fn(async (): Promise<CreateResult> => ({ ok: false, error }));

/** The most recent toast payload – the description is the assertion that matters. */
const lastToast = () => showToast.mock.calls.at(-1)?.[0] as
  | { tone: string; title: string; description?: string }
  | undefined;

/** Drive the hook to completion the way a click handler does, and hand back its verdict. */
async function cut(
  result: { current: ReturnType<typeof useCutTurf> },
  opts: Parameters<ReturnType<typeof useCutTurf>["cutTurf"]>[0],
) {
  let outcome: boolean | undefined;
  await act(async () => {
    outcome = await result.current.cutTurf(opts);
  });
  return outcome;
}

beforeEach(() => {
  loadUniverse.mockResolvedValue({ ok: true, data: { materialised: 0, total: 0 } });
});

describe("useCutTurf – when the create fails", () => {
  /**
   * The areas panel clears the drawn polygons and the whole area selection only when
   * cutTurf resolves true. Reporting success on a failed create would wipe a selection
   * the organiser had just spent minutes drawing, with nothing saved on the server.
   */
  it("resolves false, so the caller keeps the selection it was about to clear", async () => {
    const { result } = renderHook(() => useCutTurf("hybrid"));
    expect(await cut(result, { id: "r1", name: "Wills", create: refuses("Boundary not found") })).toBe(false);
  });

  it("surfaces the API's reason and does nothing else", async () => {
    const { result } = renderHook(() => useCutTurf("hybrid"));
    await cut(result, { id: "r1", name: "Wills", create: refuses("Boundary not found") });

    expect(showToast).toHaveBeenCalledWith({
      tone: "error",
      title: "Couldn't cut turf",
      description: "Boundary not found",
    });
    // No turf exists, so there is nothing to materialise doors into and nothing to
    // navigate to – a push here would strand the organiser on /canvass wondering.
    expect(loadUniverse).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  // The row stays clickable: a failure the organiser can't retry without a reload is a dead end.
  it("releases the busy row", async () => {
    const { result } = renderHook(() => useCutTurf("hybrid"));
    await cut(result, { id: "r1", name: "Wills", create: refuses("nope") });
    expect(result.current.busy).toBe("");
  });
});

describe("useCutTurf – busy", () => {
  /**
   * `busy` is compared against a row identifier (`busy === d.code`) to disable that one
   * button and spin it. It has to hold the in-flight row for the whole round trip – a
   * boolean-ish or prematurely cleared value would either freeze the entire list or let
   * an impatient organiser cut the same boundary twice.
   */
  it("holds the in-flight row's id until the flow finishes", async () => {
    let release!: (res: CreateResult) => void;
    const create = vi.fn(() => new Promise<CreateResult>((resolve) => (release = resolve)));

    const { result } = renderHook(() => useCutTurf("existing"));
    let done!: Promise<boolean>;
    act(() => {
      done = result.current.cutTurf({ id: "ced-101", name: "Wills", create });
    });

    await waitFor(() => expect(result.current.busy).toBe("ced-101"));

    await act(async () => {
      release({ ok: true, data: { id: "turf-1" } });
      await done;
    });
    expect(result.current.busy).toBe("");
  });
});

describe("useCutTurf – the cold-door universe", () => {
  /**
   * "Existing contacts only" is an explicit opt-out. Calling load-universe anyway would
   * manufacture cold-door contacts inside the boundary that the organiser never asked
   * for, and those rows are real records – they'd have to be cleaned up by hand.
   */
  it("never materialises doors for the existing-only universe", async () => {
    const { result } = renderHook(() => useCutTurf("existing"));
    await cut(result, { id: "r1", name: "Wills", create: creates("turf-9") });
    expect(loadUniverse).not.toHaveBeenCalled();
  });

  // The id has to be the freshly created turf's, not the row code the panel keyed busy on.
  it("materialises into the new turf for none/hybrid", async () => {
    const { result } = renderHook(() => useCutTurf("hybrid"));
    await cut(result, { id: "ced-101", name: "Wills", create: creates("turf-99") });
    expect(loadUniverse).toHaveBeenCalledWith("turf-99", "hybrid");

    loadUniverse.mockClear();
    const none = renderHook(() => useCutTurf("none"));
    await cut(none.result, { id: "ced-101", name: "Wills", create: creates("turf-100") });
    expect(loadUniverse).toHaveBeenCalledWith("turf-100", "none");
  });

  /**
   * The panels change universe from a picker without remounting the hook. A callback
   * memoised on a stale universe would keep skipping the load after the organiser
   * switched off "existing only" – they'd get an empty turf and no explanation.
   */
  it("follows a universe change on the same mount", async () => {
    const { result, rerender } = renderHook(({ u }: { u: TurfUniverse }) => useCutTurf(u), {
      initialProps: { u: "existing" as TurfUniverse },
    });
    await cut(result, { id: "r1", name: "Wills", create: creates("turf-1") });
    expect(loadUniverse).not.toHaveBeenCalled();

    rerender({ u: "hybrid" });
    await cut(result, { id: "r1", name: "Wills", create: creates("turf-2") });
    expect(loadUniverse).toHaveBeenCalledWith("turf-2", "hybrid");
  });
});

describe("useCutTurf – the success toast", () => {
  it("names the boundary the turf was cut from", async () => {
    const { result } = renderHook(() => useCutTurf("existing"));
    await cut(result, { id: "r1", name: "Wills", create: creates() });
    expect(lastToast()).toMatchObject({ tone: "success", title: "Turf cut from Wills" });
  });

  it("reports how many cold doors landed", async () => {
    loadUniverse.mockResolvedValue({ ok: true, data: { materialised: 7, total: 7 } });
    const { result } = renderHook(() => useCutTurf("hybrid"));
    await cut(result, { id: "r1", name: "Wills", create: creates() });
    expect(lastToast()?.description).toBe("7 cold doors loaded.");
  });

  // Boundary-wide cuts run to five figures; an ungrouped "18492" is unreadable at a glance.
  it("groups large counts", async () => {
    loadUniverse.mockResolvedValue({ ok: true, data: { materialised: 18492, total: 18492 } });
    const { result } = renderHook(() => useCutTurf("hybrid"));
    await cut(result, { id: "r1", name: "Wills", create: creates() });
    // Locale-agnostic: whatever separator the runtime picks, the digits must not be bare.
    expect(lastToast()?.description).toMatch(/^18\D?492 cold doors loaded\.$/);
  });

  /**
   * An "existing contacts only" cut, or a boundary with no unmatched G-NAF addresses in it,
   * must not claim "0 cold doors loaded." – the absent description is what keeps the toast
   * honest about a turf built from contacts that already existed.
   */
  it("says nothing about cold doors when none were loaded", async () => {
    const existing = renderHook(() => useCutTurf("existing"));
    await cut(existing.result, { id: "r1", name: "Wills", create: creates() });
    expect(lastToast()?.description).toBeUndefined();

    const hybrid = renderHook(() => useCutTurf("hybrid"));
    await cut(hybrid.result, { id: "r1", name: "Wills", create: creates() });
    expect(lastToast()?.description).toBeUndefined();
  });
});

describe("useCutTurf – after a successful cut", () => {
  it("invalidates the canvass cache so the turf list picks the new row up", async () => {
    const { result } = renderHook(() => useCutTurf("existing"));
    await cut(result, { id: "r1", name: "Wills", create: creates() });
    expect(invalidate).toHaveBeenCalledWith("/canvass");
  });

  it("lands on /canvass by default", async () => {
    const { result } = renderHook(() => useCutTurf("existing"));
    expect(await cut(result, { id: "r1", name: "Wills", create: creates() })).toBe(true);
    expect(routerMock.push).toHaveBeenCalledWith("/canvass");
  });

  it("honours an explicit destination", async () => {
    const { result } = renderHook(() => useCutTurf("existing"));
    await cut(result, { id: "r1", name: "Wills", create: creates(), then: "/canvass/c1/turf" });
    expect(routerMock.push).toHaveBeenCalledWith("/canvass/c1/turf");
  });

  /**
   * `then: null` is how the areas panel says "stay on the map" – it cuts turf from a live
   * selection and expects to keep drawing. Treating null like the default would yank the
   * organiser off the map they are mid-way through working.
   */
  it("stays put when then is null", async () => {
    const { result } = renderHook(() => useCutTurf("existing"));
    expect(await cut(result, { id: "r1", name: "Wills", create: creates(), then: null })).toBe(true);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  /**
   * The cold-door load is best-effort: the turf itself already exists on the server, so a
   * failed materialisation must not be reported as a failed cut – the caller would clear a
   * selection whose turf is real, and the organiser would cut it a second time.
   * (That the toast gives no hint the doors are missing is flagged separately, not pinned here.)
   */
  it("still counts as a successful cut when the door load fails", async () => {
    loadUniverse.mockResolvedValue({ ok: false, error: "G-NAF not loaded" });
    const { result } = renderHook(() => useCutTurf("hybrid"));
    expect(await cut(result, { id: "r1", name: "Wills", create: creates() })).toBe(true);
    expect(routerMock.push).toHaveBeenCalledWith("/canvass");
    expect(result.current.busy).toBe("");
  });
});

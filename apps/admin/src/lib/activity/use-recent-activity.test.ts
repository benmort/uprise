import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The feed behind the topbar notifications bell — mounted in the `(main)` shell on every
 * organiser page, so it fetches four endpoints on a 10s loop for the whole session. What
 * matters to a caller is: the three sources land in one feed, one failing source does not
 * blank the bell, and the loop stops when the shell unmounts.
 */

vi.mock("@/lib/api", () => ({
  getRecentBlasts: vi.fn(),
  listConversations: vi.fn(),
}));
vi.mock("@/lib/api/campaigns", () => ({
  listCampaigns: vi.fn(),
  getCampaignLive: vi.fn(),
}));
// buildActivityItems is deliberately NOT mocked — the merge/sort/cap is the thing the bell
// renders, so the wiring is only meaningful end-to-end. These two stubs just keep its import
// graph light (a Next-coupled view module and the icon set), as recent-activity.test.tsx does.
vi.mock("@/components/channels/channel-campaigns-view", () => ({
  normaliseChannel: (v: unknown) => String(v ?? "SMS").toUpperCase(),
}));
vi.mock("lucide-react", () => ({
  Inbox: () => null,
  MapPin: () => null,
  SendHorizontal: () => null,
}));

import { getRecentBlasts, listConversations } from "@/lib/api";
import { getCampaignLive, listCampaigns, type CampaignSummary } from "@/lib/api/campaigns";
import { useRecentActivity } from "./use-recent-activity";

const blasts = vi.mocked(getRecentBlasts);
const convos = vi.mocked(listConversations);
const campaigns = vi.mocked(listCampaigns);
const live = vi.mocked(getCampaignLive);

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (error: string, status?: number) => ({ ok: false as const, error, status });

const aBlast = {
  id: "b1",
  title: "Rally reminder",
  status: "SENT",
  channel: "sms",
  sentAt: "2026-07-05T09:00:00Z",
};
const aConvo = {
  contactPhone: "+61400000000",
  contactName: "Ada",
  lastMessageAt: "2026-07-05T11:00:00Z",
};
const aKnock = { id: "k1", at: "2026-07-05T10:00:00Z", dispositionCode: "SUPPORT", volunteer: "Sam" };

const campaign = (id: string, status: CampaignSummary["status"]) =>
  ({ id, name: id, status }) as CampaignSummary;

const liveSnapshot = (knocks: Array<typeof aKnock>) => ({
  doorsToday: knocks.length,
  volunteers: [],
  recentKnocks: knocks,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  blasts.mockResolvedValue(ok([aBlast]));
  convos.mockResolvedValue(ok([aConvo]));
  campaigns.mockResolvedValue(ok([campaign("c-live", "ACTIVE")]));
  live.mockResolvedValue(ok(liveSnapshot([aKnock])));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRecentActivity", () => {
  it("starts loading, then merges blasts, replies and knocks newest-first", async () => {
    const { result } = renderHook(() => useRecentActivity());

    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(["convo-+61400000000", "knock-k1", "blast-b1"]);
    expect(result.current.error).toBeUndefined();
  });

  // The bell asks for 6; the dropdown has no paging, so anything past the cap is simply lost
  // and the trim has to keep the NEWEST rows, not the first ones the API happened to return.
  it("caps the feed at the caller's limit, keeping the newest", async () => {
    const { result } = renderHook(() => useRecentActivity(2));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(["convo-+61400000000", "knock-k1"]);
  });

  /**
   * A volunteer-scoped principal gets a 403 on the blasts endpoint while the inbox still
   * answers. Erroring the whole hook there would empty the bell for the sources that DID
   * load, so a single failed source degrades to "show the rest" rather than "show nothing".
   */
  it("keeps rendering the sources that worked when only one fails", async () => {
    blasts.mockResolvedValue(fail("Missing permission", 403));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(["convo-+61400000000", "knock-k1"]);
    expect(result.current.error).toBeUndefined();
  });

  // Same rule the other way round: the inbox endpoint is the flakier of the two, and losing it
  // must not take the sent-blast history down with it.
  it("keeps the blasts when the inbox is the source that fails", async () => {
    convos.mockResolvedValue(fail("inbox exploded"));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(["knock-k1", "blast-b1"]);
    expect(result.current.error).toBeUndefined();
  });

  it("reports an error only once both blasts and replies fail", async () => {
    blasts.mockResolvedValue(fail("blasts exploded"));
    convos.mockResolvedValue(fail("inbox exploded"));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.error).toBe("blasts exploded"));
    // Loading must drop even on the total failure, or the bell spins for the rest of the session.
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  /**
   * The campaign fetches are a secondary source, and they run AFTER the two that matter.
   * A canvassing-less tenant (or a 403 on /canvass/campaigns) must not cost the organiser
   * their blasts and replies.
   */
  it("still delivers blasts and replies when the campaign lookups fail", async () => {
    campaigns.mockResolvedValue(fail("no canvass access", 403));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(["convo-+61400000000", "blast-b1"]);
    expect(live).not.toHaveBeenCalled();
    expect(result.current.error).toBeUndefined();
  });

  it("survives a live snapshot that fails on its own", async () => {
    live.mockResolvedValue(fail("live unavailable"));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(["convo-+61400000000", "blast-b1"]);
  });

  it("asks for no live snapshot at all when the tenant has no campaigns", async () => {
    campaigns.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(live).not.toHaveBeenCalled();
    expect(result.current.items.map((i) => i.id)).toEqual(["convo-+61400000000", "blast-b1"]);
  });

  // Door knocks are "what is happening right now", so the live snapshot has to come from the
  // campaign that is running — not whichever archived campaign the list happens to start with.
  it("takes the live snapshot from the ACTIVE campaign, not the first listed", async () => {
    campaigns.mockResolvedValue(
      ok([campaign("c-archived", "ARCHIVED"), campaign("c-live", "ACTIVE"), campaign("c-draft", "DRAFT")]),
    );
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(live).toHaveBeenCalledWith("c-live");
  });

  // A tenant between campaigns still has knocks worth showing from the most recent one.
  it("falls back to the first campaign when none is ACTIVE", async () => {
    campaigns.mockResolvedValue(ok([campaign("c-draft", "DRAFT"), campaign("c-archived", "ARCHIVED")]));
    const { result } = renderHook(() => useRecentActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(live).toHaveBeenCalledWith("c-draft");
    expect(result.current.items.map((i) => i.id)).toContain("knock-k1");
  });

  /**
   * The bell lives in the shell, so an unmount is a sign-out or a hard navigation. Continuing
   * the chain then would fire /canvass requests for a session that is on its way out — and
   * would set state on a hook nobody is rendering.
   */
  it("abandons the rest of the chain when it unmounts mid-flight", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getRecentBlasts>>>();
    blasts.mockReturnValue(pending.promise);

    const { unmount } = renderHook(() => useRecentActivity());
    unmount();

    await act(async () => {
      pending.resolve(ok([aBlast]));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(campaigns).not.toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
  });
});

describe("useRecentActivity polling", () => {
  /**
   * The fetch chain is three awaits deep and every mocked response is a microtask, so one
   * real macrotask boundary drains it. `waitFor` cannot be used here — it drives itself with
   * the (now faked) timers.
   */
  const drain = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  // Without the poll the bell would only ever show what was true at page load, which for a
  // shell mounted once per session means a reply from an hour ago never appearing.
  it("refreshes on the 10s cadence so a new reply turns up without a reload", async () => {
    const { result } = renderHook(() => useRecentActivity());
    await drain();
    expect(result.current.items.map((i) => i.id)).not.toContain("convo-+61400000001");

    convos.mockResolvedValue(
      ok([aConvo, { contactPhone: "+61400000001", contactName: "Bo", lastMessageAt: "2026-07-05T12:00:00Z" }]),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.items[0].id).toBe("convo-+61400000001");
  });

  // A blip must not leave the bell permanently broken — the next tick has to clear the error.
  it("clears a previous error once the sources come back", async () => {
    blasts.mockResolvedValue(fail("blasts exploded"));
    convos.mockResolvedValue(fail("inbox exploded"));
    const { result } = renderHook(() => useRecentActivity());
    await drain();
    expect(result.current.error).toBe("blasts exploded");

    blasts.mockResolvedValue(ok([aBlast]));
    convos.mockResolvedValue(ok([aConvo]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.items.map((i) => i.id)).toContain("blast-b1");
  });

  /**
   * The leak that matters: an uncleared interval keeps four endpoints firing every 10s for
   * every shell that was ever mounted, forever — including after sign-out.
   */
  it("stops polling once unmounted", async () => {
    const { unmount } = renderHook(() => useRecentActivity());
    await drain();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(blasts).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(blasts).toHaveBeenCalledTimes(2);
  });
});

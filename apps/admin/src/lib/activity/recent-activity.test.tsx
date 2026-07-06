import { describe, expect, it, vi } from "vitest";

// Keep the import graph light: the module only needs normaliseChannel from the
// (heavy, Next-coupled) channels view, and icon components from lucide-react.
vi.mock("@/components/channels/channel-campaigns-view", () => ({
  normaliseChannel: (v: unknown) => String(v ?? "SMS").toUpperCase(),
}));
vi.mock("lucide-react", () => ({
  Inbox: () => null,
  MapPin: () => null,
  SendHorizontal: () => null,
}));

import { buildActivityItems, relativeTime } from "./recent-activity";

describe("buildActivityItems", () => {
  it("links an inbound-reply convo to /inbox (not the legacy sms-inbox route)", () => {
    const items = buildActivityItems(
      undefined,
      [{ contactPhone: "+61400000000", contactName: "Ada", lastMessageAt: "2026-07-05T10:00:00Z" }],
      null,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "convo-+61400000000",
      label: "Ada",
      sublabel: "New reply in inbox",
      href: "/inbox",
    });
  });

  it("skips convos with no lastMessageAt", () => {
    const items = buildActivityItems(undefined, [{ contactPhone: "+61400000000" }], null);
    expect(items).toHaveLength(0);
  });

  it("builds blast + knock items and sorts newest-first, capped at limit", () => {
    const items = buildActivityItems(
      [{ id: "b1", title: "Hello", status: "SENT", channel: "sms", sentAt: "2026-07-05T09:00:00Z" }],
      [{ contactPhone: "+61400000001", lastMessageAt: "2026-07-05T11:00:00Z" }],
      { live: { recentKnocks: [{ id: "k1", dispositionCode: "SUPPORT", volunteer: "Sam", at: "2026-07-05T10:00:00Z" }] } } as any,
      2,
    );
    expect(items.map((i) => i.id)).toEqual(["convo-+61400000001", "knock-k1"]);
    expect(items[0].href).toBe("/inbox");
    expect(items.find((i) => i.id === "b1")).toBeUndefined(); // trimmed by limit=2
  });
});

describe("relativeTime", () => {
  it("returns empty for unparseable input", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });

  it("formats a recent timestamp as 'just now'", () => {
    expect(relativeTime(new Date().toISOString())).toBe("just now");
  });
});

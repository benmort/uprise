import {
  DEMO_AUDIENCES,
  DEMO_BLASTS,
  DEMO_CONTACT_COUNT,
  DEMO_EVENTS,
  DEMO_KNOCKS,
  DEMO_LOGINS,
  DEMO_PHONE_CAPACITY,
  DEMO_PHONE_CONTACT_COUNT,
  DEMO_SEARCHES,
  DEMO_SENDER_PHONE,
  DEMO_SHIFTS,
  DEMO_SUPPRESSIONS,
  DEMO_THREADS,
  DEMO_TURF,
  DEMO_WALK_LIST_SIZE,
  buildDemoContacts,
  demoPhone,
} from "./seed-data";

/** Point-in-polygon over DEMO_TURF's single ring ([lng, lat] order, per GeoJSON). */
function insideTurf(lat: number, lng: number): boolean {
  const ring = DEMO_TURF.geometry.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

describe("demo seed fixtures", () => {
  const contacts = buildDemoContacts();

  it("is deterministic — same order and phones on every call", () => {
    expect(buildDemoContacts()).toEqual(contacts);
  });

  it("keeps the original eight households first, so contactIndex references still resolve", () => {
    expect(contacts.slice(0, 8).map((c) => `${c.firstName} ${c.lastName}`)).toEqual([
      "Ada Nguyen",
      "Bao Tran",
      "Cleo Marsh",
      "Dev Patel",
      "Esra Yilmaz",
      "Finn O'Brien",
      "Grace Okafor",
      "Hugo Bianchi",
    ]);
  });

  it("is screenshot-grade volume — enough to paginate a list", () => {
    // The inbox/contacts lists page at 8-10 rows; a fixture below ~40 renders as a stub.
    expect(contacts.length).toBeGreaterThanOrEqual(40);
    expect(contacts.length).toBe(DEMO_CONTACT_COUNT);
  });

  it("never overflows the ACMA drama-reserved number range", () => {
    // Blowing past it would hand out numbers that could reach a real person. Only the
    // phone-bearing tier consumes the range — the email-only contacts are unbounded.
    expect(DEMO_PHONE_CONTACT_COUNT).toBeLessThanOrEqual(DEMO_PHONE_CAPACITY);
  });

  it("issues every phone inside the drama range, uniquely", () => {
    const phones = contacts.map((c) => c.phoneE164).filter((p): p is string => Boolean(p));
    expect(phones.length).toBe(DEMO_PHONE_CONTACT_COUNT);
    expect(new Set(phones).size).toBe(phones.length);
    for (const p of phones) {
      expect(p).toMatch(/^\+614915700(0[6-9]|[1-9]\d)$|^\+614915701([0-4]\d|5[0-6])$/);
    }
    expect(DEMO_SENDER_PHONE).toMatch(/^\+61491570005$/);
    expect(phones).not.toContain(DEMO_SENDER_PHONE);
  });

  it("puts every canvassable household inside DEMO_TURF so the turf map shows a real cluster", () => {
    for (const c of contacts.filter((x) => x.canvassable)) {
      expect(insideTurf(c.lat, c.lng)).toBe(true);
    }
  });

  it("keeps the email-only tier outside the turf — they are list contacts, not doors", () => {
    const emailOnly = contacts.filter((c) => !c.canvassable);
    expect(emailOnly.length).toBeGreaterThan(0);
    for (const c of emailOnly) {
      expect(c.phoneE164).toBeUndefined();
      expect(c.email).toMatch(/@example\.org$/); // RFC 2606 reserved — can never route anywhere
      expect(insideTurf(c.lat, c.lng)).toBe(false);
    }
  });

  it("gives every canvassable household a phone, since the walk list and threads need one", () => {
    for (const c of contacts.filter((x) => x.canvassable)) {
      expect(c.phoneE164).toBeDefined();
    }
  });

  it("seeds an OWNER login, without which the dashboard analytics card cannot be captured", () => {
    // `read analytics.all` is owner/admin-only, so an organiser sees a permission error there.
    expect(DEMO_LOGINS.owner.email).toMatch(/@uprise\.test$/);
    const emails = Object.values(DEMO_LOGINS).map((l) => l.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("has unique addresses — the seeder finds contacts by address, so duplicates would collide", () => {
    const addresses = contacts.map((c) => c.address);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  describe("knocks", () => {
    it("only references households that exist", () => {
      for (const k of DEMO_KNOCKS) {
        expect(contacts[k.contactIndex]).toBeDefined();
      }
    });

    it("knocks at most once per household (localId is keyed on contactIndex)", () => {
      const indices = DEMO_KNOCKS.map((k) => k.contactIndex);
      expect(new Set(indices).size).toBe(indices.length);
    });

    it("is campaign-shaped, not uniform — not-home leads and no disposition dominates", () => {
      const counts = new Map<string, number>();
      for (const k of DEMO_KNOCKS) counts.set(k.dispositionCode, (counts.get(k.dispositionCode) ?? 0) + 1);
      expect(DEMO_KNOCKS.length).toBeGreaterThanOrEqual(25);
      expect(counts.get("not_home")).toBeGreaterThan(counts.get("spoke_to_target") ?? 0);
      // A single disposition swallowing the set makes the contact-rate tiles read as fake.
      for (const n of counts.values()) expect(n / DEMO_KNOCKS.length).toBeLessThan(0.6);
    });

    it("always leaves doors knocked TODAY, so the dashboard tile is never zero", () => {
      // The tile counts DoorKnock.createdAt >= startOfToday(). Knocks used to land at seed time,
      // so it read 0 from the day after seeding onwards — this is the regression that guards it.
      expect(DEMO_KNOCKS.filter((k) => k.hoursAgo < 12).length).toBeGreaterThanOrEqual(8);
    });

    it("spreads the rest back over days, so results and QA have history", () => {
      const hours = DEMO_KNOCKS.map((k) => k.hoursAgo);
      expect(Math.min(...hours)).toBeGreaterThan(0);
      expect(Math.max(...hours)).toBeGreaterThan(120); // more than five days of history
    });

    it("leaves part of the walk list unknocked so the field capture shows a walk in progress", () => {
      // A fully-knocked list renders "All stops done" with every stop greyed out — the opposite
      // of what the canvasser hero is meant to show.
      const onList = DEMO_KNOCKS.filter((k) => k.contactIndex < DEMO_WALK_LIST_SIZE).length;
      expect(onList).toBeGreaterThan(0);
      expect(onList).toBeLessThan(DEMO_WALK_LIST_SIZE);
    });

    it("only knocks households that carry a phone", () => {
      for (const k of DEMO_KNOCKS) expect(contacts[k.contactIndex].phoneE164).toBeDefined();
    });
  });

  describe("dashboard surfaces", () => {
    it("defines saved searches as valid v2 segment envelopes", () => {
      expect(DEMO_SEARCHES.length).toBeGreaterThanOrEqual(2);
      for (const s of DEMO_SEARCHES) {
        expect(s.name.trim()).not.toBe("");
        expect(s.conditions.length).toBeGreaterThan(0);
        // Every leaf must carry a namespaced `type` from the closed Condition union.
        for (const c of s.conditions) expect(String(c.type)).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
      }
      expect(new Set(DEMO_SEARCHES.map((s) => s.name)).size).toBe(DEMO_SEARCHES.length);
    });

    it("opts out real seeded households, each exactly once", () => {
      expect(DEMO_SUPPRESSIONS.length).toBeGreaterThan(0);
      const indices = DEMO_SUPPRESSIONS.map((s) => s.contactIndex);
      expect(new Set(indices).size).toBe(indices.length);
      for (const s of DEMO_SUPPRESSIONS) {
        // A suppression keys on a phone number, so the household must have one.
        expect(contacts[s.contactIndex]?.phoneE164).toBeDefined();
        expect(s.reason.trim()).not.toBe("");
      }
    });

    it("fills the calendar both sides of today", () => {
      expect(DEMO_EVENTS.some((e) => e.daysFromNow > 0)).toBe(true);
      expect(DEMO_EVENTS.some((e) => e.daysFromNow < 0)).toBe(true);
      expect(DEMO_SHIFTS.some((s) => s.daysFromNow > 0)).toBe(true);
      // Unique names — the seeder finds both by name, so duplicates would collide.
      expect(new Set(DEMO_EVENTS.map((e) => e.title)).size).toBe(DEMO_EVENTS.length);
      expect(new Set(DEMO_SHIFTS.map((s) => s.name)).size).toBe(DEMO_SHIFTS.length);
    });

    it("points every blast at an audience that is actually seeded", () => {
      const names = new Set(DEMO_AUDIENCES.map((a) => a.name));
      for (const b of DEMO_BLASTS) {
        expect(names.has(b.audienceName)).toBe(true);
        expect(b.recipientStride).toBeGreaterThan(0);
      }
    });
  });

  describe("inbox threads", () => {
    it("only references households that exist, at most one thread each", () => {
      const indices = DEMO_THREADS.map((t) => t.contactIndex);
      expect(new Set(indices).size).toBe(indices.length);
      for (const t of DEMO_THREADS) expect(contacts[t.contactIndex]).toBeDefined();
    });

    it("fills the inbox past its page size", () => {
      expect(DEMO_THREADS.length).toBeGreaterThanOrEqual(8);
    });

    it("every thread is a real two-way exchange", () => {
      for (const t of DEMO_THREADS) {
        expect(t.messages.length).toBeGreaterThanOrEqual(2);
        expect(t.messages.some((m) => m.direction === "in")).toBe(true);
        expect(t.messages.some((m) => m.direction === "out")).toBe(true);
      }
    });

    it("orders messages oldest-first so the detail pane reads as a conversation", () => {
      for (const t of DEMO_THREADS) {
        const ages = t.messages.map((m) => m.minutesAgo);
        expect(ages).toEqual([...ages].sort((a, b) => b - a));
      }
    });

    it("covers the folder/filter states the inbox renders", () => {
      expect(DEMO_THREADS.some((t) => t.unread > 0)).toBe(true);
      expect(DEMO_THREADS.some((t) => t.unread === 0)).toBe(true);
      expect(DEMO_THREADS.some((t) => t.resolved)).toBe(true);
      expect(DEMO_THREADS.some((t) => t.claimed)).toBe(true);
      expect(DEMO_THREADS.some((t) => !t.claimed)).toBe(true);
    });
  });

  describe("demoPhone", () => {
    it("starts at the range floor and pads to a full E.164 mobile", () => {
      expect(demoPhone(0)).toBe("+61491570006");
      expect(demoPhone(1)).toBe("+61491570007");
      expect(demoPhone(94)).toBe("+61491570100");
    });
  });
});

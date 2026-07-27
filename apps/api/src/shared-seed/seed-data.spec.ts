import {
  DEMO_CONTACT_COUNT,
  DEMO_KNOCKS,
  DEMO_PHONE_CAPACITY,
  DEMO_SENDER_PHONE,
  DEMO_THREADS,
  DEMO_TURF,
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
    // Blowing past it would hand out numbers that could reach a real person.
    expect(DEMO_CONTACT_COUNT).toBeLessThanOrEqual(DEMO_PHONE_CAPACITY);
  });

  it("issues every phone inside the drama range, uniquely", () => {
    const phones = contacts.map((c) => c.phoneE164);
    expect(new Set(phones).size).toBe(phones.length);
    for (const p of phones) {
      expect(p).toMatch(/^\+614915700(0[6-9]|[1-9]\d)$|^\+614915701([0-4]\d|5[0-6])$/);
    }
    expect(DEMO_SENDER_PHONE).toMatch(/^\+61491570005$/);
    expect(phones).not.toContain(DEMO_SENDER_PHONE);
  });

  it("puts every household inside DEMO_TURF so the turf map shows a real cluster", () => {
    for (const c of contacts) {
      expect(insideTurf(c.lat, c.lng)).toBe(true);
    }
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

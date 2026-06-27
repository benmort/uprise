import type { INestApplication } from "@nestjs/common";
import { bootE2EApp, client, data } from "./utils/e2e-app";

/**
 * Full-surface API e2e: boots the real app once, seeds demo data, then drives every
 * controller over HTTP. Reads are asserted broadly; the form-backed entities
 * (campaigns, turfs, walk lists, shifts, canvassers, dispositions, canned responses,
 * surveys, scripts) are exercised create→read→update→(delete) to mirror the UI.
 */
function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    for (const k of ["items", "audiences", "blasts", "data", "results", "rows"]) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
}

describe("API e2e — full surface", () => {
  let app: INestApplication;
  let api: ReturnType<typeof client>;
  const ids: Record<string, string | undefined> = {};

  beforeAll(async () => {
    app = await bootE2EApp();
    api = client(app);

    const campaigns = asArray(data((await api.get("/api/v1/canvass/campaigns")).body));
    ids.campaignId = (campaigns.find((c) => c.name?.startsWith("Demo")) || campaigns[0])?.id;

    const turfs = asArray(data((await api.get(`/api/v1/canvass/turfs?campaignId=${ids.campaignId ?? ""}`)).body));
    ids.turfId = turfs[0]?.id;

    const canvassers = asArray(data((await api.get("/api/v1/canvass/canvassers")).body));
    ids.canvasserId = (canvassers.find((u) => u.email === "demo.canvasser@yarns.test") || canvassers[0])?.id;

    const contacts = asArray(data((await api.get("/api/v1/contacts?query=Ada")).body));
    ids.contactId = contacts[0]?.id;

    const audiences = asArray(data((await api.get("/api/v1/audiences")).body));
    ids.audienceId = audiences[0]?.id;

    const blasts = asArray(data((await api.get("/api/v1/blasts")).body));
    ids.blastId = blasts[0]?.id;

    const ceds = asArray(data((await api.get("/api/v1/geo/divisions?type=ced")).body));
    ids.cedCode = ceds[0]?.code;
  });

  afterAll(async () => {
    await app?.close();
  });

  const okStatus = (s: number) => expect([200, 201]).toContain(s);

  // ── Platform ──────────────────────────────────────────────────
  describe("platform", () => {
    it("health", async () => {
      const res = await api.get("/api/v1/health");
      expect(res.status).toBe(200);
      expect(data(res.body).checks.db).toBe(true);
    });
    it("auth/check", async () => {
      const res = await api.get("/api/v1/auth/check");
      expect(res.status).toBe(200);
      expect(data(res.body).user).toBeTruthy();
    });
    it("feature flags", async () => {
      const res = await api.get("/api/v1/system/feature-flags");
      okStatus(res.status);
    });
    it("enforces auth on a guarded route", async () => {
      const res = await api.raw.get("/api/v1/canvass/campaigns");
      expect(res.status).toBe(401);
    });
  });

  // ── Geo / divisions ───────────────────────────────────────────
  describe("geo", () => {
    it("status", async () => okStatus((await api.get("/api/v1/geo/status")).status));
    it("divisions list", async () => {
      const res = await api.get("/api/v1/geo/divisions?type=ced");
      okStatus(res.status);
      expect(Array.isArray(data(res.body))).toBe(true);
    });
    it("division detail", async () => {
      if (!ids.cedCode) return;
      const res = await api.get(`/api/v1/geo/divisions/ced/${encodeURIComponent(ids.cedCode)}`);
      okStatus(res.status);
      expect(data(res.body)).toHaveProperty("addressCount");
    });
    it("addresses without contacts", async () => {
      if (!ids.cedCode) return;
      const res = await api.get(`/api/v1/geo/addresses?divisionType=ced&divisionCode=${encodeURIComponent(ids.cedCode)}&withoutContacts=true`);
      okStatus(res.status);
    });
    it("statistical areas in viewport", async () => {
      const res = await api.get("/api/v1/geo/areas?layer=sa2&bbox=151.1,-33.95,151.3,-33.8");
      okStatus(res.status);
      expect(data(res.body)).toHaveProperty("features");
    });
    it("area search", async () => {
      const res = await api.get("/api/v1/geo/areas/search?layer=sa2&q=a");
      okStatus(res.status);
      expect(Array.isArray(data(res.body))).toBe(true);
    });
  });

  // ── Canvass: campaigns ────────────────────────────────────────
  describe("canvass campaigns", () => {
    let createdId: string;
    it("create → read → update", async () => {
      const create = await api.post("/api/v1/canvass/campaigns").send({ name: "E2E Campaign", status: "ACTIVE", goals: { doors: 100 } });
      okStatus(create.status);
      createdId = data(create.body).id;
      expect(createdId).toBeTruthy();

      const get = await api.get(`/api/v1/canvass/campaigns/${createdId}`);
      okStatus(get.status);

      const patch = await api.patch(`/api/v1/canvass/campaigns/${createdId}`).send({ name: "E2E Campaign (edited)", status: "DRAFT" });
      okStatus(patch.status);
      expect(data(patch.body).name).toBe("E2E Campaign (edited)");
    });
    it("summary / results / live", async () => {
      if (!ids.campaignId) return;
      okStatus((await api.get(`/api/v1/canvass/campaigns/${ids.campaignId}/summary`)).status);
      okStatus((await api.get(`/api/v1/canvass/campaigns/${ids.campaignId}/results`)).status);
      okStatus((await api.get(`/api/v1/canvass/campaigns/${ids.campaignId}/live`)).status);
    });
  });

  // ── Canvass: turfs + walk lists + universe ────────────────────
  describe("canvass turfs", () => {
    const square = { type: "Polygon", coordinates: [[[151.18, -33.88], [151.2, -33.88], [151.2, -33.86], [151.18, -33.86], [151.18, -33.88]]] };
    let turfId: string;
    it("create → rename → rebucket → load-universe", async () => {
      const create = await api.post("/api/v1/canvass/turfs").send({ name: "E2E Turf", geometry: square, campaignId: ids.campaignId });
      okStatus(create.status);
      turfId = data(create.body).id;
      okStatus((await api.patch(`/api/v1/canvass/turfs/${turfId}`).send({ name: "E2E Turf (edited)" })).status);
      okStatus((await api.post(`/api/v1/canvass/turfs/${turfId}/rebucket`)).status);
      const uni = await api.post(`/api/v1/canvass/turfs/${turfId}/load-universe`).send({ universe: "hybrid" });
      okStatus(uni.status);
      expect(data(uni.body)).toHaveProperty("materialised");
    });
    it("cut turf from division", async () => {
      if (!ids.cedCode) return;
      const res = await api.post("/api/v1/canvass/turfs/from-division").send({ type: "ced", code: ids.cedCode, universe: "existing" });
      okStatus(res.status);
    });
    it("cut turf from areas (polygon union)", async () => {
      // Polygon-only selection exercises the PostGIS union path without needing
      // ASGS data loaded; a turf comes back with a unioned geometry.
      const res = await api.post("/api/v1/canvass/turfs/from-areas").send({
        name: "E2E Areas Turf",
        areas: [],
        polygons: [square],
        campaignId: ids.campaignId,
      });
      okStatus(res.status);
      expect(data(res.body)).toHaveProperty("id");
    });
    it("walk list create → update", async () => {
      const contacts = asArray(data((await api.get(`/api/v1/canvass/turfs/${turfId}/contacts`)).body));
      const wl = await api.post("/api/v1/canvass/walk-lists").send({
        name: "E2E Walk list",
        contactIds: contacts.slice(0, 3).map((c) => c.id),
        turfId,
        campaignId: ids.campaignId,
        listType: "STATIC",
      });
      okStatus(wl.status);
      okStatus((await api.patch(`/api/v1/canvass/walk-lists/${data(wl.body).id}`).send({ name: "E2E Walk list (edited)", listType: "DYNAMIC" })).status);
    });
  });

  // ── Canvass: canvassers + shifts ──────────────────────────────
  describe("canvass people + shifts", () => {
    it("canvasser create → update", async () => {
      const email = `e2e+${Date.now()}@yarns.test`;
      const create = await api.post("/api/v1/canvass/canvassers").send({ displayName: "E2E Canvasser", email, password: "supersecret", role: "VOLUNTEER" });
      okStatus(create.status);
      const id = data(create.body).id;
      okStatus((await api.patch(`/api/v1/canvass/canvassers/${id}`).send({ displayName: "E2E Canvasser (edited)", role: "ORGANISER" })).status);
    });
    it("shift create → update → delete", async () => {
      if (!ids.campaignId) return;
      const create = await api.post("/api/v1/canvass/shifts").send({
        campaignId: ids.campaignId,
        name: "E2E Shift",
        startsAt: "2026-08-01T09:00:00.000Z",
        endsAt: "2026-08-01T12:00:00.000Z",
        location: "HQ",
      });
      okStatus(create.status);
      const id = data(create.body).id;
      okStatus((await api.patch(`/api/v1/canvass/shifts/${id}`).send({ name: "E2E Shift (edited)" })).status);
      okStatus((await api.del(`/api/v1/canvass/shifts/${id}`)).status);
    });
    it("qa review", async () => {
      if (!ids.campaignId) return;
      okStatus((await api.get(`/api/v1/canvass/campaigns/${ids.campaignId}/qa`)).status);
    });
  });

  // ── Engagement authoring ──────────────────────────────────────
  describe("engagement dispositions", () => {
    it("create → update → delete", async () => {
      const code = `e2e_disp_${Date.now()}`;
      const create = await api.post("/api/v1/engagement/disposition-defs").send({ code, label: "E2E Disposition", channel: "BOTH" });
      okStatus(create.status);
      const id = data(create.body).id;
      okStatus((await api.patch(`/api/v1/engagement/disposition-defs/${id}`).send({ label: "E2E Disposition (edited)" })).status);
      okStatus((await api.del(`/api/v1/engagement/disposition-defs/${id}`)).status);
    });
    it("list", async () => {
      const res = await api.get("/api/v1/engagement/dispositions");
      okStatus(res.status);
      expect(Array.isArray(data(res.body))).toBe(true);
    });
  });

  describe("engagement canned responses", () => {
    it("create → update → delete", async () => {
      const create = await api.post("/api/v1/engagement/canned-responses").send({ title: "E2E Canned", body: "Hello there", visibility: "ORG", channel: "SMS" });
      okStatus(create.status);
      const id = data(create.body).id;
      okStatus((await api.patch(`/api/v1/engagement/canned-responses/${id}`).send({ title: "E2E Canned (edited)" })).status);
      okStatus((await api.del(`/api/v1/engagement/canned-responses/${id}`)).status);
    });
  });

  describe("engagement surveys", () => {
    it("create → read → update → delete", async () => {
      const create = await api.post("/api/v1/engagement/surveys").send({
        name: "E2E Survey",
        questions: [{ prompt: "Support?", type: "single_choice", options: [{ value: "yes", label: "Yes" }] }],
      });
      okStatus(create.status);
      const id = data(create.body).id;
      okStatus((await api.get(`/api/v1/engagement/surveys/${id}`)).status);
      okStatus((await api.patch(`/api/v1/engagement/surveys/${id}`).send({ name: "E2E Survey (edited)" })).status);
      okStatus((await api.del(`/api/v1/engagement/surveys/${id}`)).status);
    });
  });

  describe("engagement scripts", () => {
    it("create → update → delete", async () => {
      const create = await api.post("/api/v1/engagement/scripts").send({ name: "E2E Script", channel: "BOTH", steps: [{ bodyText: "Hi", orderIndex: 0 }] });
      okStatus(create.status);
      const id = data(create.body).id;
      okStatus((await api.patch(`/api/v1/engagement/scripts/${id}`).send({ name: "E2E Script (edited)" })).status);
      okStatus((await api.del(`/api/v1/engagement/scripts/${id}`)).status);
    });
  });

  // ── Inbox / journeys / analytics / contacts / audiences / blasts ─
  describe("conversations + automation + reporting", () => {
    it("inbox conversations", async () => okStatus((await api.get("/api/v1/inbox/conversations")).status));
    it("journeys list", async () => okStatus((await api.get("/api/v1/journeys")).status));
    it("analytics dashboard", async () => {
      okStatus((await api.get("/api/v1/analytics/dashboard/recent-blasts")).status);
      okStatus((await api.get("/api/v1/analytics/dashboard/performance")).status);
    });
    it("contacts list + detail", async () => {
      okStatus((await api.get("/api/v1/contacts?query=Ada")).status);
      if (ids.contactId) okStatus((await api.get(`/api/v1/contacts/${ids.contactId}`)).status);
    });
    it("audiences list + create", async () => {
      okStatus((await api.get("/api/v1/audiences")).status);
      okStatus((await api.post("/api/v1/audiences").send({ name: `E2E Audience ${Date.now()}`, source: "CSV" })).status);
    });
    it("blasts list", async () => okStatus((await api.get("/api/v1/blasts")).status));
  });

  // ── WhatsApp audiences ────────────────────────────────────────
  describe("whatsapp audiences", () => {
    let waAudienceId: string;
    it("create a channel=WHATSAPP audience", async () => {
      const res = await api.post("/api/v1/audiences").send({ name: `E2E WA ${Date.now()}`, source: "MANUAL", channel: "WHATSAPP" });
      okStatus(res.status);
      expect(data(res.body).channel).toBe("WHATSAPP");
      waAudienceId = data(res.body).id;
    });
    it("ensure the smart opt-in audience (idempotent)", async () => {
      const a = await api.post("/api/v1/audiences/whatsapp-opt-ins");
      okStatus(a.status);
      const b = await api.post("/api/v1/audiences/whatsapp-opt-ins");
      okStatus(b.status);
      expect(data(a.body).id).toBe(data(b.body).id); // idempotent
      expect(data(a.body).kind).toBe("WHATSAPP_OPTED_IN");
    });
    it("list filtered by channel=WHATSAPP excludes SMS-only", async () => {
      await api.post("/api/v1/audiences").send({ name: `E2E SMS ${Date.now()}`, source: "MANUAL", channel: "SMS" });
      const res = await api.get("/api/v1/audiences?channel=WHATSAPP");
      okStatus(res.status);
      const rows = (data(res.body).rows ?? []) as Array<{ channel: string }>;
      expect(rows.every((r) => r.channel === "WHATSAPP" || r.channel === "ALL")).toBe(true);
    });
    it("whatsapp-reach returns total + reachable", async () => {
      const res = await api.get(`/api/v1/audiences/${waAudienceId}/whatsapp-reach`);
      okStatus(res.status);
      expect(data(res.body)).toHaveProperty("total");
      expect(data(res.body)).toHaveProperty("reachable");
    });
  });

  // ── Compliance / integrations / push ──────────────────────────
  describe("compliance + integrations + push", () => {
    it("compliance opt-outs", async () => okStatus((await api.get("/api/v1/compliance/opt-outs")).status));
    it("integrations connections", async () => okStatus((await api.get("/api/v1/integrations/connections")).status));
    it("push config", async () => okStatus((await api.get("/api/v1/push/config")).status));
  });
});
